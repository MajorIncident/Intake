/**
 * @module adminMaintenance
 * @description Privileged browser UI for server-authorized lifecycle inventory, recovery, and preview-first cleanup.
 *
 * Administration is not an Intake experience role. The raw Admin credential is
 * retained only in sessionStorage for the current tab after successful server
 * authorization. It never enters Intake state, localStorage, exports, summaries,
 * URLs, or telemetry.
 */

export const ADMIN_SESSION_STORAGE_KEY = 'kt-admin-session-v1';
export const ADMIN_SESSION_VERSION = 1;
export const ADMIN_ENDPOINT = '/api/admin';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

let documentRef = null;
let windowRef = null;
let sessionStorageRef = null;
let fetchRef = null;
let toastRef = null;
let adminToken = '';
let inventory = { classes: [], workspaces: [] };
let activePreview = null;
let returnFocus = null;

function element(id) {
  return documentRef?.getElementById(id) || null;
}

function safeSessionStorage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function validToken(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

function readSessionToken() {
  if (!sessionStorageRef) return '';
  try {
    const parsed = JSON.parse(sessionStorageRef.getItem(ADMIN_SESSION_STORAGE_KEY) || 'null');
    if (parsed?.version === ADMIN_SESSION_VERSION && validToken(parsed.token)) {
      return parsed.token;
    }
    if (parsed !== null) sessionStorageRef.removeItem(ADMIN_SESSION_STORAGE_KEY);
  } catch {
    try { sessionStorageRef.removeItem(ADMIN_SESSION_STORAGE_KEY); } catch {}
  }
  return '';
}

function persistSessionToken(token) {
  if (!sessionStorageRef || !validToken(token)) return false;
  try {
    sessionStorageRef.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify({
      version: ADMIN_SESSION_VERSION,
      token
    }));
    return true;
  } catch {
    return false;
  }
}

function clearSessionToken() {
  adminToken = '';
  try { sessionStorageRef?.removeItem(ADMIN_SESSION_STORAGE_KEY); } catch {}
}

function setStatus(message = '', state = '') {
  const status = element('adminMaintenanceStatus');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
  status.hidden = !message;
}

function setBusy(busy) {
  const dialog = element('adminMaintenanceDialog');
  if (!dialog) return;
  dialog.setAttribute('aria-busy', busy ? 'true' : 'false');
  dialog.querySelectorAll('button, input, select').forEach(control => {
    if (control.id === 'adminMaintenanceCloseBtn') return;
    control.disabled = Boolean(busy);
  });
}

function showAuth() {
  const auth = element('adminMaintenanceAuth');
  const consolePanel = element('adminMaintenanceConsole');
  if (auth) auth.hidden = false;
  if (consolePanel) consolePanel.hidden = true;
  const input = element('adminMaintenanceToken');
  if (input) {
    input.value = '';
    input.focus();
  }
}

function showConsole() {
  const auth = element('adminMaintenanceAuth');
  const consolePanel = element('adminMaintenanceConsole');
  if (auth) auth.hidden = true;
  if (consolePanel) consolePanel.hidden = false;
}

async function requestAdmin(method = 'GET', body = null, token = adminToken) {
  if (!validToken(token) || typeof fetchRef !== 'function') {
    return { ok: false, status: 401, body: { error: 'Administration authorization required.' } };
  }
  const response = await fetchRef(ADMIN_ENDPOINT, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  return { ok: response.ok, status: response.status, body: payload };
}

function formatTimestamp(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  try {
    return parsed.toLocaleString();
  } catch {
    return parsed.toISOString();
  }
}

function idleLabel(item) {
  if (!Number.isFinite(item?.idleDays)) return 'Activity unknown';
  if (item.idleDays === 0) return 'Active today';
  return `${item.idleDays} day${item.idleDays === 1 ? '' : 's'} idle`;
}

function statusBadge(status) {
  const badge = documentRef.createElement('span');
  badge.className = `admin-maintenance__badge admin-maintenance__badge--${status || 'unknown'}`;
  badge.textContent = status || 'unknown';
  return badge;
}

function metaRow(label, value) {
  const row = documentRef.createElement('div');
  row.className = 'admin-maintenance__meta-row';
  const term = documentRef.createElement('span');
  term.textContent = label;
  const detail = documentRef.createElement('strong');
  detail.textContent = value;
  row.append(term, detail);
  return row;
}

function actionButton(label, onClick, { danger = false } = {}) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = danger ? 'btn-secondary admin-maintenance__danger' : 'btn-secondary';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function currentIdleDays() {
  const value = Number(element('adminMaintenanceIdleDays')?.value || 30);
  return Number.isInteger(value) && value > 0 ? value : 30;
}

function classMatchesFilters(item) {
  const query = (element('adminClassSearch')?.value || '').trim().toLowerCase();
  const status = element('adminClassStatusFilter')?.value || 'all';
  if (status !== 'all' && item.status !== status) return false;
  if (!query) return true;
  return [item.title, item.id, item.exercise?.status, item.exercise?.currentStageId]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(query));
}

function workspaceMatchesFilters(item) {
  const query = (element('adminWorkspaceSearch')?.value || '').trim().toLowerCase();
  const ownership = element('adminWorkspaceOwnershipFilter')?.value || 'all';
  if (ownership === 'independent' && item.classOwned) return false;
  if (ownership === 'class' && !item.classOwned) return false;
  if (ownership === 'expired' && item.status !== 'expired') return false;
  if (!query) return true;
  return [
    item.teamName,
    item.id,
    item.classroom?.title,
    item.classroom?.workspaceLabel
  ].filter(Boolean).some(value => String(value).toLowerCase().includes(query));
}

function renderClassCard(item) {
  const card = documentRef.createElement('article');
  card.className = 'admin-maintenance__item';
  card.dataset.adminClassId = item.id;

  const heading = documentRef.createElement('div');
  heading.className = 'admin-maintenance__item-heading';
  const identity = documentRef.createElement('div');
  const title = documentRef.createElement('strong');
  title.textContent = item.title;
  const id = documentRef.createElement('small');
  id.textContent = item.id;
  identity.append(title, id);
  heading.append(identity, statusBadge(item.status));

  const meta = documentRef.createElement('div');
  meta.className = 'admin-maintenance__meta';
  meta.append(
    metaRow('Last activity', `${formatTimestamp(item.lastActivityAt)} · ${idleLabel(item)}`),
    metaRow('Expires', formatTimestamp(item.expiresAt)),
    metaRow('Participants', `${item.participantCount} · ${item.recentPresenceCount} recent presence`),
    metaRow('Workspaces', String(item.workspaceCount)),
    metaRow('Staged exercise', item.exercise
      ? `${item.exercise.status}${item.exercise.currentStageId ? ` · ${item.exercise.currentStageId}` : ''}`
      : 'None')
  );

  const cleanup = documentRef.createElement('div');
  cleanup.className = 'admin-maintenance__cleanup-counts';
  cleanup.textContent = `Cleanup footprint: ${item.workspaceCount} workspace(s), ${item.presenceCount} presence row(s), ${item.coachingCount} coaching row(s), ${item.exerciseCount} exercise(s), ${item.checkpointCount} checkpoint(s), ${item.releaseCount} release row(s).`;

  const actions = documentRef.createElement('div');
  actions.className = 'admin-maintenance__actions';
  if (item.status === 'active') {
    actions.append(
      actionButton('Reissue Instructor access', () => rotateInstructor(item)),
      actionButton('Close class', () => revokeClass(item), { danger: true })
    );
  } else {
    actions.append(
      actionButton('Preview purge', () => requestPurgePreview('classes', 'single', item.id), { danger: true })
    );
  }

  card.append(heading, meta, cleanup, actions);
  return card;
}

function renderWorkspaceCard(item) {
  const card = documentRef.createElement('article');
  card.className = 'admin-maintenance__item';
  card.dataset.adminWorkspaceId = item.id;

  const heading = documentRef.createElement('div');
  heading.className = 'admin-maintenance__item-heading';
  const identity = documentRef.createElement('div');
  const title = documentRef.createElement('strong');
  title.textContent = item.teamName;
  const id = documentRef.createElement('small');
  id.textContent = item.id;
  identity.append(title, id);
  const badges = documentRef.createElement('div');
  badges.className = 'admin-maintenance__badges';
  badges.append(
    statusBadge(item.status),
    statusBadge(item.classOwned ? 'class-owned' : 'independent')
  );
  heading.append(identity, badges);

  const meta = documentRef.createElement('div');
  meta.className = 'admin-maintenance__meta';
  meta.append(
    metaRow('Last activity', `${formatTimestamp(item.lastActivityAt)} · ${idleLabel(item)}`),
    metaRow('Expires', formatTimestamp(item.expiresAt)),
    metaRow('Participants', `${item.participantCount} · ${item.recentPresenceCount} recent presence`),
    metaRow('Capabilities', String(item.capabilityCount)),
    metaRow('Owner', item.classOwned
      ? `${item.classroom?.title || 'Classroom'} · ${item.classroom?.workspaceLabel || 'workspace'}`
      : 'Standalone / ad-hoc')
  );

  const actions = documentRef.createElement('div');
  actions.className = 'admin-maintenance__actions';
  const threshold = currentIdleDays();
  const independentlyPurgeable = !item.classOwned
    && (item.status === 'expired' || (Number.isFinite(item.idleDays) && item.idleDays >= threshold));
  if (independentlyPurgeable) {
    actions.append(
      actionButton('Preview purge', () => requestPurgePreview('workspaces', 'single', item.id), { danger: true })
    );
  } else if (item.classOwned) {
    const note = documentRef.createElement('small');
    note.textContent = 'Class-owned workspaces are purged with their class.';
    actions.append(note);
  }

  card.append(heading, meta, actions);
  return card;
}

function renderEmpty(container, message) {
  const empty = documentRef.createElement('p');
  empty.className = 'admin-maintenance__empty';
  empty.textContent = message;
  container.append(empty);
}

function renderInventory() {
  const classList = element('adminClassList');
  const workspaceList = element('adminWorkspaceList');
  if (!classList || !workspaceList) return;
  classList.replaceChildren();
  workspaceList.replaceChildren();

  const classes = (inventory.classes || []).filter(classMatchesFilters);
  const workspaces = (inventory.workspaces || []).filter(workspaceMatchesFilters);

  classes.forEach(item => classList.append(renderClassCard(item)));
  workspaces.forEach(item => workspaceList.append(renderWorkspaceCard(item)));

  if (!classes.length) renderEmpty(classList, 'No classes match these filters.');
  if (!workspaces.length) renderEmpty(workspaceList, 'No collaboration workspaces match these filters.');

  const classSummary = element('adminClassSummary');
  const workspaceSummary = element('adminWorkspaceSummary');
  if (classSummary) classSummary.textContent = `${classes.length} of ${inventory.classes?.length || 0}`;
  if (workspaceSummary) workspaceSummary.textContent = `${workspaces.length} of ${inventory.workspaces?.length || 0}`;

  const generated = element('adminInventoryGeneratedAt');
  if (generated) generated.textContent = inventory.generatedAt
    ? `Inventory refreshed ${formatTimestamp(inventory.generatedAt)}`
    : '';
}

async function loadInventory({ announce = false } = {}) {
  if (!validToken(adminToken)) {
    showAuth();
    return false;
  }
  setBusy(true);
  setStatus('Refreshing maintenance inventory…', 'loading');
  try {
    const result = await requestAdmin('GET');
    if (!result.ok) {
      if (result.status === 401) {
        clearSessionToken();
        showAuth();
      }
      setStatus(result.body?.error || 'Unable to load maintenance inventory.', 'error');
      return false;
    }
    inventory = result.body || { classes: [], workspaces: [] };
    showConsole();
    renderInventory();
    setStatus('', '');
    if (announce) toastRef?.('Maintenance inventory refreshed.');
    return true;
  } catch {
    setStatus('Unable to reach Administration / Maintenance.', 'error');
    return false;
  } finally {
    setBusy(false);
  }
}

async function authenticate() {
  const input = element('adminMaintenanceToken');
  const candidate = input?.value?.trim() || '';
  if (!validToken(candidate)) {
    setStatus('Enter a valid Admin access key.', 'error');
    input?.focus();
    return;
  }
  setBusy(true);
  setStatus('Checking Admin access…', 'loading');
  try {
    const result = await requestAdmin('GET', null, candidate);
    if (!result.ok) {
      setStatus(result.body?.error || 'Admin access was not accepted.', 'error');
      return;
    }
    adminToken = candidate;
    persistSessionToken(candidate);
    inventory = result.body || { classes: [], workspaces: [] };
    if (input) input.value = '';
    showConsole();
    renderInventory();
    setStatus('', '');
  } catch {
    setStatus('Unable to reach Administration / Maintenance.', 'error');
  } finally {
    setBusy(false);
  }
}

function signOut() {
  clearSessionToken();
  inventory = { classes: [], workspaces: [] };
  activePreview = null;
  hidePreview();
  hideRecovery();
  setStatus('Admin session cleared for this tab.', 'info');
  showAuth();
}

async function revokeClass(item) {
  if (!windowRef?.confirm?.(`Close “${item.title}”? Students will no longer be able to join or edit class workspaces.`)) return;
  setBusy(true);
  try {
    const result = await requestAdmin('POST', { action: 'revoke-class', classId: item.id });
    if (!result.ok) {
      setStatus(result.body?.error || 'Unable to close class.', 'error');
      return;
    }
    toastRef?.('Class closed.');
    await loadInventory();
  } catch {
    setStatus('Unable to close class.', 'error');
  } finally {
    setBusy(false);
  }
}

async function rotateInstructor(item) {
  if (!windowRef?.confirm?.(`Reissue Instructor access for “${item.title}”? The previous Instructor credential will stop working immediately.`)) return;
  setBusy(true);
  try {
    const result = await requestAdmin('POST', { action: 'rotate-instructor', classId: item.id });
    if (!result.ok) {
      setStatus(result.body?.error || 'Unable to reissue Instructor access.', 'error');
      return;
    }
    showRecovery(item, result.body?.instructorToken || '');
    await loadInventory();
  } catch {
    setStatus('Unable to reissue Instructor access.', 'error');
  } finally {
    setBusy(false);
  }
}

function showRecovery(item, token) {
  if (!validToken(token)) {
    setStatus('Instructor access was rotated, but the returned credential was invalid.', 'error');
    return;
  }
  const panel = element('adminRecoveryPanel');
  const title = element('adminRecoveryTitle');
  const value = element('adminRecoveryToken');
  if (title) title.textContent = `New Instructor access · ${item.title}`;
  if (value) value.value = token;
  if (panel) {
    panel.hidden = false;
    panel.querySelector('textarea, button')?.focus?.();
  }
}

function hideRecovery() {
  const panel = element('adminRecoveryPanel');
  const value = element('adminRecoveryToken');
  if (value) value.value = '';
  if (panel) panel.hidden = true;
}

async function copyRecoveryToken() {
  const value = element('adminRecoveryToken')?.value || '';
  if (!validToken(value)) return;
  try {
    await windowRef?.navigator?.clipboard?.writeText?.(value);
    toastRef?.('Instructor access copied.');
  } catch {
    const field = element('adminRecoveryToken');
    field?.focus?.();
    field?.select?.();
    toastRef?.('Copy the selected Instructor access value.');
  }
}

async function requestPurgePreview(scope, mode, id = null) {
  setBusy(true);
  try {
    const body = {
      action: 'preview-purge',
      scope,
      mode,
      ...(scope === 'workspaces' || mode === 'bulk' ? { idleDays: currentIdleDays() } : {}),
      ...(id ? { id } : {})
    };
    const result = await requestAdmin('POST', body);
    if (!result.ok) {
      setStatus(result.body?.error || 'Unable to build purge preview.', 'error');
      return;
    }
    if (!result.body?.previewToken || !result.body?.plan?.items?.length) {
      toastRef?.('No records are eligible for this purge.');
      return;
    }
    activePreview = {
      token: result.body.previewToken,
      expiresAt: result.body.expiresAt,
      plan: result.body.plan
    };
    renderPreview();
  } catch {
    setStatus('Unable to build purge preview.', 'error');
  } finally {
    setBusy(false);
  }
}

function renderPreview() {
  const panel = element('adminPurgePreview');
  const title = element('adminPurgePreviewTitle');
  const meta = element('adminPurgePreviewMeta');
  const list = element('adminPurgePreviewList');
  const confirm = element('adminPurgeConfirmBtn');
  if (!panel || !activePreview || !list) return;

  const { plan } = activePreview;
  const label = plan.scope === 'classes' ? 'class' : 'workspace';
  if (title) title.textContent = `Confirm ${label} purge`;
  if (meta) {
    meta.textContent = `${plan.items.length} ${label}${plan.items.length === 1 ? '' : 'es'} · preview expires ${formatTimestamp(activePreview.expiresAt)}${plan.truncated ? ' · limited to first 200 candidates' : ''}`;
  }

  list.replaceChildren();
  plan.items.forEach(item => {
    const li = documentRef.createElement('li');
    const strong = documentRef.createElement('strong');
    strong.textContent = plan.scope === 'classes' ? item.title : item.teamName;
    const detail = documentRef.createElement('span');
    detail.textContent = plan.scope === 'classes'
      ? `${item.status} · ${item.participantCount} participant(s) · ${item.workspaceCount} workspace(s) · last activity ${formatTimestamp(item.lastActivityAt)}`
      : `${item.status} · ${item.participantCount} participant(s) · ${item.capabilityCount} capability row(s) · last activity ${formatTimestamp(item.lastActivityAt)}`;
    li.append(strong, detail);
    list.append(li);
  });
  if (confirm) confirm.textContent = `Purge ${plan.items.length} ${label}${plan.items.length === 1 ? '' : 's'}`;
  panel.hidden = false;
  confirm?.focus?.();
}

function hidePreview() {
  activePreview = null;
  const panel = element('adminPurgePreview');
  if (panel) panel.hidden = true;
  element('adminPurgePreviewList')?.replaceChildren();
}

async function commitPreview() {
  if (!activePreview?.token) return;
  const label = activePreview.plan.scope === 'classes' ? 'class data' : 'workspace data';
  if (!windowRef?.confirm?.(`Permanently purge the previewed ${label}? This cannot be undone.`)) return;

  setBusy(true);
  try {
    const result = await requestAdmin('POST', {
      action: 'commit-purge',
      previewToken: activePreview.token
    });
    if (!result.ok) {
      if (result.status === 409) {
        hidePreview();
        await loadInventory();
      }
      setStatus(result.body?.error || 'Unable to purge maintenance data.', 'error');
      return;
    }
    const count = Array.isArray(result.body?.ids) ? result.body.ids.length : 0;
    hidePreview();
    toastRef?.(`Purged ${count} maintenance record${count === 1 ? '' : 's'}.`);
    await loadInventory();
  } catch {
    setStatus('Unable to purge maintenance data.', 'error');
  } finally {
    setBusy(false);
  }
}

function adminFocusables() {
  const gate = element('adminMaintenanceGate');
  if (!gate || gate.hidden) return [];
  return [...gate.querySelectorAll('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])')]
    .filter(control => !control.hidden && !control.disabled && !control.closest('[hidden]'));
}

function handleKeydown(event) {
  const gate = element('adminMaintenanceGate');
  if (!gate || gate.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (!element('adminPurgePreview')?.hidden) {
      hidePreview();
      return;
    }
    if (!element('adminRecoveryPanel')?.hidden) {
      hideRecovery();
      return;
    }
    closeAdminMaintenance();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusables = adminFocusables();
  if (!focusables.length) return;
  const current = focusables.indexOf(documentRef.activeElement);
  const last = focusables.length - 1;
  if (event.shiftKey && current <= 0) {
    event.preventDefault();
    focusables[last].focus();
  } else if (!event.shiftKey && current === last) {
    event.preventDefault();
    focusables[0].focus();
  }
}

/** Open the privileged Administration / Maintenance surface. */
export function openAdminMaintenance({ returnFocus: nextReturnFocus = null } = {}) {
  const gate = element('adminMaintenanceGate');
  if (!gate) return;
  returnFocus = nextReturnFocus || documentRef?.activeElement || null;
  gate.hidden = false;
  gate.setAttribute('aria-hidden', 'false');
  documentRef.body.classList.add('admin-maintenance-open');
  setStatus('', '');
  if (validToken(adminToken)) {
    void loadInventory();
  } else {
    showAuth();
  }
}

/** Close the Admin surface without destroying the tab-scoped authenticated session. */
export function closeAdminMaintenance() {
  const gate = element('adminMaintenanceGate');
  if (!gate) return;
  hidePreview();
  hideRecovery();
  gate.hidden = true;
  gate.setAttribute('aria-hidden', 'true');
  documentRef.body.classList.remove('admin-maintenance-open');
  const target = returnFocus;
  returnFocus = null;
  target?.focus?.();
}

function bindControls() {
  documentRef.querySelectorAll('[data-open-admin-maintenance]').forEach(button => {
    if (button.dataset.adminMaintenanceBound === 'true') return;
    button.dataset.adminMaintenanceBound = 'true';
    button.addEventListener('click', () => openAdminMaintenance({ returnFocus: button }));
  });

  element('adminMaintenanceCloseBtn')?.addEventListener('click', closeAdminMaintenance);
  element('adminMaintenanceAuthForm')?.addEventListener('submit', event => {
    event.preventDefault();
    void authenticate();
  });
  element('adminMaintenanceRefreshBtn')?.addEventListener('click', () => void loadInventory({ announce: true }));
  element('adminMaintenanceSignOutBtn')?.addEventListener('click', signOut);
  element('adminPurgeCancelBtn')?.addEventListener('click', hidePreview);
  element('adminPurgeConfirmBtn')?.addEventListener('click', () => void commitPreview());
  element('adminRecoveryDismissBtn')?.addEventListener('click', hideRecovery);
  element('adminRecoveryCopyBtn')?.addEventListener('click', () => void copyRecoveryToken());
  element('adminBulkClassPurgeBtn')?.addEventListener('click', () => void requestPurgePreview('classes', 'bulk'));
  element('adminBulkWorkspacePurgeBtn')?.addEventListener('click', () => void requestPurgePreview('workspaces', 'bulk'));

  ['adminClassSearch', 'adminClassStatusFilter', 'adminWorkspaceSearch', 'adminWorkspaceOwnershipFilter', 'adminMaintenanceIdleDays']
    .forEach(id => {
      const control = element(id);
      control?.addEventListener(id.includes('Search') ? 'input' : 'change', renderInventory);
    });

  documentRef.addEventListener('keydown', handleKeydown);
}

/**
 * Initialize the Admin surface.
 *
 * @param {object} [options] Browser/test dependencies.
 * @returns {object} Minimal controller for tests and integration.
 */
export function initAdminMaintenance({
  documentRef: nextDocument = typeof document !== 'undefined' ? document : null,
  windowRef: nextWindow = typeof window !== 'undefined' ? window : null,
  sessionStorage: nextSessionStorage = safeSessionStorage(),
  fetchImpl = typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null,
  toast = nextWindow?.showToast || null
} = {}) {
  documentRef = nextDocument;
  windowRef = nextWindow;
  sessionStorageRef = nextSessionStorage;
  fetchRef = fetchImpl;
  toastRef = toast;
  adminToken = readSessionToken();
  inventory = { classes: [], workspaces: [] };
  activePreview = null;
  bindControls();

  return {
    open: openAdminMaintenance,
    close: closeAdminMaintenance,
    refresh: () => loadInventory(),
    signOut,
    isAuthenticated: () => validToken(adminToken)
  };
}
