/**
 * @module collaboration
 * @description Owns the [feature:collaboration] menu, race-safe snapshot synchronization, conflict recovery, and `kt-collaboration-recovery-v1` storage key.
 */

/** Local-only conflict recovery storage key. @type {string} */
export const RECOVERY_STORAGE_KEY = 'kt-collaboration-recovery-v1';
export const SYNC_STATES = Object.freeze(['Local only', 'Connecting', 'Saving', 'Synced', 'Offline', 'Conflict']);
const SAVE_DELAY_MS = 700;
const POLL_DELAY_MS = 2500;
const SESSION_ENDPOINT = '/api/workspaces/session';

/**
 * Creates the shared-session controller with injectable browser and network dependencies.
 * @param {object} options - Browser and application dependencies.
 * @returns {object} Collaboration controller.
 */
export function createCollaborationController({
  collect, apply, saveLocal, fetchImpl = globalThis.fetch?.bind(globalThis),
  location = globalThis.location, history = globalThis.history,
  storage = globalThis.localStorage, documentRef = globalThis.document,
  setTimeoutImpl = globalThis.setTimeout, clearTimeoutImpl = globalThis.clearTimeout,
  toast = () => {}
}) {
  let token = null;
  let revision = 0;
  let saveTimer = null;
  let pollTimer = null;
  let pendingSave = null;
  let inFlightSave = null;
  let applyingRemote = false;
  let conflicted = false;
  let pollingStopped = false;
  let sessionEpoch = 0;
  const activeLocation = location || documentRef?.location;
  const activeHistory = history || documentRef?.defaultView?.history;

  const element = id => documentRef?.getElementById(id) || null;
  const setState = state => {
    const indicator = element('collaborationStatus');
    if (indicator) {
      indicator.textContent = state;
      indicator.dataset.state = state.toLowerCase().replaceAll(' ', '-');
    }
  };
  const updateActions = () => {
    if (element('startCollaborationBtn')) element('startCollaborationBtn').disabled = Boolean(token);
    if (element('copyCollaborationLinkBtn')) element('copyCollaborationLinkBtn').disabled = !token;
    if (element('leaveCollaborationBtn')) element('leaveCollaborationBtn').disabled = !token;
    if (element('collaborationConflictActions')) element('collaborationConflictActions').hidden = !conflicted;
  };
  const authorizationHeaders = extra => ({ ...extra, Authorization: `Bearer ${token}` });
  const schedulePoll = () => {
    clearTimeoutImpl(pollTimer);
    if (!token || conflicted || pollingStopped || documentRef?.hidden) return;
    pollTimer = setTimeoutImpl(poll, POLL_DELAY_MS);
  };
  const request = async (url, options) => {
    const response = await fetchImpl(url, options);
    const body = await response.json().catch(() => ({}));
    return { response, body };
  };
  const preserveConflict = snapshot => {
    clearTimeoutImpl(saveTimer);
    pendingSave = null;
    const recoverySnapshot = snapshot || collect();
    storage?.setItem(RECOVERY_STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), snapshot: recoverySnapshot }));
    conflicted = true;
    setState('Conflict');
    updateActions();
  };
  const handleUnavailable = status => {
    if (status === 400 || status === 401) {
      pollingStopped = true; setState('Invalid collaboration link');
      toast('This collaboration link is invalid. Your local copy is safe.');
      return true;
    }
    if (status === 404) {
      pollingStopped = true; setState('Missing or expired session');
      toast('This shared session is missing or expired. Your local copy is safe.');
      return true;
    }
    if (status >= 500) {
      setState('Temporary server error');
      return true;
    }
    return false;
  };
  const applyIncoming = workspace => {
    if (!workspace || workspace.revision <= revision) return false;
    if (pendingSave || inFlightSave) {
      preserveConflict(collect());
      return false;
    }
    clearTimeoutImpl(saveTimer);
    applyingRemote = true;
    try {
      apply(workspace.snapshot);
      saveLocal(workspace.snapshot);
      revision = Math.max(revision, workspace.revision);
    } finally {
      applyingRemote = false;
    }
    setState('Synced');
    return true;
  };
  const loadNewest = async () => {
    if (!token) return false;
    const epoch = sessionEpoch;
    setState('Connecting');
    try {
      const { response, body } = await request(SESSION_ENDPOINT, { headers: authorizationHeaders({ Accept: 'application/json' }) });
      if (epoch !== sessionEpoch || !token) return false;
      if (response.status === 409) { preserveConflict(collect()); return false; }
      if (!response.ok) {
        handleUnavailable(response.status);
        if (!pollingStopped) schedulePoll();
        return false;
      }
      conflicted = false;
      pollingStopped = false;
      const applied = applyIncoming(body);
      if (!conflicted) {
        revision = Math.max(revision, body.revision);
        setState('Synced'); updateActions(); schedulePoll();
      }
      return applied;
    } catch {
      if (epoch !== sessionEpoch || !token) return false;
      setState('Offline'); schedulePoll(); return false;
    }
  };
  /** Polls once for a newer shared revision and schedules the next attempt. @returns {Promise<void>} */
  async function poll() {
    if (!token || conflicted || pollingStopped || documentRef?.hidden) return;
    const epoch = sessionEpoch;
    try {
      const { response, body } = await request(SESSION_ENDPOINT, { headers: authorizationHeaders({ Accept: 'application/json' }) });
      if (epoch !== sessionEpoch || !token) return;
      if (response.status === 409) preserveConflict(collect());
      else if (!response.ok) handleUnavailable(response.status);
      else {
        applyIncoming(body);
        if (!conflicted) setState('Synced');
      }
    } catch {
      if (epoch !== sessionEpoch || !token) return;
      setState('Offline');
    }
    schedulePoll();
  }
  /** Sends the next queued snapshot while enforcing a single in-flight PUT. @returns {Promise<void>} */
  async function flushSave() {
    if (!token || applyingRemote || conflicted || inFlightSave || !pendingSave) return;
    clearTimeoutImpl(saveTimer);
    const epoch = sessionEpoch;
    let shouldFlushImmediately = false;
    inFlightSave = pendingSave;
    pendingSave = null;
    setState('Saving');
    try {
      const { response, body } = await request(SESSION_ENDPOINT, {
        method: 'PUT',
        headers: authorizationHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ snapshot: inFlightSave.snapshot, revision: inFlightSave.expectedRevision })
      });
      if (epoch !== sessionEpoch || !token) return;
      if (response.status === 409) preserveConflict(pendingSave?.snapshot || collect());
      else if (!response.ok) {
        handleUnavailable(response.status);
        if (!pollingStopped && !pendingSave) pendingSave = inFlightSave;
      } else if (!conflicted) {
        revision = Math.max(revision, body.revision);
        if (pendingSave) {
          pendingSave.expectedRevision = revision;
          shouldFlushImmediately = true;
        }
        setState('Synced');
      }
    } catch {
      if (epoch !== sessionEpoch || !token) return;
      if (!pendingSave) pendingSave = inFlightSave;
      setState('Offline');
    } finally {
      if (epoch === sessionEpoch) {
        inFlightSave = null;
        if (pendingSave && !conflicted && !pollingStopped && shouldFlushImmediately) await flushSave();
        else if (pendingSave && !conflicted && !pollingStopped) saveTimer = setTimeoutImpl(flushSave, SAVE_DELAY_MS);
        else schedulePoll();
      }
    }
  }
  const notifyLocalChange = snapshot => {
    if (!token || applyingRemote || conflicted || pollingStopped) return;
    pendingSave = { snapshot, expectedRevision: revision };
    clearTimeoutImpl(saveTimer);
    if (!inFlightSave) saveTimer = setTimeoutImpl(flushSave, SAVE_DELAY_MS);
  };
  const start = async () => {
    const epoch = ++sessionEpoch;
    setState('Connecting');
    try {
      const snapshot = collect();
      const { response, body } = await request('/api/workspaces', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot })
      });
      if (epoch !== sessionEpoch) return false;
      if (!response.ok) { handleUnavailable(response.status); return false; }
      token = body.token; revision = body.revision; pollingStopped = false;
      const url = new URL(activeLocation.href); url.searchParams.set('workspace', token); activeHistory.replaceState({}, '', url);
      setState('Synced'); updateActions(); schedulePoll(); toast('Shared session started. Keep the link secret.');
      return true;
    } catch {
      if (epoch !== sessionEpoch) return false;
      setState('Offline'); toast('Could not start a shared session. Your local copy is safe.'); return false;
    }
  };
  const joinFromUrl = async () => {
    const candidate = new URL(activeLocation.href).searchParams.get('workspace');
    if (!candidate) { setState('Local only'); updateActions(); return false; }
    sessionEpoch += 1;
    token = candidate; pollingStopped = false; updateActions();
    return loadNewest();
  };
  const leave = () => {
    sessionEpoch += 1;
    clearTimeoutImpl(saveTimer); clearTimeoutImpl(pollTimer);
    token = null; revision = 0; pendingSave = null; inFlightSave = null;
    conflicted = false; pollingStopped = true;
    const url = new URL(activeLocation.href); url.searchParams.delete('workspace'); activeHistory.replaceState({}, '', url);
    setState('Local only'); updateActions(); toast('Left shared session. Local and recovery copies were kept.');
  };
  const copyLink = async () => {
    if (!token) return false;
    try { await globalThis.navigator.clipboard.writeText(activeLocation.href); toast('Collaboration link copied.'); return true; }
    catch { toast('Copy failed. Copy the current address from your browser.'); return false; }
  };
  const exportRecovery = () => {
    const recovery = storage?.getItem(RECOVERY_STORAGE_KEY);
    if (!recovery) { toast('No local recovery snapshot is available.'); return false; }
    const blob = new Blob([recovery], { type: 'application/json' });
    const href = URL.createObjectURL(blob); const anchor = documentRef.createElement('a');
    anchor.href = href; anchor.download = 'intake-collaboration-recovery.json'; anchor.click(); URL.revokeObjectURL(href);
    return true;
  };
  const init = () => {
    element('startCollaborationBtn')?.addEventListener('click', start);
    element('copyCollaborationLinkBtn')?.addEventListener('click', copyLink);
    element('leaveCollaborationBtn')?.addEventListener('click', leave);
    element('loadSharedVersionBtn')?.addEventListener('click', loadNewest);
    element('exportRecoveryBtn')?.addEventListener('click', exportRecovery);
    documentRef?.addEventListener('visibilitychange', () => { if (!documentRef.hidden) poll(); });
    return joinFromUrl();
  };
  return {
    init, start, leave, loadNewest, notifyLocalChange, copyLink, exportRecovery,
    getState: () => ({ token, revision, applyingRemote, conflicted, pollingStopped, pendingSave, inFlightSave, sessionEpoch })
  };
}

/** Initializes collaboration for the application. @param {object} options Dependencies. @returns {object} Controller. */
export function initCollaboration(options) { const controller = createCollaborationController(options); controller.init(); return controller; }
