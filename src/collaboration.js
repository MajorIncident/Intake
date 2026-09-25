/**
 * @module collaboration
 * @description Owns the [feature:collaboration] menu, participant presence and field-editing indicators, shared tab title, lifecycle-aware whole-snapshot synchronization, diagnostics, and recovery storage.
 */

/** Local-only conflict recovery storage key. @type {string} */
export const RECOVERY_STORAGE_KEY = 'kt-collaboration-recovery-v1';
/** Local collaboration identity preference, intentionally excluded from intake snapshots. @type {string} */
export const PROFILE_STORAGE_KEY = 'kt-collaboration-profile-v1';
export const SYNC_STATES = Object.freeze(['Local only', 'Connecting', 'Saving', 'Synced', 'Offline', 'Retrying', 'Conflict']);
export const SAVE_DELAY_MS = 300;
export const POLL_DELAY_MS = 900;
export const PRESENCE_DELAY_MS = 2000;
export const TYPING_IDLE_DELAY_MS = 1500;
export const PARTICIPANT_IDLE_DELAY_MS = 30000;
const ROSTER_VISIBLE_LIMIT = 6;
const MAX_BACKOFF_MS = 30000;
const SESSION_ENDPOINT = '/api/workspaces/session';
const PRESENCE_ENDPOINT = '/api/workspaces/presence';

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
  let teamName = 'Shared intake'; let participants = []; let self = null; let joinedPresence = false;
  let editingField = ''; let activityState = 'active'; let activitySequence = 0; let desiredPresence = null; let acknowledgedPresenceSequence = -1;
  let presenceTimer = null; let typingTimer = null; let idleTimer = null; let inFlightPresence = null; let dialogMode = null; let dialogReturnFocus = null; let dialogFocusTimer = null;
  let rosterExpanded = false; let lastAnnouncedCollision = '';
  let baseDocumentTitle = documentRef?.title || 'KT Intake'; let lastCollaborationTitle = '';
  const activeLocation = location || documentRef?.location;
  const activeHistory = history || documentRef?.defaultView?.history;
  const element = id => documentRef?.getElementById(id) || null;
  const online = () => navigatorRef?.onLine !== false;
  const createParticipantId = () => globalThis.crypto?.randomUUID?.() || '00000000-0000-4000-8000-000000000000'.replace(/[08]/g, character => (Number(character) ^ Math.random() * 16 >> Number(character) / 4).toString(16));
  /** Reads the local-only collaboration identity without touching intake state. @returns {{participantId:string,displayName:string}} Profile. */
  const readProfile = () => {
    try {
      const saved = JSON.parse(storage?.getItem(PROFILE_STORAGE_KEY) || '{}');
      return { participantId: typeof saved.participantId === 'string' ? saved.participantId : createParticipantId(), displayName: typeof saved.displayName === 'string' ? saved.displayName : '' };
    } catch { return { participantId: createParticipantId(), displayName: '' }; }
  };
  let profile = readProfile();
  const participantColor = id => `hsl(${[...String(id)].reduce((total, character) => total + character.charCodeAt(0), 0) % 360} 68% 42%)`;
  const fieldLabel = fieldId => {
    const control = element(fieldId); if (!control) return '';
    const explicit = documentRef?.querySelector?.(`label[for="${globalThis.CSS?.escape?.(fieldId) || fieldId}"]`)?.textContent;
    return String(explicit || control.getAttribute?.('aria-label') || control.closest?.('.field, .card')?.querySelector?.('label, h2, h3, h4, summary')?.textContent || fieldId).trim().replace(/\s+/g, ' ').slice(0, 80);
  };
  const relativeActivity = participant => {
    const stamp = Date.parse(participant.lastActiveAt || participant.lastSeenAt || '');
    if (!Number.isFinite(stamp)) return '';
    const minutes = Math.max(0, Math.floor((now() - stamp) / 60000));
    return minutes < 1 ? 'just now' : minutes >= 5 ? '5m+' : `${minutes}m`;
  };
  /** Persists the local-only collaboration identity preference. @returns {void} */
  const saveProfile = () => storage?.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
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
    else if (state === 'Offline') text = 'Offline · Changes kept locally';
    else if (state === 'Saving' || pendingSave || inFlightSave) text = 'Saving changes…';
    else if (retrying) text = 'Retrying…';
    else if (token && state === 'Synced') text = `Shared · Revision ${revision}`;
    indicator.textContent = text;
    indicator.dataset.state = (conflicted ? 'conflict' : state).toLowerCase().replaceAll(' ', '-');
    const detail = element('collaborationSyncDetail'); if (detail) detail.textContent = relativeSync();
    const sync = element('syncCollaborationBtn'); if (sync) sync.disabled = !token || conflicted;
  };
  /** Reflects the active problem and participant roster in the browser-tab title. @param {object} [snapshot] Current intake snapshot. @returns {void} */
  const renderDocumentTitle = snapshot => {
    if (!documentRef) return;
    if (!token) { documentRef.title = baseDocumentTitle; lastCollaborationTitle = ''; return; }
    let state = snapshot;
    if (!state) { try { state = collect(); } catch { state = {}; } }
    const problem = String(state?.pre?.oneLine || '').trim().replace(/\s+/g, ' ');
    const subject = (problem || teamName || 'Shared intake').slice(0, 70);
    const visibleNames = participants.slice(0, 4).map(participant => participant.displayName);
    const remainder = participants.length - visibleNames.length;
    const memberLabel = visibleNames.length ? `${visibleNames.join(', ')}${remainder > 0 ? ` +${remainder}` : ''}` : teamName;
    lastCollaborationTitle = `${subject} · ${memberLabel} · KT Intake`;
    documentRef.title = lastCollaborationTitle;
  };
  const renderPresence = ({ stale = false, snapshot } = {}) => {
    const workspace = element('collaborationWorkspace');
    if (workspace) workspace.hidden = !token;
    const team = element('collaborationTeamName'); if (team) team.textContent = teamName || 'Shared intake';
    const list = element('collaborationParticipants');
    if (list) {
      list.replaceChildren();
      participants.forEach((participant, index) => {
        const item = documentRef.createElement('li'); item.className = 'collaboration-participant';
        const isSelf = participant.id === self?.id; item.dataset.self = String(isSelf);
        const state = participant.activityState || (participant.editingField ? 'editing' : 'active');
        item.dataset.state = state; item.style.setProperty('--participant-color', participantColor(participant.id));
        if (!rosterExpanded && index >= ROSTER_VISIBLE_LIMIT) item.hidden = true;
        const avatar = documentRef.createElement('span'); avatar.className = 'collaboration-participant__avatar'; avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = participant.displayName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase().slice(0, 2) || '?';
        const copy = documentRef.createElement('span'); copy.className = 'collaboration-participant__copy';
        const name = documentRef.createElement('span'); name.className = 'collaboration-participant__name'; name.textContent = `${participant.displayName}${isSelf ? ' (you)' : ''}`;
        const location = fieldLabel(participant.editingField); const detail = documentRef.createElement('span'); detail.className = 'collaboration-participant__state';
        detail.textContent = state === 'editing' ? `Editing${location ? ` · ${location}` : ''}` : state === 'focused' ? `Viewing${location ? ` · ${location}` : ''}` : state === 'idle' ? `Idle${relativeActivity(participant) ? ` · ${relativeActivity(participant)}` : ''}${location ? ` · last in ${location}` : ''}` : 'Active';
        if (state === 'editing') { const dots = documentRef.createElement('span'); dots.className = 'collaboration-editing-dots'; dots.setAttribute('aria-hidden', 'true'); dots.textContent = '•••'; detail.append(dots); }
        copy.append(name, detail); item.append(avatar, copy); item.setAttribute('aria-label', `${name.textContent}, ${detail.textContent.replace('•••', '')}`); list.append(item);
      });
    }
    const toggle = element('collaborationRosterToggle'); if (toggle) { const hiddenCount = Math.max(0, participants.length - ROSTER_VISIBLE_LIMIT); toggle.hidden = hiddenCount === 0; toggle.textContent = rosterExpanded ? 'Show fewer' : `+${hiddenCount} more`; toggle.setAttribute('aria-expanded', String(rosterExpanded)); }
    const summary = element('collaborationPeopleSummary'); if (summary) summary.textContent = `${participants.length} ${participants.length === 1 ? 'person' : 'people'} here`;
    const staleLabel = element('collaborationPresenceStale'); if (staleLabel) staleLabel.hidden = !stale;
    documentRef?.querySelectorAll?.('.collaboration-editing-badge').forEach(badge => badge.remove());
    documentRef?.querySelectorAll?.('.is-collaboration-busy').forEach(control => {
      control.classList.remove('is-collaboration-busy'); control.style.removeProperty('--collaborator-color');
    });
    participants.filter(participant => participant.id !== self?.id && participant.editingField && ['editing', 'focused'].includes(participant.activityState || 'editing')).forEach(participant => {
      const control = element(participant.editingField); if (!control) return;
      const color = participantColor(participant.id); control.classList.add('is-collaboration-busy'); control.style.setProperty('--collaborator-color', color);
      const host = control.closest('.field, td, .cause-card, .card') || control.parentElement; if (!host) return;
      const badge = documentRef.createElement('span'); badge.className = 'collaboration-editing-badge'; badge.style.setProperty('--collaborator-color', color);
      const editing = (participant.activityState || 'editing') === 'editing'; badge.textContent = `${participant.displayName} is ${editing ? 'editing' : 'here'}`;
      if (editing) { const dots = documentRef.createElement('span'); dots.className = 'collaboration-editing-dots'; dots.setAttribute('aria-hidden', 'true'); dots.textContent = '•••'; badge.append(dots); }
      host.append(badge);
    });
    renderDocumentTitle(snapshot);
  };
  const acceptPresence = body => {
    if (!body) return;
    teamName = body.teamName || teamName || 'Shared intake';
    if (body.self) { self = body.self; profile = { participantId: body.self.id, displayName: body.self.displayName }; saveProfile(); }
    if (Array.isArray(body.participants)) participants = body.participants;
    renderPresence();
  };
  const updateActions = () => {
    if (element('startCollaborationBtn')) element('startCollaborationBtn').disabled = Boolean(token);
    if (element('copyCollaborationLinkBtn')) element('copyCollaborationLinkBtn').disabled = !token;
    if (element('leaveCollaborationBtn')) element('leaveCollaborationBtn').disabled = !token;
    if (element('editCollaborationNameBtn')) element('editCollaborationNameBtn').disabled = !joinedPresence;
    if (element('editCollaborationTeamBtn')) element('editCollaborationTeamBtn').disabled = !joinedPresence;
    if (element('collaborationConflictActions')) element('collaborationConflictActions').hidden = !conflicted;
    renderStatus(token ? 'Synced' : 'Local only'); renderPresence({ stale: !online() });
  };
  const authorizationHeaders = extra => ({ ...extra, Authorization: `Bearer ${token}` });
  const markSuccess = () => { terminalStatus = null; lastSuccessfulSync = now(); retryDelay = POLL_DELAY_MS; retrying = false; renderStatus('Synced'); };
  const markRetry = offline => { retrying = true; retryDelay = Math.min(MAX_BACKOFF_MS, Math.max(POLL_DELAY_MS * 2, retryDelay * 2)); renderStatus(offline ? 'Offline' : 'Retrying'); };
  const schedulePoll = () => {
    cancelTimeout(pollTimer);
    if (destroyed || !token || conflicted || pollingStopped || documentRef?.hidden || !online()) return;
    pollTimer = scheduleTimeout(poll, retrying ? retryDelay : POLL_DELAY_MS);
  };
  const schedulePresence = () => {
    cancelTimeout(presenceTimer);
    if (destroyed || !token || !joinedPresence || pollingStopped || documentRef?.hidden || !online()) return;
    presenceTimer = scheduleTimeout(heartbeat, PRESENCE_DELAY_MS);
  };
  const request = async (url, options) => {
    const response = await fetchImpl(url, options);
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    return { response, body };
  };
  /** Registers or refreshes this browser's participant record without touching snapshot revisions. @param {string} [displayName] Optional replacement name. @returns {Promise<boolean>} Whether presence was refreshed. */
  async function heartbeat(displayName = profile.displayName, activity = editingField, state = activityState) {
    if (!token || !joinedPresence || documentRef?.hidden || !online()) { renderPresence({ stale: !online() }); return false; }
    desiredPresence = { displayName, editingField: activity, activityState: state, activitySequence: ++activitySequence };
    if (inFlightPresence) return inFlightPresence;
    const epoch = sessionEpoch;
    let succeeded = false;
    const operation = (async () => {
      const sending = desiredPresence; desiredPresence = null;
      try {
        const { response, body } = await request(PRESENCE_ENDPOINT, { method: 'PUT', headers: authorizationHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ participantId: profile.participantId, ...sending, editingRevision: revision }) });
        if (epoch !== sessionEpoch || !token) return false;
        if (!response.ok) { if (response.status >= 500) renderPresence({ stale: true }); else unavailable(response.status); return false; }
        acknowledgedPresenceSequence = Math.max(acknowledgedPresenceSequence, sending.activitySequence); joinedPresence = true; acceptPresence(body); updateActions(); succeeded = true; return true;
      } catch { if (!desiredPresence) desiredPresence = sending; renderPresence({ stale: true }); return false; }
      finally { if (epoch === sessionEpoch) schedulePresence(); }
    })();
    inFlightPresence = operation;
    try { return await operation; } finally { if (inFlightPresence === operation) inFlightPresence = null; if (desiredPresence && succeeded && epoch === sessionEpoch) heartbeat(desiredPresence.displayName, desiredPresence.editingField, desiredPresence.activityState); }
  }
  /** Renames the shared team without changing the intake snapshot revision. @param {string} requestedTeamName New team name, or blank for the default. @returns {Promise<boolean>} Whether the team was renamed. */
  async function renameTeam(requestedTeamName) {
    if (!token || !joinedPresence || !online()) return false;
    try {
      const { response, body } = await request(PRESENCE_ENDPOINT, { method: 'PATCH', headers: authorizationHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ teamName: requestedTeamName }) });
      if (!response.ok) { if (response.status >= 500) renderPresence({ stale: true }); else unavailable(response.status); return false; }
      acceptPresence(body); return true;
    } catch { renderPresence({ stale: true }); return false; }
  }

  const closeDialog = () => {
    cancelTimeout(dialogFocusTimer); dialogFocusTimer = null;
    const dialog = element('collaborationDialog'); const backdrop = element('collaborationDialogBackdrop');
    if (dialog) dialog.hidden = true; if (backdrop) backdrop.hidden = true;
    documentRef?.body?.classList.remove('dialog-open'); dialogMode = null; dialogReturnFocus?.focus?.(); dialogReturnFocus = null;
  };
  const openDialog = mode => {
    const dialog = element('collaborationDialog'); if (!dialog) return false;
    dialogMode = mode; dialogReturnFocus = documentRef.activeElement;
    const title = element('collaborationDialogTitle'); const description = element('collaborationDialogDescription'); const teamField = element('collaborationTeamNameField'); const displayNameField = element('collaborationDisplayNameField'); const submit = element('collaborationDialogSubmitBtn');
    const editingTeam = mode === 'edit-team';
    if (title) title.textContent = mode === 'start' ? 'Start a shared session' : mode === 'join' ? `Join ${teamName}` : editingTeam ? 'Edit team name' : 'Edit your name';
    if (description) description.textContent = mode === 'start' ? 'Create a professional space for everyone working on this intake.' : mode === 'join' ? 'Choose how your name will appear to people in this shared workspace.' : editingTeam ? 'Choose the shared name everyone will see for this workspace.' : 'Update how your name appears in this workspace.';
    if (teamField) teamField.hidden = !['start', 'edit-team'].includes(mode);
    if (displayNameField) displayNameField.hidden = editingTeam;
    if (submit) submit.textContent = mode === 'start' ? 'Start shared session' : mode === 'join' ? 'Join workspace' : editingTeam ? 'Save team name' : 'Save name';
    const teamInput = element('collaborationTeamNameInput'); if (teamInput) teamInput.value = mode === 'start' ? '' : teamName;
    const nameInput = element('collaborationDisplayNameInput'); if (nameInput) nameInput.value = profile.displayName.startsWith('Teammate ') ? '' : profile.displayName;
    dialog.hidden = false; const backdrop = element('collaborationDialogBackdrop'); if (backdrop) backdrop.hidden = false;
    documentRef?.body?.classList.add('dialog-open'); dialogFocusTimer = scheduleTimeout(() => (['start', 'edit-team'].includes(mode) ? teamInput : nameInput)?.focus(), 0); return true;
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
        else { teamName = body.teamName || body.team_name || teamName; const applied = applyIncoming(body); renderPresence({ snapshot: body.snapshot }); if (!conflicted) { revision = Math.max(revision, body.revision); markSuccess(); } return applied; }
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
      if (epoch === sessionEpoch) {
        inFlightSave = null; resolveInFlightSave?.(); resolveInFlightSave = null; inFlightSavePromise = null;
        if (pendingSave && !conflicted && !pollingStopped && !retrying) await flushSave();
        else if (pendingSave && !conflicted && !pollingStopped) saveTimer = scheduleTimeout(flushSave, retryDelay);
        else schedulePoll();
      }
    }
  }
  const notifyLocalChange = (snapshot, { immediate = false, fieldId = '' } = {}) => {
    if (token) { if (documentRef?.title !== lastCollaborationTitle) baseDocumentTitle = documentRef.title; renderPresence({ stale: !online(), snapshot }); }
    if (!token || applyingRemote || conflicted || pollingStopped) return;
    pendingSave = { snapshot, expectedRevision: revision, changedSections: changedSections(snapshot) }; cancelTimeout(saveTimer); renderStatus('Saving');
    if (fieldId && (fieldId !== editingField || activityState !== 'editing')) { editingField = fieldId; activityState = 'editing'; heartbeat(profile.displayName, editingField, activityState); }
    if (!inFlightSave) saveTimer = scheduleTimeout(flushSave, immediate ? 0 : SAVE_DELAY_MS);
  };
  const loadNewest = async () => { terminalStatus = null; conflicted = false; pollingStopped = false; updateActions(); return poll(); };
  const activate = async () => { if (!token) return false; const checked = await poll(); await flushSave(); if (joinedPresence) await heartbeat(); schedulePoll(); return checked; };
  const syncNow = async () => { await flushSave(); const checked = await poll(); if (joinedPresence) await heartbeat(); return checked; };
  const start = async ({ requestedTeamName = '', requestedDisplayName = profile.displayName } = {}) => {
    const epoch = ++sessionEpoch; terminalStatus = null; renderStatus('Connecting'); const snapshot = collect(); const started = now();
    try {
      saveProfile();
      const { response, body } = await request('/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot, teamName: requestedTeamName, participant: { id: profile.participantId, displayName: requestedDisplayName } }) });
      if (epoch !== sessionEpoch) return false; if (!response.ok) { unavailable(response.status); return false; }
      token = body.token; revision = body.revision; lastSnapshot = snapshot; pollingStopped = false;
      joinedPresence = true; acceptPresence(body);
      const url = new URL(activeLocation.href); url.searchParams.set('workspace', token); activeHistory.replaceState({}, '', url);
      markSuccess(); updateActions(); schedulePoll(); schedulePresence(); toast('Shared session started. Keep the link secret.'); return true;
    } catch { if (epoch === sessionEpoch) { markRetry(true); toast('Could not start a shared session. Your local copy is safe.'); } return false; }
    finally { emitDiagnostic('POST', started); }
  };
  const joinPresence = async displayName => { joinedPresence = true; const refreshed = await heartbeat(displayName); if (!refreshed) joinedPresence = false; return refreshed; };
  const joinFromUrl = async () => {
    const candidate = new URL(activeLocation.href).searchParams.get('workspace'); if (!candidate) { updateActions(); return false; }
    sessionEpoch += 1; terminalStatus = null; token = candidate; pollingStopped = false; updateActions();
    const loaded = await poll();
    if (token && !pollingStopped) openDialog('join');
    return loaded;
  };
  const leave = () => {
    const leavingToken = token; const leavingParticipant = profile.participantId;
    if (leavingToken && joinedPresence && online()) request(PRESENCE_ENDPOINT, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leavingToken}` }, body: JSON.stringify({ participantId: leavingParticipant }) }).catch(() => {});
    sessionEpoch += 1; cancelTimeout(saveTimer); cancelTimeout(pollTimer); cancelTimeout(presenceTimer); closeDialog(); terminalStatus = null; token = null; revision = 0; pendingSave = null; inFlightSave = null; resolveInFlightSave?.(); resolveInFlightSave = null; inFlightSavePromise = null; inFlightGet = null; inFlightPresence = null; conflicted = false; pollingStopped = true; retrying = false; joinedPresence = false; editingField = ''; participants = []; self = null; teamName = 'Shared intake'; const url = new URL(activeLocation.href); url.searchParams.delete('workspace'); activeHistory.replaceState({}, '', url); updateActions(); toast('Left shared session. Local and recovery copies were kept.');
  };
  const copyLink = async () => { if (!token) return false; try { await navigatorRef.clipboard.writeText(activeLocation.href); toast('Collaboration link copied.'); return true; } catch { toast('Copy failed. Copy the current address from your browser.'); return false; } };
  const exportRecovery = () => { const recovery = storage?.getItem(RECOVERY_STORAGE_KEY); if (!recovery) { toast('No local recovery snapshot is available.'); return false; } const blob = new Blob([recovery], { type: 'application/json' }); const href = URL.createObjectURL(blob); const anchor = documentRef.createElement('a'); anchor.href = href; anchor.download = 'intake-collaboration-recovery.json'; anchor.click(); URL.revokeObjectURL(href); return true; };
  const handleVisibilityChange = () => {
    if (!documentRef.hidden) { activate(); return; }
    cancelTimeout(presenceTimer); cancelTimeout(typingTimer); cancelTimeout(idleTimer); renderPresence({ stale: true });
    if (token && joinedPresence && online()) {
      activityState = 'idle'; const payload = JSON.stringify({ participantId: profile.participantId, displayName: profile.displayName, editingField, editingRevision: revision, activityState, activitySequence: ++activitySequence });
      fetchImpl(PRESENCE_ENDPOINT, { method: 'PUT', headers: authorizationHeaders({ 'Content-Type': 'application/json' }), body: payload, keepalive: true }).catch(() => {});
    }
  };
  const handleFocusOut = () => { flushSave(); };
  const eligibleControl = target => target?.id && target?.matches?.('input:not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]') && !target.closest?.('[data-persistence="local-only"]');
  const announce = message => { const region = element('collaborationLiveRegion'); if (region && region.textContent !== message) region.textContent = message; };
  const publishActivity = (field, state) => {
    if (!token || !joinedPresence) return;
    editingField = field || ''; activityState = state;
    cancelTimeout(idleTimer); if (state !== 'idle') idleTimer = scheduleTimeout(() => publishActivity(editingField, 'idle'), PARTICIPANT_IDLE_DELAY_MS);
    heartbeat(profile.displayName, editingField, activityState);
  };
  const handleActivityFocusIn = event => {
    if (!eligibleControl(event.target)) return;
    publishActivity(event.target.id, 'focused');
    const colliders = participants.filter(participant => participant.id !== self?.id && participant.editingField === event.target.id && participant.activityState === 'editing');
    const collisionKey = `${event.target.id}:${colliders.map(person => person.id).join(',')}`;
    if (colliders.length && collisionKey !== lastAnnouncedCollision) { lastAnnouncedCollision = collisionKey; announce(`${colliders.map(person => person.displayName).join(' and ')} ${colliders.length === 1 ? 'is' : 'are'} also editing this field. You can continue, but simultaneous saves may require conflict review.`); }
  };
  const handleActivityInput = event => {
    if (!eligibleControl(event.target)) return;
    editingField = event.target.id; activityState = 'editing'; cancelTimeout(typingTimer); publishActivity(editingField, 'editing');
    typingTimer = scheduleTimeout(() => publishActivity(editingField, 'focused'), TYPING_IDLE_DELAY_MS);
  };
  const handleActivityFocusOut = event => {
    handleFocusOut(); if (!eligibleControl(event.target)) return;
    cancelTimeout(typingTimer); editingField = ''; activityState = 'active'; lastAnnouncedCollision = ''; publishActivity('', 'active');
  };
  const handleFocus = () => { activate(); };
  const handlePageShow = () => { activate(); };
  const handleOnline = () => { activate(); };
  const handleOffline = () => { renderStatus('Offline'); renderPresence({ stale: true }); };
  const refreshStatus = () => {
    if (destroyed) return;
    renderStatus(token ? 'Synced' : 'Local only');
    statusTimer = scheduleTimeout(refreshStatus, 1000);
  };
  const init = () => {
    if (initialized || destroyed) return Promise.resolve(false);
    initialized = true;
    const openStart = () => openDialog('start'); const openEdit = () => openDialog('edit'); const openTeamEdit = () => openDialog('edit-team');
    const submitDialog = async event => {
      event.preventDefault(); const mode = dialogMode; const requestedTeamName = element('collaborationTeamNameInput')?.value || ''; const requestedDisplayName = element('collaborationDisplayNameInput')?.value || '';
      const submit = element('collaborationDialogSubmitBtn'); if (submit) submit.disabled = true;
      let successful = false;
      if (mode === 'start') successful = await start({ requestedTeamName, requestedDisplayName });
      else if (mode === 'join') successful = await joinPresence(requestedDisplayName);
      else if (mode === 'edit') successful = await heartbeat(requestedDisplayName);
      else if (mode === 'edit-team') successful = await renameTeam(requestedTeamName);
      if (submit) submit.disabled = false;
      if (successful) { closeDialog(); if (mode === 'edit') toast('Your collaboration name was updated.'); else if (mode === 'edit-team') toast('The team name was updated.'); }
    };
    const cancelDialog = () => { if (dialogMode === 'join') leave(); else closeDialog(); };
    const handleDialogKeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); cancelDialog(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...element('collaborationDialog').querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(control => !control.closest('[hidden]'));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && documentRef.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && documentRef.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    element('startCollaborationBtn')?.addEventListener('click', openStart); element('copyCollaborationLinkBtn')?.addEventListener('click', copyLink); element('editCollaborationNameBtn')?.addEventListener('click', openEdit); element('editCollaborationNameBannerBtn')?.addEventListener('click', openEdit); element('editCollaborationTeamBtn')?.addEventListener('click', openTeamEdit); element('editCollaborationTeamBannerBtn')?.addEventListener('click', openTeamEdit); element('leaveCollaborationBtn')?.addEventListener('click', leave); element('syncCollaborationBtn')?.addEventListener('click', syncNow); element('loadSharedVersionBtn')?.addEventListener('click', loadNewest); element('exportRecoveryBtn')?.addEventListener('click', exportRecovery); element('collaborationDialogForm')?.addEventListener('submit', submitDialog); element('collaborationDialogCancelBtn')?.addEventListener('click', cancelDialog); element('collaborationDialogBackdrop')?.addEventListener('click', cancelDialog); element('collaborationDialog')?.addEventListener('keydown', handleDialogKeydown);
    controllerListeners = { openStart, openEdit, openTeamEdit, submitDialog, cancelDialog, handleDialogKeydown };
    documentRef?.addEventListener('visibilitychange', handleVisibilityChange);
    documentRef?.addEventListener('focusin', handleActivityFocusIn); documentRef?.addEventListener('input', handleActivityInput);
    documentRef?.addEventListener('focusout', handleActivityFocusOut);
    element('collaborationRosterToggle')?.addEventListener('click', handleRosterToggle);
    windowRef?.addEventListener('focus', handleFocus); windowRef?.addEventListener('pageshow', handlePageShow); windowRef?.addEventListener('online', handleOnline); windowRef?.addEventListener('offline', handleOffline);
    statusTimer = scheduleTimeout(refreshStatus, 1000);
    return joinFromUrl();
  };
  let controllerListeners = null;
  /** Tears down timers, listeners, and session work. Safe to call repeatedly. @returns {void} */
  const destroy = () => {
    if (destroyed) return;
    destroyed = true; sessionEpoch += 1; pollingStopped = true;
    cancelTimeout(saveTimer); cancelTimeout(pollTimer); cancelTimeout(presenceTimer); cancelTimeout(typingTimer); cancelTimeout(idleTimer); cancelTimeout(statusTimer); cancelTimeout(dialogFocusTimer);
    saveTimer = null; pollTimer = null; presenceTimer = null; statusTimer = null; pendingSave = null; inFlightGet = null; inFlightPresence = null;
    resolveInFlightSave?.(); resolveInFlightSave = null; inFlightSave = null; inFlightSavePromise = null;
    if (controllerListeners) { const { openStart, openEdit, openTeamEdit, submitDialog, cancelDialog, handleDialogKeydown } = controllerListeners; element('startCollaborationBtn')?.removeEventListener('click', openStart); element('editCollaborationNameBtn')?.removeEventListener('click', openEdit); element('editCollaborationNameBannerBtn')?.removeEventListener('click', openEdit); element('editCollaborationTeamBtn')?.removeEventListener('click', openTeamEdit); element('editCollaborationTeamBannerBtn')?.removeEventListener('click', openTeamEdit); element('collaborationDialogForm')?.removeEventListener('submit', submitDialog); element('collaborationDialogCancelBtn')?.removeEventListener('click', cancelDialog); element('collaborationDialogBackdrop')?.removeEventListener('click', cancelDialog); element('collaborationDialog')?.removeEventListener('keydown', handleDialogKeydown); }
    element('copyCollaborationLinkBtn')?.removeEventListener('click', copyLink); element('leaveCollaborationBtn')?.removeEventListener('click', leave); element('syncCollaborationBtn')?.removeEventListener('click', syncNow); element('loadSharedVersionBtn')?.removeEventListener('click', loadNewest); element('exportRecoveryBtn')?.removeEventListener('click', exportRecovery);
    documentRef?.removeEventListener('visibilitychange', handleVisibilityChange); documentRef?.removeEventListener('focusin', handleActivityFocusIn); documentRef?.removeEventListener('input', handleActivityInput); documentRef?.removeEventListener('focusout', handleActivityFocusOut);
    element('collaborationRosterToggle')?.removeEventListener('click', handleRosterToggle);
    windowRef?.removeEventListener('focus', handleFocus); windowRef?.removeEventListener('pageshow', handlePageShow); windowRef?.removeEventListener('online', handleOnline); windowRef?.removeEventListener('offline', handleOffline);
  };
  function handleRosterToggle() { rosterExpanded = !rosterExpanded; renderPresence(); }
  return { init, destroy, start, leave, loadNewest, poll, flushSave, syncNow, heartbeat, renameTeam, joinPresence, notifyLocalChange, copyLink, exportRecovery, getState: () => ({ token, revision, applyingRemote, conflicted, pollingStopped, pendingSave, inFlightSave, inFlightGet, inFlightPresence, sessionEpoch, retryDelay, retrying, lastSuccessfulSync, terminalStatus, destroyed, teamName, participants, self, joinedPresence, editingField, activityState, activitySequence, acknowledgedPresenceSequence, desiredPresence, profile }) };
}

/** Initializes collaboration. @param {object} options Dependencies. @returns {object} Controller. */
export function initCollaboration(options) { const controller = createCollaborationController(options); controller.init(); return controller; }
