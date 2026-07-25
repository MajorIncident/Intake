/**
 * @module collaboration
 * @description Owns the [feature:collaboration] menu, snapshot synchronization, conflict recovery, and `kt-collaboration-recovery-v1` storage key.
 */

/** Local-only conflict recovery storage key. @type {string} */
export const RECOVERY_STORAGE_KEY = 'kt-collaboration-recovery-v1';
export const SYNC_STATES = Object.freeze(['Local only', 'Connecting', 'Saving', 'Synced', 'Offline', 'Conflict']);
const SAVE_DELAY_MS = 700;
const POLL_DELAY_MS = 2500;

/** Creates the shared-session controller with injectable browser and network dependencies. @param {object} options Dependencies. @returns {object} Collaboration controller. */
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
  let applyingRemote = false;
  let conflicted = false;
  const activeLocation = location || documentRef?.location;
  const activeHistory = history || documentRef?.defaultView?.history;

  const element = id => documentRef?.getElementById(id) || null;
  const setState = state => {
    const indicator = element('collaborationStatus');
    if (indicator) { indicator.textContent = state; indicator.dataset.state = state.toLowerCase().replace(' ', '-'); }
  };
  const updateActions = () => {
    if (element('startCollaborationBtn')) element('startCollaborationBtn').disabled = Boolean(token);
    if (element('copyCollaborationLinkBtn')) element('copyCollaborationLinkBtn').disabled = !token;
    if (element('leaveCollaborationBtn')) element('leaveCollaborationBtn').disabled = !token;
    if (element('collaborationConflictActions')) element('collaborationConflictActions').hidden = !conflicted;
  };
  const endpoint = () => `/api/workspaces/${encodeURIComponent(token)}`;
  const schedulePoll = () => {
    clearTimeoutImpl(pollTimer);
    if (!token || documentRef?.hidden) return;
    pollTimer = setTimeoutImpl(poll, POLL_DELAY_MS);
  };
  const request = async (url, options) => {
    const response = await fetchImpl(url, options);
    const body = await response.json().catch(() => ({}));
    return { response, body };
  };
  const applyIncoming = workspace => {
    if (!workspace || workspace.revision <= revision) return false;
    applyingRemote = true;
    try { apply(workspace.snapshot); saveLocal(workspace.snapshot); revision = workspace.revision; }
    finally { applyingRemote = false; }
    setState('Synced');
    return true;
  };
  const loadNewest = async () => {
    if (!token) return false;
    setState('Connecting');
    try {
      const { response, body } = await request(endpoint(), { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('load');
      conflicted = false;
      const applied = applyIncoming(body);
      revision = body.revision;
      setState('Synced'); updateActions(); schedulePoll();
      return applied;
    } catch { setState('Offline'); schedulePoll(); return false; }
  };
  /** Polls once for a newer shared revision and schedules the next attempt. @returns {Promise<void>} */
  async function poll() {
    if (!token || conflicted || documentRef?.hidden) return;
    try {
      const { response, body } = await request(endpoint(), { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('poll');
      applyIncoming(body);
      setState('Synced');
    } catch { setState('Offline'); }
    schedulePoll();
  }
  /** Conditionally saves a local snapshot at the current revision. @param {object} snapshot Complete snapshot. @returns {Promise<void>} */
  async function saveRemote(snapshot) {
    if (!token || applyingRemote || conflicted) return;
    setState('Saving');
    try {
      const { response, body } = await request(endpoint(), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot, revision })
      });
      if (response.status === 409) {
        storage?.setItem(RECOVERY_STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), snapshot }));
        conflicted = true; setState('Conflict'); updateActions();
        return;
      }
      if (!response.ok) throw new Error('save');
      revision = body.revision; setState('Synced');
    } catch { setState('Offline'); }
    schedulePoll();
  }
  const notifyLocalChange = snapshot => {
    if (!token || applyingRemote || conflicted) return;
    clearTimeoutImpl(saveTimer);
    saveTimer = setTimeoutImpl(() => saveRemote(snapshot), SAVE_DELAY_MS);
  };
  const start = async () => {
    setState('Connecting');
    try {
      const snapshot = collect();
      const { response, body } = await request('/api/workspaces', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot })
      });
      if (!response.ok) throw new Error('create');
      token = body.token; revision = body.revision;
      const url = new URL(activeLocation.href); url.searchParams.set('workspace', token); activeHistory.replaceState({}, '', url);
      setState('Synced'); updateActions(); schedulePoll(); toast('Shared session started. Keep the link secret.');
      return true;
    } catch { setState('Offline'); toast('Could not start a shared session. Your local copy is safe.'); return false; }
  };
  const joinFromUrl = async () => {
    const candidate = new URL(activeLocation.href).searchParams.get('workspace');
    if (!candidate) { setState('Local only'); updateActions(); return false; }
    token = candidate; updateActions();
    return loadNewest();
  };
  const leave = () => {
    clearTimeoutImpl(saveTimer); clearTimeoutImpl(pollTimer);
    token = null; revision = 0; conflicted = false;
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
  return { init, start, leave, loadNewest, notifyLocalChange, copyLink, exportRecovery, getState: () => ({ token, revision, applyingRemote, conflicted }) };
}

/** Initializes collaboration for the application. @param {object} options Dependencies. @returns {object} Controller. */
export function initCollaboration(options) { const controller = createCollaborationController(options); controller.init(); return controller; }
