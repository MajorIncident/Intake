import { listActions, createAction, patchAction, removeAction, sortActions } from '../../src/actionsStore.js';
import { getAnalysisId, getLikelyCauseId } from '../../src/appState.js';
import { showToast } from '../../src/toast.js';

export function mountActionListCard(hostEl) {
  const analysisId = getAnalysisId();

  hostEl.innerHTML = `
    <section class="card" id="action-card">
      <header class="card-header">
        <div class="card-title-group">
          <h3>Action List</h3>
          <div class="muted">Track, execute, verify</div>
        </div>
        <button id="action-refresh" class="icon-button" title="Refresh and sort actions">↻ Refresh</button>
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
  const refreshBtn = hostEl.querySelector('#action-refresh');
  let disposeEtaPicker = null;
  let disposeMoreMenu = null;
  let disposeVerificationDialog = null;

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
    listEl.innerHTML = items.map(renderActionRow).join('');

    // Wiring per row:
    listEl.querySelectorAll('.action-row').forEach(row => {
      const id = row.dataset.id;

      row.querySelector('.status').addEventListener('click', () => advanceStatus(id));
      row.querySelector('.priority').addEventListener('click', () => cyclePriority(id));
      row.querySelector('.owner').addEventListener('click', () => setOwner(id));
      row.querySelector('.eta').addEventListener('click', () => setEta(id));
      row.querySelector('.verify-button').addEventListener('click', () => verifyAction(id));
      row.querySelector('.more').addEventListener('click', (event) => moreMenu(id, event.currentTarget));
      row.querySelector('.summary__title').addEventListener('dblclick', () => editSummary(id));
      row.addEventListener('keydown', (e) => keyControls(e, id));
      row.tabIndex = 0;
    });
  }

  function handleRefresh() {
    sortActions(analysisId);
    render();
    toast('Actions sorted by priority and ETA.');
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

  function closeVerificationDialog() {
    if (typeof disposeVerificationDialog === 'function') {
      disposeVerificationDialog();
      disposeVerificationDialog = null;
    }
  }

  function htmlEscape(input) {
    if (typeof input !== 'string') return '';
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeVerification(raw) {
    if (!raw || typeof raw !== 'object') {
      return { required: false, method: '', evidence: '', result: '', checkedBy: '', checkedAt: '' };
    }
    return {
      required: Boolean(raw.required),
      method: raw.method || '',
      evidence: raw.evidence || '',
      result: raw.result || '',
      checkedBy: raw.checkedBy || '',
      checkedAt: raw.checkedAt || '',
    };
  }

  function formatVerificationTimestamp(iso) {
    if (!iso) return 'No timestamp yet';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return 'Timestamp unavailable';
    return dt.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function verificationState(verification) {
    if (verification.required) {
      return verification.result ? 'verified' : 'required';
    }
    return 'optional';
  }

  function renderEvidenceMarkup(evidence) {
    if (!evidence) {
      return '<span class="summary__value summary__value--muted">No evidence yet</span>';
    }
    const trimmed = evidence.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      const safeUrl = htmlEscape(trimmed);
      return `<a class="summary__link" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="${safeUrl}">View evidence</a>`;
    }
    const safeText = htmlEscape(trimmed);
    return `<span class="summary__value" title="${safeText}">${safeText}</span>`;
  }

  function renderVerificationDetail(action) {
    const verification = normalizeVerification(action.verification);
    const state = verificationState(verification);
    const statusText = verification.required
      ? (verification.result ? 'Verified' : 'Verification required')
      : 'Verification optional';
    const resultText = verification.result || 'Pending';
    const methodText = verification.method || 'Method pending';
    const checkedByText = verification.checkedBy || 'Unassigned';
    const timestampText = formatVerificationTimestamp(verification.checkedAt);

    return {
      detail: `
        <dl class="summary__detail" data-verify-state="${state}">
          <div class="summary__detail-row">
            <dt>Status</dt>
            <dd class="summary__value summary__value--status">${htmlEscape(statusText)}</dd>
          </div>
          <div class="summary__detail-row">
            <dt>Result</dt>
            <dd class="summary__value">${htmlEscape(resultText)}</dd>
          </div>
          <div class="summary__detail-row">
            <dt>Method</dt>
            <dd class="summary__value">${htmlEscape(methodText)}</dd>
          </div>
          <div class="summary__detail-row">
            <dt>Checked by</dt>
            <dd class="summary__value">${htmlEscape(checkedByText)}</dd>
          </div>
          <div class="summary__detail-row">
            <dt>Checked at</dt>
            <dd class="summary__value">${htmlEscape(timestampText)}</dd>
          </div>
          <div class="summary__detail-row">
            <dt>Evidence</dt>
            <dd class="summary__value">${renderEvidenceMarkup(verification.evidence)}</dd>
          </div>
        </dl>
      `,
      state,
      verification,
    };
  }

  function renderActionRow(it) {
    const detailTitle = it.detail ? htmlEscape(it.detail) : '';
    const { detail, state, verification } = renderVerificationDetail(it);
    const summaryTitle = htmlEscape(it.summary);
    const ownerLabel = it.owner ? htmlEscape(it.owner) : 'Owner';
    const verifyButtonLabel = verification.result ? 'Update' : 'Verify';
    const verifyState = state;
    return `
      <li class="action-row" data-id="${it.id}" data-status="${it.status}" data-priority="${it.priority}">
        <button class="chip chip--status status" data-status="${it.status}" title="Advance status (Space)">${htmlEscape(it.status)}</button>
        <button class="chip chip--priority priority" data-priority="${it.priority}" title="Set priority (1/2/3)">${htmlEscape(it.priority)}</button>
        <div class="summary" title="${detailTitle}">
          <div class="summary__title" title="Double-click to edit title">${summaryTitle}</div>
          ${detail}
        </div>
        <button class="chip chip--pill owner" title="Pick owner (O)">${ownerLabel}</button>
        <button class="chip chip--pill eta" title="Set ETA (E)">${htmlEscape(fmtETA(it.dueAt))}</button>
        <button class="chip chip--pill verify-button" data-verify-state="${verifyState}" title="Record verification (V)">${verifyButtonLabel}</button>
        <button class="icon-button more" title="More">⋯</button>
      </li>
    `;
  }

  function editSummary(id) {
    const items = listActions(analysisId);
    const action = items.find(x => x.id === id);
    if (!action) return;

    const row = Array.from(listEl.querySelectorAll('.action-row')).find(el => el.dataset.id === id);
    if (!row) return;

    const titleEl = row.querySelector('.summary__title');
    if (!titleEl || titleEl.dataset.editing === '1') return;

    const originalText = action.summary || '';
    const originalHtml = titleEl.innerHTML;

    titleEl.dataset.editing = '1';
    titleEl.classList.add('summary__title--editing');
    titleEl.innerHTML = '';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'summary__title-input';
    input.value = originalText;
    input.setAttribute('aria-label', 'Edit action title');
    input.autocomplete = 'off';
    input.spellcheck = true;
    titleEl.appendChild(input);

    input.focus();
    input.select();

    let closed = false;

    function restore() {
      if (closed) return;
      closed = true;
      titleEl.dataset.editing = '';
      titleEl.classList.remove('summary__title--editing');
      titleEl.innerHTML = originalHtml;
    }

    function commit() {
      if (closed) return;
      const trimmed = input.value.trim();
      if (!trimmed) {
        input.setCustomValidity('Title cannot be empty.');
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      restore();
      if (trimmed !== originalText) {
        applyPatch(id, { summary: trimmed });
      }
    }

    function cancel() {
      if (closed) return;
      input.setCustomValidity('');
      restore();
    }

    input.addEventListener('blur', () => {
      commit();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
    });

    input.addEventListener('input', () => {
      input.setCustomValidity('');
    });
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
  function formatCheckedAtInput(iso) {
    if (!iso) return '';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '';
    return formatDatetimeLocal(dt);
  }

  function parseCheckedAtValue(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
  }

  function verifyAction(id) {
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it) return;
    openVerificationDialog(it);
  }

  function openVerificationDialog(action) {
    closeVerificationDialog();

    const verification = normalizeVerification(action.verification);

    const overlay = document.createElement('div');
    overlay.className = 'verification-dialog-overlay';
    overlay.innerHTML = `
      <div class="verification-dialog" role="dialog" aria-modal="true" aria-label="Record verification">
        <header class="verification-dialog__header">
          <h4>Verification</h4>
          <button type="button" class="verification-dialog__close" aria-label="Close">×</button>
        </header>
        <form class="verification-dialog__form">
          <label class="verification-dialog__field">
            <span>Require verification</span>
            <input type="checkbox" name="required" ${verification.required ? 'checked' : ''} />
          </label>
          <label class="verification-dialog__field">
            <span>Method</span>
            <input type="text" name="method" value="${htmlEscape(verification.method)}" placeholder="Metric, alarm, or test" />
          </label>
          <label class="verification-dialog__field">
            <span>Evidence</span>
            <textarea name="evidence" rows="2" placeholder="Link or note">${htmlEscape(verification.evidence)}</textarea>
          </label>
          <label class="verification-dialog__field">
            <span>Result</span>
            <input type="text" name="result" value="${htmlEscape(verification.result)}" placeholder="Pass/Fail or note" />
          </label>
          <label class="verification-dialog__field">
            <span>Checked by</span>
            <input type="text" name="checkedBy" value="${htmlEscape(verification.checkedBy)}" placeholder="Name or handle" />
          </label>
          <label class="verification-dialog__field">
            <span>Checked at</span>
            <input type="datetime-local" name="checkedAt" value="${formatCheckedAtInput(verification.checkedAt)}" />
          </label>
          <div class="verification-dialog__actions">
            <button type="button" data-action="cancel" class="verification-dialog__button verification-dialog__button--ghost">Cancel</button>
            <button type="submit" class="verification-dialog__button verification-dialog__button--primary">Save</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const form = overlay.querySelector('form');
    const requiredInput = form.querySelector('input[name="required"]');
    const methodInput = form.querySelector('input[name="method"]');
    const evidenceInput = form.querySelector('textarea[name="evidence"]');
    const resultInput = form.querySelector('input[name="result"]');
    const checkedByInput = form.querySelector('input[name="checkedBy"]');
    const checkedAtInput = form.querySelector('input[name="checkedAt"]');

    const firstField = methodInput;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeVerificationDialog();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    const focusTimer = requestAnimationFrame(() => {
      if (firstField) {
        firstField.focus();
        firstField.select?.();
      }
    });

    disposeVerificationDialog = () => {
      cancelAnimationFrame(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      const verifyBtn = listEl.querySelector(`.action-row[data-id="${action.id}"] .verify-button`);
      if (verifyBtn && typeof verifyBtn.focus === 'function') {
        verifyBtn.focus();
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeVerificationDialog();
      }
    });

    overlay.querySelector('.verification-dialog__close').addEventListener('click', () => {
      closeVerificationDialog();
    });

    form.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      closeVerificationDialog();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const payload = {
        required: requiredInput.checked,
        method: methodInput.value.trim(),
        evidence: evidenceInput.value.trim(),
        result: resultInput.value.trim(),
        checkedBy: checkedByInput.value.trim(),
        checkedAt: parseCheckedAtValue(checkedAtInput.value),
      };

      if (payload.required && payload.result && !payload.checkedAt) {
        payload.checkedAt = new Date().toISOString();
      }

      applyPatch(action.id, { verification: payload }, () => {
        closeVerificationDialog();
      });
    });
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
    const target = e.target;
    if (target) {
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea') return;
      if (target.isContentEditable) return;
      if (target.closest && target.closest('.summary__title--editing')) return;
    }
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
  refreshBtn.addEventListener('click', handleRefresh);

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
