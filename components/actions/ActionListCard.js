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
  let disposeEtaPicker = null;
  let disposeMoreMenu = null;

  function fmtETA(dueAt) {
    if (!dueAt) return 'ETA';
    try {
      const dt = new Date(dueAt);
      if (Number.isNaN(dt.getTime())) return 'ETA';
      const now = new Date();
      const sameDay = dt.toDateString() === now.toDateString();
      if (sameDay) {
        return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return dt.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    catch { return 'ETA'; }
  }

  function nextPrimaryStatus(s) {
    return s === 'Planned' ? 'In-Progress' :
           s === 'In-Progress' ? 'Done' :
           'Planned';
  }

  function render() {
    closeMoreMenu();
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
      row.querySelector('.more').addEventListener('click', (event) => moreMenu(id, event.currentTarget));
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

  function closeEtaPicker() {
    if (typeof disposeEtaPicker === 'function') {
      disposeEtaPicker();
      disposeEtaPicker = null;
    }
  }

  function closeMoreMenu() {
    if (typeof disposeMoreMenu === 'function') {
      disposeMoreMenu();
      disposeMoreMenu = null;
    }
  }

  function applyPatch(id, delta, onOk) {
    const res = patchAction(analysisId, id, delta);
    if (res && res.__error) { toast(res.__error); return; }
    render();
    if (onOk) onOk(res);
  }

  function formatDatetimeLocal(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${y}-${m}-${d}T${h}:${min}`;
  }

  function defaultEtaDate(existing) {
    if (existing) {
      const parsed = new Date(existing);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const base = new Date();
    base.setMinutes(base.getMinutes() + 30);
    base.setSeconds(0, 0);
    return base;
  }

  function openEtaPicker(action) {
    closeEtaPicker();

    const overlay = document.createElement('div');
    overlay.className = 'eta-picker-overlay';
    overlay.innerHTML = `
      <div class="eta-picker" role="dialog" aria-modal="true" aria-label="Set ETA">
        <header class="eta-picker__header">
          <h4>Set ETA</h4>
          <button type="button" class="eta-picker__close" aria-label="Close">×</button>
        </header>
        <label class="eta-picker__field">
          <span>Due date &amp; time</span>
          <input type="datetime-local" class="eta-picker__input" />
        </label>
        <div class="eta-picker__actions">
          <button type="button" class="eta-picker__clear" data-action="clear">Clear</button>
          <span class="eta-picker__spacer"></span>
          <button type="button" class="eta-picker__cancel" data-action="cancel">Cancel</button>
          <button type="button" class="eta-picker__save" data-action="save">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.eta-picker__input');
    const defaultValue = formatDatetimeLocal(defaultEtaDate(action.dueAt));
    if (defaultValue) input.value = defaultValue;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeEtaPicker();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const focusTimer = requestAnimationFrame(() => {
      input.focus();
      input.select();
    });

    disposeEtaPicker = () => {
      cancelAnimationFrame(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeEtaPicker();
    });

    overlay.querySelector('.eta-picker__close').addEventListener('click', () => {
      closeEtaPicker();
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      closeEtaPicker();
    });

    overlay.querySelector('[data-action="clear"]').addEventListener('click', () => {
      applyPatch(action.id, { dueAt: '' }, () => {
        closeEtaPicker();
      });
    });

    overlay.querySelector('[data-action="save"]').addEventListener('click', () => {
      const raw = input.value;
      if (!raw) {
        applyPatch(action.id, { dueAt: '' }, () => {
          closeEtaPicker();
        });
        return;
      }
      const picked = new Date(raw);
      if (Number.isNaN(picked.getTime())) {
        input.setCustomValidity('Pick a valid date and time.');
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      applyPatch(action.id, { dueAt: picked.toISOString() }, () => {
        closeEtaPicker();
      });
    });
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
    openEtaPicker(it);
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
  function moreMenu(id, anchorEl) {
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it || !anchorEl) return;

    closeMoreMenu();

    const overlay = document.createElement('div');
    overlay.className = 'action-menu-overlay';

    const menu = document.createElement('div');
    menu.className = 'action-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button type="button" class="action-menu__item" data-action="block">
        <span class="action-menu__label">Mark blocked</span>
        <span class="action-menu__hint">Flag the action as blocked and capture context</span>
      </button>
      <button type="button" class="action-menu__item" data-action="defer">
        <span class="action-menu__label">Defer</span>
        <span class="action-menu__hint">Move the action out of the active queue</span>
      </button>
      <button type="button" class="action-menu__item" data-action="cancel">
        <span class="action-menu__label">Cancel</span>
        <span class="action-menu__hint">Stop work on this action</span>
      </button>
      <button type="button" class="action-menu__item" data-action="link">
        <span class="action-menu__label">Link to cause</span>
        <span class="action-menu__hint">Associate with a likely cause or hypothesis</span>
      </button>
      <div class="action-menu__divider" role="separator"></div>
      <button type="button" class="action-menu__item action-menu__item--danger" data-action="delete">
        <span class="action-menu__label">Delete</span>
        <span class="action-menu__hint">Remove this action permanently</span>
      </button>
    `;

    overlay.appendChild(menu);
    document.body.appendChild(overlay);

    const rect = anchorEl.getBoundingClientRect();
    const alignMenu = () => {
      const menuRect = menu.getBoundingClientRect();
      let top = rect.bottom + 8;
      let left = rect.left;
      if (top + menuRect.height > window.innerHeight - 12) {
        top = Math.max(12, rect.top - menuRect.height - 8);
      }
      const maxLeft = window.innerWidth - menuRect.width - 12;
      left = Math.min(Math.max(12, left), Math.max(12, maxLeft));
      menu.style.top = `${top}px`;
      menu.style.left = `${left}px`;
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMoreMenu();
      }
    };

    const onResize = () => {
      closeMoreMenu();
    };

    overlay.addEventListener('click', (event) => {
      if (!menu.contains(event.target)) {
        closeMoreMenu();
      }
    });

    menu.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        closeMoreMenu();
        if (action === 'delete') {
          if (confirm('Delete this action?')) {
            removeAction(analysisId, id);
            render();
          }
          return;
        }
        if (action === 'block') {
          const note = prompt('Blocker note:');
          applyPatch(id, { status: 'Blocked', notes: note || '' });
          return;
        }
        if (action === 'defer') {
          applyPatch(id, { status: 'Deferred' });
          return;
        }
        if (action === 'cancel') {
          applyPatch(id, { status: 'Cancelled' });
          return;
        }
        if (action === 'link') {
          const likely = getLikelyCauseId();
          const hyp = prompt('Link to cause id (Enter uses Likely Cause):', likely || '');
          applyPatch(id, { links: { hypothesisId: hyp || likely || '' } });
        }
      });
    });

    const firstButton = menu.querySelector('button');

    disposeMoreMenu = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onResize);
      overlay.remove();
      if (anchorEl && typeof anchorEl.focus === 'function') {
        anchorEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onResize);

    requestAnimationFrame(() => {
      alignMenu();
      if (firstButton) {
        firstButton.focus();
      }
    });
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
