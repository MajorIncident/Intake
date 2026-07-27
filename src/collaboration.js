/**
 * @module collaboration
 * @description Owns the [feature:collaboration] menu, lifecycle-aware whole-snapshot synchronization, diagnostics, and `kt-collaboration-recovery-v1` recovery storage.
 */

/** Local-only conflict recovery storage key. @type {string} */
export const RECOVERY_STORAGE_KEY = 'kt-collaboration-recovery-v1';
export const SYNC_STATES = Object.freeze(['Local only', 'Connecting', 'Saving', 'Synced', 'Offline', 'Retrying', 'Conflict']);
export const SAVE_DELAY_MS = 300;
export const POLL_DELAY_MS = 900;
const MAX_BACKOFF_MS = 30000;
const SESSION_ENDPOINT = '/api/workspaces/session';

/** Creates a lifecycle-aware shared-session controller. @param {object} options Dependencies. @returns {object} Controller. */
export function createCollaborationController({
  collect, apply, saveLocal, fetchImpl = globalThis.fetch?.bind(globalThis),
  location = globalThis.location, history = globalThis.history, storage = globalThis.localStorage,
  documentRef = globalThis.document, windowRef = globalThis.window, navigatorRef = globalThis.navigator,
  setTimeoutImpl, clearTimeoutImpl,
  now = () => Date.now(), toast = () => {}, diagnostics = () => {}
}) {
  const scheduleTimeout = setTimeoutImpl || windowRef?.setTimeout?.bind(windowRef) || globalThis.setTimeout;
  const cancelTimeout = clearTimeoutImpl || windowRef?.clearTimeout?.bind(windowRef) || globalThis.clearTimeout;
  let token = null; let revision = 0; let saveTimer = null; let pollTimer = null;
  let pendingSave = null; let inFlightSave = null; let inFlightSavePromise = null; let resolveInFlightSave = null; let inFlightGet = null;
  let applyingRemote = false; let conflicted = false; let pollingStopped = false;
  let sessionEpoch = 0; let requestSequence = 0; let latestAcceptedGet = 0;
  let retryDelay = POLL_DELAY_MS; let retrying = false; let lastSuccessfulSync = null; let statusTimer = null;
  let lastSnapshot = null; let conflictCount = 0; let terminalStatus = null; let initialized = false; let destroyed = false;
  const activeLocation = location || documentRef?.location;
  const activeHistory = history || documentRef?.defaultView?.history;
  const element = id => documentRef?.getElementById(id) || null;
  const online = () => navigatorRef?.onLine !== false;
  const changedSections = snapshot => Object.keys(snapshot || {}).filter(key => JSON.stringify(snapshot?.[key]) !== JSON.stringify(lastSnapshot?.[key]));
  const emitDiagnostic = (type, started, sections = []) => diagnostics({ type, revision, durationMs: Math.max(0, now() - started), changedSections: sections, lastSuccessfulSync, conflictCount });
  const relativeSync = () => {
    if (!lastSuccessfulSync) return '';
    const seconds = Math.max(0, Math.floor((now() - lastSuccessfulSync) / 1000));
    return seconds < 2 ? 'Synced just now' : `Synced ${seconds} seconds ago`;
  };
  const renderStatus = state => {
    const indicator = element('collaborationStatus');
    if (!indicator) return;
    let text = terminalStatus || state;
    if (terminalStatus) text = terminalStatus;
    else if (conflicted) text = 'Conflict · Review required';
    else if (!online()) text = 'Offline · Changes kept locally';
    else if (state === 'Saving' || pendingSave || inFlightSave) text = 'Saving changes…';
    else if (retrying) text = 'Retrying…';
    else if (token && state === 'Synced') text = `Shared · Revision ${revision}`;
    indicator.textContent = text;
    indicator.dataset.state = (conflicted ? 'conflict' : state).toLowerCase().replaceAll(' ', '-');
    const detail = element('collaborationSyncDetail'); if (detail) detail.textContent = relativeSync();
    const sync = element('syncCollaborationBtn'); if (sync) sync.disabled = !token || conflicted;
  };
  const updateActions = () => {
    if (element('startCollaborationBtn')) element('startCollaborationBtn').disabled = Boolean(token);
    if (element('copyCollaborationLinkBtn')) element('copyCollaborationLinkBtn').disabled = !token;
    if (element('leaveCollaborationBtn')) element('leaveCollaborationBtn').disabled = !token;
    if (element('collaborationConflictActions')) element('collaborationConflictActions').hidden = !conflicted;
    renderStatus(token ? 'Synced' : 'Local only');
  };
  const authorizationHeaders = extra => ({ ...extra, Authorization: `Bearer ${token}` });
  const markSuccess = () => { terminalStatus = null; lastSuccessfulSync = now(); retryDelay = POLL_DELAY_MS; retrying = false; renderStatus('Synced'); };
  const markRetry = offline => { retrying = true; retryDelay = Math.min(MAX_BACKOFF_MS, Math.max(POLL_DELAY_MS * 2, retryDelay * 2)); renderStatus(offline ? 'Offline' : 'Retrying'); };
  const schedulePoll = () => {
    cancelTimeout(pollTimer);
    if (destroyed || !token || conflicted || pollingStopped || documentRef?.hidden || !online()) return;
    pollTimer = scheduleTimeout(poll, retrying ? retryDelay : POLL_DELAY_MS);
  };
  const request = async (url, options) => {
    const response = await fetchImpl(url, options);
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    return { response, body };
  };
  const preserveConflict = snapshot => {
    cancelTimeout(saveTimer); pendingSave = null;
    storage?.setItem(RECOVERY_STORAGE_KEY, JSON.stringify({ savedAt: new Date(now()).toISOString(), snapshot: snapshot || collect() }));
    conflicted = true; conflictCount += 1; renderStatus('Conflict'); updateActions();
  };
  const unavailable = status => {
    if (status === 400 || status === 401) { pollingStopped = true; terminalStatus = 'Invalid collaboration link'; renderStatus(terminalStatus); toast('This collaboration link is invalid. Your local copy is safe.'); return; }
    if (status === 404) { pollingStopped = true; terminalStatus = 'Missing or expired session'; renderStatus(terminalStatus); toast('This shared session is missing or expired. Your local copy is safe.'); return; }
    if (status >= 500) markRetry(false);
  };
  const applyIncoming = workspace => {
    if (!workspace || workspace.revision <= revision) return false;
    if (pendingSave || inFlightSave) { preserveConflict(collect()); return false; }
    applyingRemote = true;
    try { apply(workspace.snapshot); saveLocal(workspace.snapshot); revision = workspace.revision; lastSnapshot = workspace.snapshot; }
    finally { applyingRemote = false; }
    return true;
  };
  /** Polls once, coalescing concurrent callers and ignoring stale completions. @returns {Promise<boolean>} Whether a newer snapshot was applied. */
  async function poll() {
    if (!token || conflicted || pollingStopped || documentRef?.hidden) return false;
    if (!online()) { renderStatus('Offline'); return false; }
    if (inFlightGet) return inFlightGet;
    const epoch = sessionEpoch; const sequence = ++requestSequence; const started = now(); const requestedRevision = revision;
    const operation = (async () => {
      try {
        const url = requestedRevision > 0
          ? `${SESSION_ENDPOINT}?afterRevision=${encodeURIComponent(requestedRevision)}`
          : SESSION_ENDPOINT;
        const { response, body } = await request(url, { headers: authorizationHeaders({ Accept: 'application/json' }) });
        if (epoch !== sessionEpoch || sequence < latestAcceptedGet || !token) return false;
        latestAcceptedGet = sequence;
        if (response.status === 204) { markSuccess(); return false; }
        if (response.status === 409) preserveConflict(collect());
        else if (!response.ok) unavailable(response.status);
        else { const applied = applyIncoming(body); if (!conflicted) { revision = Math.max(revision, body.revision); markSuccess(); } return applied; }
      } catch { if (epoch === sessionEpoch && token) markRetry(true); }
      finally { emitDiagnostic('GET', started); }
      return false;
    })();
    inFlightGet = operation;
    try { return await operation; } finally { if (inFlightGet === operation) inFlightGet = null; schedulePoll(); }
  }
  /** Flushes the queued snapshot while enforcing one PUT. @returns {Promise<void>} */
  async function flushSave() {
    cancelTimeout(saveTimer);
    if (inFlightSave) return inFlightSavePromise;
    if (!token || applyingRemote || conflicted || !pendingSave) return;
    if (!online()) { renderStatus('Offline'); return; }
    const epoch = sessionEpoch; const saving = pendingSave; const sections = saving.changedSections; pendingSave = null; inFlightSave = saving;
    inFlightSavePromise = new Promise(resolve => { resolveInFlightSave = resolve; });
    renderStatus('Saving'); const started = now();
    try {
      const { response, body } = await request(SESSION_ENDPOINT, { method: 'PUT', headers: authorizationHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ snapshot: saving.snapshot, revision: saving.expectedRevision }) });
      if (epoch !== sessionEpoch || !token || conflicted) return;
      if (response.status === 409) preserveConflict(pendingSave?.snapshot || collect());
      else if (!response.ok) { unavailable(response.status); if (!pollingStopped && !pendingSave) pendingSave = saving; }
      else { revision = Math.max(revision, body.revision); lastSnapshot = saving.snapshot; markSuccess(); if (pendingSave) pendingSave.expectedRevision = revision; }
    } catch { if (epoch === sessionEpoch && token) { if (!pendingSave) pendingSave = saving; markRetry(true); } }
    finally {
      emitDiagnostic('PUT', started, sections);
      if (epoch === sessionEpoch) { inFlightSave = null; resolveInFlightSave?.(); resolveInFlightSave = null; inFlightSavePromise = null; if (pendingSave && !conflicted && !pollingStopped) saveTimer = scheduleTimeout(flushSave, retrying ? retryDelay : 0); else schedulePoll(); }
    }
  }
  const notifyLocalChange = (snapshot, { immediate = false } = {}) => {
    if (!token || applyingRemote || conflicted || pollingStopped) return;
    pendingSave = { snapshot, expectedRevision: revision, changedSections: changedSections(snapshot) }; cancelTimeout(saveTimer); renderStatus('Saving');
    if (!inFlightSave) saveTimer = scheduleTimeout(flushSave, immediate ? 0 : SAVE_DELAY_MS);
  };
  const loadNewest = async () => { terminalStatus = null; conflicted = false; pollingStopped = false; updateActions(); return poll(); };
  const activate = async () => { if (!token) return false; const checked = await poll(); await flushSave(); schedulePoll(); return checked; };
  const syncNow = async () => { await flushSave(); return poll(); };
  const start = async () => {
    const epoch = ++sessionEpoch; terminalStatus = null; renderStatus('Connecting'); const snapshot = collect(); const started = now();
    try {
      const { response, body } = await request('/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot }) });
      if (epoch !== sessionEpoch) return false; if (!response.ok) { unavailable(response.status); return false; }
      token = body.token; revision = body.revision; lastSnapshot = snapshot; pollingStopped = false;
      const url = new URL(activeLocation.href); url.searchParams.set('workspace', token); activeHistory.replaceState({}, '', url);
      markSuccess(); updateActions(); schedulePoll(); toast('Shared session started. Keep the link secret.'); return true;
    } catch { if (epoch === sessionEpoch) { markRetry(true); toast('Could not start a shared session. Your local copy is safe.'); } return false; }
    finally { emitDiagnostic('POST', started); }
  };
  const joinFromUrl = async () => { const candidate = new URL(activeLocation.href).searchParams.get('workspace'); if (!candidate) { updateActions(); return false; } sessionEpoch += 1; terminalStatus = null; token = candidate; pollingStopped = false; updateActions(); return poll(); };
  const leave = () => { sessionEpoch += 1; cancelTimeout(saveTimer); cancelTimeout(pollTimer); terminalStatus = null; token = null; revision = 0; pendingSave = null; inFlightSave = null; resolveInFlightSave?.(); resolveInFlightSave = null; inFlightSavePromise = null; inFlightGet = null; conflicted = false; pollingStopped = true; retrying = false; const url = new URL(activeLocation.href); url.searchParams.delete('workspace'); activeHistory.replaceState({}, '', url); updateActions(); toast('Left shared session. Local and recovery copies were kept.'); };
  const copyLink = async () => { if (!token) return false; try { await navigatorRef.clipboard.writeText(activeLocation.href); toast('Collaboration link copied.'); return true; } catch { toast('Copy failed. Copy the current address from your browser.'); return false; } };
  const exportRecovery = () => { const recovery = storage?.getItem(RECOVERY_STORAGE_KEY); if (!recovery) { toast('No local recovery snapshot is available.'); return false; } const blob = new Blob([recovery], { type: 'application/json' }); const href = URL.createObjectURL(blob); const anchor = documentRef.createElement('a'); anchor.href = href; anchor.download = 'intake-collaboration-recovery.json'; anchor.click(); URL.revokeObjectURL(href); return true; };
  const handleVisibilityChange = () => { if (!documentRef.hidden) activate(); };
  const handleFocusOut = () => { flushSave(); };
  const handleFocus = () => { activate(); };
  const handlePageShow = () => { activate(); };
  const handleOnline = () => { activate(); };
  const handleOffline = () => { renderStatus('Offline'); };
  const refreshStatus = () => {
    if (destroyed) return;
    renderStatus(token ? 'Synced' : 'Local only');
    statusTimer = scheduleTimeout(refreshStatus, 1000);
  };
  const init = () => {
    if (initialized || destroyed) return Promise.resolve(false);
    initialized = true;
    element('startCollaborationBtn')?.addEventListener('click', start); element('copyCollaborationLinkBtn')?.addEventListener('click', copyLink); element('leaveCollaborationBtn')?.addEventListener('click', leave); element('syncCollaborationBtn')?.addEventListener('click', syncNow); element('loadSharedVersionBtn')?.addEventListener('click', loadNewest); element('exportRecoveryBtn')?.addEventListener('click', exportRecovery);
    documentRef?.addEventListener('visibilitychange', handleVisibilityChange);
    documentRef?.addEventListener('focusout', handleFocusOut);
    windowRef?.addEventListener('focus', handleFocus); windowRef?.addEventListener('pageshow', handlePageShow); windowRef?.addEventListener('online', handleOnline); windowRef?.addEventListener('offline', handleOffline);
    statusTimer = scheduleTimeout(refreshStatus, 1000);
    return joinFromUrl();
  };
  /** Tears down timers, listeners, and session work. Safe to call repeatedly. @returns {void} */
  const destroy = () => {
    if (destroyed) return;
    destroyed = true; sessionEpoch += 1; pollingStopped = true;
    cancelTimeout(saveTimer); cancelTimeout(pollTimer); cancelTimeout(statusTimer);
    saveTimer = null; pollTimer = null; statusTimer = null; pendingSave = null; inFlightGet = null;
    resolveInFlightSave?.(); resolveInFlightSave = null; inFlightSave = null; inFlightSavePromise = null;
    element('startCollaborationBtn')?.removeEventListener('click', start); element('copyCollaborationLinkBtn')?.removeEventListener('click', copyLink); element('leaveCollaborationBtn')?.removeEventListener('click', leave); element('syncCollaborationBtn')?.removeEventListener('click', syncNow); element('loadSharedVersionBtn')?.removeEventListener('click', loadNewest); element('exportRecoveryBtn')?.removeEventListener('click', exportRecovery);
    documentRef?.removeEventListener('visibilitychange', handleVisibilityChange); documentRef?.removeEventListener('focusout', handleFocusOut);
    windowRef?.removeEventListener('focus', handleFocus); windowRef?.removeEventListener('pageshow', handlePageShow); windowRef?.removeEventListener('online', handleOnline); windowRef?.removeEventListener('offline', handleOffline);
  };
  return { init, destroy, start, leave, loadNewest, poll, flushSave, syncNow, notifyLocalChange, copyLink, exportRecovery, getState: () => ({ token, revision, applyingRemote, conflicted, pollingStopped, pendingSave, inFlightSave, inFlightGet, sessionEpoch, retryDelay, retrying, lastSuccessfulSync, terminalStatus, destroyed }) };
}

/** Initializes collaboration. @param {object} options Dependencies. @returns {object} Controller. */
export function initCollaboration(options) { const controller = createCollaborationController(options); controller.init(); return controller; }
