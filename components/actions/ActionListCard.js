import { listActions, createAction, patchAction, removeAction } from '../../src/actionsStore.js';
import { getAnalysisId, getLikelyCauseId } from '../../src/appState.js';
import { showToast } from '../../src/toast.js';

export function mountActionListCard(hostEl) {
  const analysisId = getAnalysisId();

  hostEl.innerHTML = `
    <section class="card" id="action-card">
      <header class="card-header">
        <h3>Action List</h3>
        <div class="muted">Track, execute, verify</div>
      </header>
      <div class="quick-add">
        <input id="action-new" placeholder="e.g., Restart API gateway in zone A" />
        <button id="action-add">+ Add</button>
      </div>
      <ul id="action-list" class="action-list"></ul>
    </section>
  `;

  const input = hostEl.querySelector('#action-new');
  const addBtn = hostEl.querySelector('#action-add');
  const listEl = hostEl.querySelector('#action-list');

  function fmtETA(dueAt) {
    if (!dueAt) return 'ETA';
    try { return new Date(dueAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }
    catch { return 'ETA'; }
  }

  function nextPrimaryStatus(s) {
    return s === 'Planned' ? 'In-Progress' :
           s === 'In-Progress' ? 'Done' :
           'Planned';
  }

  function render() {
    const items = listActions(analysisId);
    listEl.innerHTML = items.map(it => `
      <li class="action-row" data-id="${it.id}" data-status="${it.status}" data-priority="${it.priority}">
        <button class="chip status" title="Advance status (Space)">${it.status}</button>
        <button class="chip priority" title="Set priority (1/2/3)">${it.priority}</button>
        <div class="summary" title="${it.detail?.replaceAll('"','&quot;') || ''}">${it.summary}</div>
        <button class="chip owner" title="Pick owner (O)">${it.owner || 'Owner'}</button>
        <button class="chip eta" title="Set ETA (E)">${fmtETA(it.dueAt)}</button>
        <button class="chip verify" title="Record verification (V)">Verify</button>
        <button class="more" title="More">⋯</button>
      </li>
    `).join('');

    // Wiring per row:
    listEl.querySelectorAll('.action-row').forEach(row => {
      const id = row.dataset.id;

      row.querySelector('.status').addEventListener('click', () => advanceStatus(id));
      row.querySelector('.priority').addEventListener('click', () => cyclePriority(id));
      row.querySelector('.owner').addEventListener('click', () => setOwner(id));
      row.querySelector('.eta').addEventListener('click', () => setEta(id));
      row.querySelector('.verify').addEventListener('click', () => verifyAction(id));
      row.querySelector('.more').addEventListener('click', () => moreMenu(id));
      row.addEventListener('keydown', (e) => keyControls(e, id));
      row.tabIndex = 0;
    });
  }

  function toast(msg) {
    if (typeof showToast === 'function') {
      showToast(msg);
      return;
    }
    console.info('[action]', msg);
  }

  function applyPatch(id, delta, onOk) {
    const res = patchAction(analysisId, id, delta);
    if (res && res.__error) { toast(res.__error); return; }
    render();
    if (onOk) onOk(res);
  }

  // Actions
  function advanceStatus(id) {
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it) return;
    const next = nextPrimaryStatus(it.status);
    applyPatch(id, { status: next });
  }
  function cyclePriority(id) {
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it) return;
    const next = it.priority === 'P1' ? 'P2' : it.priority === 'P2' ? 'P3' : 'P1';
    applyPatch(id, { priority: next });
  }
  function setOwner(id) {
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it) return;
    const v = prompt('Owner (name or handle):');
    if (v !== null) applyPatch(id, { owner: v.trim() });
  }
  function setEta(id) {
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it) return;
    const v = prompt('Due at (ISO or hh:mm):');
    if (v !== null) {
      let iso = v.trim();
      if (/^\d{1,2}:\d{2}$/.test(iso)) {
        const t = new Date(); const [h,m] = iso.split(':');
        t.setHours(+h, +m, 0, 0); iso = t.toISOString();
      }
      applyPatch(id, { dueAt: iso });
    }
  }
  function verifyAction(id) {
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it) return;
    const required = confirm('Require verification for this action? Click OK to require.');
    const method = required ? (prompt('Verification method (Metric/Alarm/User test):') || '') : '';
    const evidence = required ? (prompt('Evidence (link or note):') || '') : '';
    const result = required ? (prompt('Result (Pass/Fail or leave blank to verify later):') || '') : '';
    const checkedBy = result ? (prompt('Checked by:') || '') : '';
    const checkedAt = result ? new Date().toISOString() : '';
    applyPatch(id, { verification: { required, method, evidence, result: result || undefined, checkedBy, checkedAt } });
  }
  function moreMenu(id) {
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it) return;
    const choice = prompt('More: type one of [block, defer, cancel, link, delete]');
    if (!choice) return;
    if (choice === 'delete') { removeAction(analysisId, id); render(); return; }
    if (choice === 'block') {
      const note = prompt('Blocker note:');
      applyPatch(id, { status: 'Blocked', notes: note || '' });
      return;
    }
    if (choice === 'defer') { applyPatch(id, { status: 'Deferred' }); return; }
    if (choice === 'cancel') { applyPatch(id, { status: 'Cancelled' }); return; }
    if (choice === 'link') {
      const likely = getLikelyCauseId();
      const hyp = prompt('Link to cause id (Enter uses Likely Cause):', likely || '');
      applyPatch(id, { links: { hypothesisId: hyp || likely || '' } });
    }
  }

  // Keyboard shortcuts for focused row
  function keyControls(e, id) {
    if (e.key === ' ') { e.preventDefault(); advanceStatus(id); }
    if (e.key === 'V' || e.key === 'v') { e.preventDefault(); verifyAction(id); }
    if (e.key === 'O' || e.key === 'o') { e.preventDefault(); setOwner(id); }
    if (e.key === 'E' || e.key === 'e') { e.preventDefault(); setEta(id); }
    if (e.key === '1') applyPatch(id, { priority: 'P1' });
    if (e.key === '2') applyPatch(id, { priority: 'P2' });
    if (e.key === '3') applyPatch(id, { priority: 'P3' });
  }

  // Quick add
  function add() {
    const summary = input.value.trim();
    if (!summary) return;
    const item = createAction(analysisId, { summary, links: { hypothesisId: getLikelyCauseId() || undefined } });
    if (item) { input.value = ''; render(); input.focus(); }
  }
  addBtn.addEventListener('click', add);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });

  // Global shortcuts
  document.addEventListener('keydown', e => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const tag = (e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '');
    if (tag === 'input' || tag === 'textarea') return;
    if (e.target && e.target.isContentEditable) return;
    if (e.key === 'N' || e.key === 'n') {
      e.preventDefault();
      input.focus();
    }
  });

  render();
}
