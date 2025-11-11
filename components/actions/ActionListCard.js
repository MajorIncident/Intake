/**
 * Renders and manages the intake action list card UI, including refresh controls,
 * inline editing workflows, and links to possible causes. The module emits the
 * `intake:actions-updated` window event when the list changes and exposes
 * utilities that other modules can call to refresh or mount the card.
 *
 * Key exports:
 * - {@link refreshActionList}: Broadcasts a refresh to all subscribed handlers.
 * - {@link mountActionListCard}: Mounts the card markup and binds DOM listeners.
 */
import { listActions, createAction, patchAction, removeAction, sortActions } from '../../src/actionsStore.js';
import { OWNER_CATEGORIES } from '../../src/constants.js';
import { getAnalysisId, getLikelyCauseId } from '../../src/appState.js';
import { getPossibleCauses, causeHasFailure, buildHypothesisSentence } from '../../src/kt.js';
import { showToast } from '../../src/toast.js';

const ACTIONS_UPDATED_EVENT = 'intake:actions-updated';
const REFRESH_CLEANUP_KEY = Symbol('intake:action-list-refresh-cleanup');
const refreshSubscribers = new Set();

/**
 * Adds a handler that will run when {@link refreshActionList} broadcasts a refresh.
 *
 * @param {() => void} handler - Callback executed during refresh broadcasts. Ignored when falsy.
 * @returns {() => void} Cleanup function that unregisters the handler.
 */
function registerActionListRefresh(handler) {
  if (typeof handler !== 'function') {
    return () => {};
  }
  refreshSubscribers.add(handler);
  return () => {
    refreshSubscribers.delete(handler);
  };
}

/**
 * Triggers all registered refresh handlers so they can reconcile their state.
 *
 * @returns {void}
 */
export function refreshActionList() {
  refreshSubscribers.forEach(handler => {
    try {
      handler();
    } catch (error) {
      console.debug('[actions:refresh]', error);
    }
  });
}

/**
 * Dispatches the `intake:actions-updated` window event for cross-module listeners.
 *
 * @param {object} [detail={}] - Additional data describing the change.
 * @returns {void}
 */
function announceActionListChange(detail = {}) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(ACTIONS_UPDATED_EVENT, { detail }));
  } catch (error) {
    console.debug('[actions:event]', detail, error);
  }
}

/**
 * Mounts the action list card UI into the provided host element and wires up all
 * event listeners required for inline editing and persistence.
 *
 * @param {HTMLElement} hostEl - Container node that receives the rendered card markup.
 * @returns {void}
 */
export function mountActionListCard(hostEl) {
  let cachedAnalysisId = typeof getAnalysisId() === 'string' ? getAnalysisId() : '';

  /**
   * Resolve the active analysis identifier, falling back to the last known value.
   *
   * @returns {string} Currently active analysis identifier or an empty string when unknown.
   */
  function getCurrentAnalysisId() {
    const next = getAnalysisId();
    if (typeof next === 'string' && next.trim()) {
      cachedAnalysisId = next.trim();
    }
    return cachedAnalysisId;
  }

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
  let disposeBlockerDialog = null;
  let disposeVerificationDialog = null;
  let disposeOwnerDialog = null;
  let disposeCausePicker = null;

  let causeLookup = { list: [], map: new Map() };

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

  function refreshCauseLookup() {
    const source = getPossibleCauses();
    const list = Array.isArray(source) ? source : [];
    const map = new Map();
    list.forEach((cause, index) => {
      if (cause && typeof cause.id === 'string') {
        map.set(cause.id, { cause, index });
      }
    });
    causeLookup = { list, map };
  }

  function getActionCauseId(action) {
    if (!action || !action.links) return '';
    const value = action.links.hypothesisId;
    return typeof value === 'string' ? value.trim() : '';
  }

  function formatCauseCode(index) {
    if (typeof index !== 'number' || index < 0) {
      return 'Cause';
    }
    const number = index + 1;
    return `C-${String(number).padStart(2, '0')}`;
  }

  function getLinkableCauses() {
    return causeLookup.list
      .map((cause, index) => ({ cause, index }))
      .filter(entry => entry.cause && !causeHasFailure(entry.cause));
  }

  function render() {
    closeMoreMenu();
    closeBlockerDialog();
    closeCausePicker();
    refreshCauseLookup();
    const analysisId = getCurrentAnalysisId();
    const items = listActions(analysisId);
    listEl.innerHTML = items.map(renderActionRow).join('');
    const itemMap = new Map(items.map(item => [item.id, item]));

    // Wiring per row:
    listEl.querySelectorAll('.action-row').forEach(row => {
      const id = row.dataset.id;
      const action = itemMap.get(id);

      row.querySelector('.status').addEventListener('click', () => advanceStatus(id));
      row.querySelector('.priority').addEventListener('click', () => cyclePriority(id));
      row.querySelector('.owner').addEventListener('click', () => setOwner(id));
      row.querySelector('.eta').addEventListener('click', () => setEta(id));
      row.querySelector('.verify-button').addEventListener('click', () => verifyAction(id));
      row.querySelector('.more').addEventListener('click', (event) => moreMenu(id, event.currentTarget));
      row.querySelector('.summary__title').addEventListener('dblclick', () => editSummary(id));
      const changeCauseBtn = row.querySelector('[data-action="change-cause"]');
      if (changeCauseBtn && action) {
        changeCauseBtn.addEventListener('click', (event) => {
          openCausePicker(action, event.currentTarget);
        });
      }
      const unlinkCauseBtn = row.querySelector('[data-action="unlink-cause"]');
      if (unlinkCauseBtn && action) {
        unlinkCauseBtn.addEventListener('click', () => {
          handleCauseLinkSelection(action, '');
        });
      }
      row.addEventListener('keydown', (e) => keyControls(e, id));
      row.tabIndex = 0;
    });

    announceActionListChange({ total: items.length });
  }

  /**
   * Sorts and re-renders the action list for the active analysis before showing feedback.
   *
   * @returns {void}
   */
  function handleRefresh() {
    const analysisId = getCurrentAnalysisId();
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

  function closeBlockerDialog() {
    if (typeof disposeBlockerDialog === 'function') {
      disposeBlockerDialog();
      disposeBlockerDialog = null;
    }
  }

  function closeVerificationDialog() {
    if (typeof disposeVerificationDialog === 'function') {
      disposeVerificationDialog();
      disposeVerificationDialog = null;
    }
  }

  function closeOwnerDialog() {
    if (typeof disposeOwnerDialog === 'function') {
      disposeOwnerDialog();
      disposeOwnerDialog = null;
    }
  }

  function closeCausePicker() {
    if (typeof disposeCausePicker === 'function') {
      disposeCausePicker();
      disposeCausePicker = null;
    }
  }

  function isActionLocked(action) {
    if (!action || typeof action !== 'object') return false;
    return action.status === 'Done' || action.status === 'Cancelled';
  }

  /**
   * Persists the chosen cause link for an action and restores focus to the trigger.
   *
   * @param {{ id: string, links?: Record<string, string> }} action - Action being updated.
   * @param {string} nextId - Selected cause identifier or empty string to unlink.
   * @returns {void}
   */
  function handleCauseLinkSelection(action, nextId) {
    if (!action) return;
    const normalized = typeof nextId === 'string' ? nextId.trim() : '';
    const current = getActionCauseId(action);
    if (current === normalized) {
      closeCausePicker();
      return;
    }
    const nextLinks = { ...(action.links || {}) };
    nextLinks.hypothesisId = normalized;
    closeCausePicker();
    applyPatch(action.id, { links: nextLinks });
  }

  function openCausePicker(action, anchorEl) {
    if (!action) return;
    refreshCauseLookup();
    closeCausePicker();

    const overlay = document.createElement('div');
    overlay.className = 'cause-picker-overlay';

    const popover = document.createElement('div');
    popover.className = 'cause-picker';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'true');
    popover.setAttribute('aria-labelledby', 'causePickerTitle');

    const currentId = getActionCauseId(action);
    const currentMeta = currentId ? causeLookup.map.get(currentId) : null;
    const linkable = getLinkableCauses();
    const notice = currentId && !currentMeta
      ? `
        <div class="cause-picker__notice" role="status">
          The linked cause was ruled out. Choose another option or unlink it.
        </div>
      `
      : '';

    const itemsMarkup = linkable.map(({ cause, index }) => {
      const causeId = escapeAttribute(cause.id);
      const heading = `Cause ${formatCauseCode(index)}`;
      const summary = buildHypothesisSentence(cause);
      const selected = cause.id === currentId;
      const selectedAttr = selected ? '1' : '0';
      return `
        <li class="cause-picker__list-item">
          <button type="button" class="cause-picker__option" role="option" aria-selected="${selected ? 'true' : 'false'}" data-selected="${selectedAttr}" data-cause-id="${causeId}">
            <span class="cause-picker__option-heading">${htmlEscape(heading)}</span>
            <span class="cause-picker__option-summary">${htmlEscape(summary)}</span>
          </button>
        </li>
      `;
    }).join('');

    const listMarkup = linkable.length
      ? `
        <ul class="cause-picker__list" role="listbox" aria-label="Linkable causes">
          ${itemsMarkup}
        </ul>
      `
      : `
        <div class="cause-picker__empty">
          <p>No eligible causes are available.</p>
          <p class="cause-picker__empty-hint">Causes marked as failed are hidden automatically.</p>
        </div>
      `;

    popover.innerHTML = `
      <header class="cause-picker__header">
        <h4 id="causePickerTitle">Link to Cause</h4>
        <button type="button" class="cause-picker__close" aria-label="Close">×</button>
      </header>
      <div class="cause-picker__body">
        ${notice}
        ${listMarkup}
      </div>
      <footer class="cause-picker__footer">
        <button type="button" class="cause-picker__button cause-picker__button--ghost" data-action="clear">Unlink</button>
        <span class="cause-picker__spacer"></span>
        <button type="button" class="cause-picker__button cause-picker__button--ghost" data-action="cancel">Cancel</button>
      </footer>
    `;

    overlay.appendChild(popover);
    document.body.appendChild(overlay);

    const alignPopover = () => {
      const popRect = popover.getBoundingClientRect();
      const anchorRect = anchorEl && typeof anchorEl.getBoundingClientRect === 'function'
        ? anchorEl.getBoundingClientRect()
        : null;
      let top;
      let left;
      if (anchorRect) {
        top = anchorRect.bottom + 8;
        left = anchorRect.left;
        if (top + popRect.height > window.innerHeight - 12) {
          top = Math.max(12, anchorRect.top - popRect.height - 8);
        }
        const maxLeft = window.innerWidth - popRect.width - 12;
        left = Math.min(Math.max(12, left), Math.max(12, maxLeft));
      } else {
        top = Math.max(24, (window.innerHeight - popRect.height) / 2);
        left = Math.max(24, (window.innerWidth - popRect.width) / 2);
      }
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCausePicker();
      }
    };

    const onResize = () => {
      alignPopover();
    };

    overlay.addEventListener('click', (event) => {
      if (!popover.contains(event.target)) {
        closeCausePicker();
      }
    });

    const closeBtn = popover.querySelector('.cause-picker__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        closeCausePicker();
      });
    }

    const cancelBtn = popover.querySelector('[data-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        closeCausePicker();
      });
    }

    const clearBtn = popover.querySelector('[data-action="clear"]');
    if (clearBtn) {
      if (!currentId) {
        clearBtn.disabled = true;
      }
      clearBtn.addEventListener('click', () => {
        handleCauseLinkSelection(action, '');
      });
    }

    popover.querySelectorAll('[data-cause-id]').forEach(button => {
      button.addEventListener('click', () => {
        const next = button.dataset.causeId || '';
        handleCauseLinkSelection(action, next);
      });
    });

    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onResize);

    disposeCausePicker = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onResize);
      overlay.remove();
      if (anchorEl && typeof anchorEl.focus === 'function') {
        anchorEl.focus();
      }
    };

    requestAnimationFrame(() => {
      alignPopover();
      const selectedBtn = popover.querySelector('[data-cause-id][data-selected="1"]');
      const firstBtn = popover.querySelector('[data-cause-id]');
      const fallback = (clearBtn && !clearBtn.disabled) ? clearBtn : cancelBtn || closeBtn || firstBtn;
      const focusTarget = selectedBtn || firstBtn || fallback;
      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus();
      }
    });
  }

  function openOwnerDialog(action) {
    closeOwnerDialog();

    const owner = normalizeOwnerForUI(action.owner);
    const overlay = document.createElement('div');
    overlay.className = 'owner-picker-overlay';
    overlay.innerHTML = `
      <div class="owner-picker" role="dialog" aria-modal="true" aria-labelledby="ownerPickerTitle" aria-describedby="ownerPickerDescription">
        <header class="owner-picker__header">
          <div class="owner-picker__heading">
            <h4 id="ownerPickerTitle">Assign Owner</h4>
            <p id="ownerPickerDescription" class="owner-picker__subtitle">Choose a team or person. You can type a name, pick a category, or both.</p>
          </div>
          <button type="button" class="owner-picker__close" aria-label="Close">×</button>
        </header>
        <form class="owner-picker__form">
          <div class="owner-picker__banner owner-picker__banner--warning" hidden>
            <span>This action is locked. You can’t change the owner.</span>
          </div>
          <label class="owner-picker__field">
            <span class="owner-picker__label">Owner Name</span>
            <input type="text" name="ownerName" placeholder="Type an owner name (e.g., ‘Jane Doe’ or ‘Acme NOC’)" autocomplete="off" />
          </label>
          <label class="owner-picker__field">
            <span class="owner-picker__label">Category</span>
            <select name="ownerCategory">
              <option value="">Select a category</option>
              ${OWNER_CATEGORY_OPTIONS_HTML}
            </select>
          </label>
          <label class="owner-picker__field owner-picker__field--sub">
            <span class="owner-picker__label">Sub-owner</span>
            <select name="ownerSubOwner" disabled>
              <option value="">Select a sub-owner</option>
            </select>
            <div class="owner-picker__other" hidden>
              <input type="text" name="ownerSubOwnerOther" placeholder="Enter custom sub-owner" autocomplete="off" />
            </div>
          </label>
          <p class="owner-picker__hint" role="status" aria-live="polite" hidden></p>
          <div class="owner-picker__error" role="alert" hidden></div>
          <label class="owner-picker__field owner-picker__field--notes">
            <span class="owner-picker__label">Notes for the owner (optional)</span>
            <textarea name="ownerNotes" maxlength="280" rows="3"></textarea>
            <span class="owner-picker__counter" aria-live="polite">280</span>
          </label>
          <footer class="owner-picker__actions">
            <button type="button" class="owner-picker__button owner-picker__button--ghost" data-action="clear">Clear</button>
            <span class="owner-picker__spacer"></span>
            <button type="button" class="owner-picker__button owner-picker__button--ghost" data-action="cancel">Cancel</button>
            <button type="submit" class="owner-picker__button owner-picker__button--primary" data-action="assign" disabled>Assign Owner</button>
          </footer>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector('.owner-picker__form');
    const closeBtn = overlay.querySelector('.owner-picker__close');
    const nameInput = form.querySelector('input[name="ownerName"]');
    const categorySelect = form.querySelector('select[name="ownerCategory"]');
    const subOwnerSelect = form.querySelector('select[name="ownerSubOwner"]');
    const otherWrapper = form.querySelector('.owner-picker__other');
    const otherInput = form.querySelector('input[name="ownerSubOwnerOther"]');
    const notesInput = form.querySelector('textarea[name="ownerNotes"]');
    const hintEl = form.querySelector('.owner-picker__hint');
    const errorEl = form.querySelector('.owner-picker__error');
    const counterEl = form.querySelector('.owner-picker__counter');
    const cancelBtn = form.querySelector('[data-action="cancel"]');
    const clearBtn = form.querySelector('[data-action="clear"]');
    const assignBtn = form.querySelector('[data-action="assign"]');
    const bannerEl = form.querySelector('.owner-picker__banner');

    const locked = isActionLocked(action);
    bannerEl.hidden = !locked;

    nameInput.value = owner.name;
    categorySelect.value = owner.category;
    notesInput.value = owner.notes ? owner.notes.slice(0, 280) : '';

    errorEl.hidden = true;
    errorEl.textContent = '';

    if (locked) {
      nameInput.disabled = true;
      categorySelect.disabled = true;
      subOwnerSelect.disabled = true;
      otherInput.disabled = true;
      notesInput.disabled = true;
      assignBtn.disabled = true;
      clearBtn.disabled = true;
    }

    function populateSubOwnerOptions(categoryId, selectedValue) {
      const category = getOwnerCategory(categoryId);
      const options = category && Array.isArray(category.subOwners) ? category.subOwners : [];
      const defaultOption = '<option value="">Select a sub-owner</option>';
      if (!options.length) {
        subOwnerSelect.innerHTML = defaultOption;
        subOwnerSelect.disabled = true;
        subOwnerSelect.value = '';
        otherWrapper.hidden = true;
        otherInput.value = '';
        otherInput.disabled = true;
        return;
      }
      const optionsHtml = options
        .map(entry => `<option value="${htmlEscape(entry.id)}">${htmlEscape(entry.label)}</option>`)
        .join('');
      subOwnerSelect.innerHTML = `${defaultOption}${optionsHtml}<option value="${OWNER_OTHER_VALUE}">Other…</option>`;
      subOwnerSelect.disabled = locked;
      if (selectedValue && options.some(entry => entry.id === selectedValue)) {
        subOwnerSelect.value = selectedValue;
        otherWrapper.hidden = true;
        otherInput.value = '';
        otherInput.disabled = true;
      } else if (selectedValue) {
        subOwnerSelect.value = OWNER_OTHER_VALUE;
        otherWrapper.hidden = false;
        otherInput.disabled = locked;
        otherInput.value = selectedValue;
      } else {
        subOwnerSelect.value = '';
        otherWrapper.hidden = true;
        otherInput.value = '';
        otherInput.disabled = true;
      }
    }

    populateSubOwnerOptions(owner.category, owner.subOwner);

    function resolveSubOwnerValue() {
      if (subOwnerSelect.disabled) return '';
      const raw = subOwnerSelect.value;
      if (raw === OWNER_OTHER_VALUE) {
        return otherInput.value.trim();
      }
      return raw || '';
    }

    function updateHint() {
      if (locked) {
        hintEl.hidden = true;
        hintEl.textContent = '';
        return;
      }
      const categoryId = categorySelect.value;
      const category = getOwnerCategory(categoryId);
      const options = category && Array.isArray(category.subOwners) ? category.subOwners : [];
      const show = categoryId && options.length > 0 && subOwnerSelect.value === '';
      if (show) {
        hintEl.textContent = 'Select a sub-owner or continue with Category only.';
        hintEl.hidden = false;
      } else {
        hintEl.hidden = true;
        hintEl.textContent = '';
      }
    }

    function updateCounter() {
      const remaining = 280 - (notesInput.value || '').length;
      counterEl.textContent = String(Math.max(0, remaining));
    }

    function collectTelemetryState() {
      return {
        category: categorySelect.value || '',
        subOwner: resolveSubOwnerValue() || '',
        hasName: !!nameInput.value.trim(),
        hasNotes: !!notesInput.value.trim()
      };
    }

    function updateAssignState() {
      if (locked) {
        assignBtn.disabled = true;
        return;
      }
      const hasName = !!nameInput.value.trim();
      const hasCategory = !!categorySelect.value;
      const requiresOther = subOwnerSelect.value === OWNER_OTHER_VALUE;
      const otherFilled = !requiresOther || !!otherInput.value.trim();
      const canAssign = (hasName || hasCategory) && otherFilled;
      assignBtn.disabled = !canAssign;
    }

    function resetError() {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    updateHint();
    updateCounter();
    updateAssignState();

    const onSubmit = (event) => {
      event.preventDefault();
      if (assignBtn.disabled) return;
      resetError();
      const trimmedName = nameInput.value.trim();
      const categoryId = categorySelect.value;
      const subOwnerValue = resolveSubOwnerValue();
      const trimmedNotes = notesInput.value.trim().slice(0, 280);
      const payload = {
        name: trimmedName,
        category: categoryId,
        subOwner: subOwnerValue,
        notes: trimmedNotes,
        lastAssignedBy: 'local-user',
        lastAssignedAt: new Date().toISOString(),
        source: 'Manual'
      };
      const telemetry = {
        category: payload.category || '',
        subOwner: payload.subOwner || '',
        hasName: !!payload.name,
        hasNotes: !!payload.notes
      };
      assignBtn.disabled = true;
      const onOk = () => {
        assignBtn.disabled = false;
        closeOwnerDialog();
        trackOwnerEvent('owner_assigned', telemetry);
      };
      const onError = (message) => {
        assignBtn.disabled = false;
        errorEl.textContent = message || 'Unable to assign owner. Try again.';
        errorEl.hidden = false;
        trackOwnerEvent('owner_failed', telemetry);
      };
      applyPatch(action.id, { owner: payload }, onOk, onError);
    };

    const onOverlayClick = (event) => {
      if (event.target === overlay) {
        closeOwnerDialog();
      }
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeOwnerDialog();
      }
    };

    const onCloseClick = () => {
      closeOwnerDialog();
    };

    const onCancelClick = (event) => {
      event.preventDefault();
      closeOwnerDialog();
    };

    const onClearClick = (event) => {
      event.preventDefault();
      if (locked) return;
      nameInput.value = '';
      categorySelect.value = '';
      populateSubOwnerOptions('', '');
      notesInput.value = '';
      otherWrapper.hidden = true;
      otherInput.value = '';
      otherInput.disabled = true;
      updateHint();
      updateCounter();
      updateAssignState();
      resetError();
      trackOwnerEvent('owner_cleared', collectTelemetryState());
      requestAnimationFrame(() => {
        nameInput.focus();
      });
    };

    const onCategoryChange = () => {
      resetError();
      populateSubOwnerOptions(categorySelect.value, '');
      updateHint();
      updateAssignState();
    };

    const onSubOwnerChange = () => {
      resetError();
      if (subOwnerSelect.value === OWNER_OTHER_VALUE) {
        otherWrapper.hidden = false;
        if (!locked) {
          otherInput.disabled = false;
          requestAnimationFrame(() => otherInput.focus());
        }
      } else {
        otherWrapper.hidden = true;
        otherInput.value = '';
        otherInput.disabled = true;
      }
      updateHint();
      updateAssignState();
    };

    const onOtherInput = () => {
      resetError();
      updateAssignState();
    };

    const onNameInput = () => {
      resetError();
      updateAssignState();
    };

    const onNotesInput = () => {
      resetError();
      updateCounter();
      updateAssignState();
    };

    form.addEventListener('submit', onSubmit);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeyDown, true);
    closeBtn.addEventListener('click', onCloseClick);
    cancelBtn.addEventListener('click', onCancelClick);
    clearBtn.addEventListener('click', onClearClick);
    categorySelect.addEventListener('change', onCategoryChange);
    subOwnerSelect.addEventListener('change', onSubOwnerChange);
    otherInput.addEventListener('input', onOtherInput);
    nameInput.addEventListener('input', onNameInput);
    notesInput.addEventListener('input', onNotesInput);

    const focusTimer = requestAnimationFrame(() => {
      if (locked) {
        cancelBtn.focus();
      } else {
        nameInput.focus();
        if (nameInput.value) {
          nameInput.select();
        }
      }
    });

    disposeOwnerDialog = () => {
      cancelAnimationFrame(focusTimer);
      form.removeEventListener('submit', onSubmit);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeyDown, true);
      closeBtn.removeEventListener('click', onCloseClick);
      cancelBtn.removeEventListener('click', onCancelClick);
      clearBtn.removeEventListener('click', onClearClick);
      categorySelect.removeEventListener('change', onCategoryChange);
      subOwnerSelect.removeEventListener('change', onSubOwnerChange);
      otherInput.removeEventListener('input', onOtherInput);
      nameInput.removeEventListener('input', onNameInput);
      notesInput.removeEventListener('input', onNotesInput);
      overlay.remove();
      const trigger = listEl.querySelector(`.action-row[data-id="${action.id}"] .owner`);
      if (trigger && typeof trigger.focus === 'function') {
        trigger.focus();
      }
    };

    updateHint();
    updateAssignState();
    updateCounter();
    trackOwnerEvent('owner_opened', collectTelemetryState());
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

  function escapeAttribute(value) {
    if (typeof value !== 'string') return '';
    return htmlEscape(value).replace(/\n/g, '&#10;');
  }

  function renderCauseSubtitle(action) {
    const causeId = getActionCauseId(action);
    if (!causeId) return '';
    const meta = causeLookup.map.get(causeId);
    if (!meta || !meta.cause) {
      return `
        <div class="summary__subtitle summary__subtitle--warning" data-cause-id="${escapeAttribute(causeId)}">
          <span class="summary__subtitle-text">Linked cause is no longer eligible. Choose another option or unlink it.</span>
          <div class="summary__subtitle-actions">
            <button type="button" class="summary__subtitle-button" data-action="change-cause">Change</button>
            <button type="button" class="summary__subtitle-button" data-action="unlink-cause">Unlink</button>
          </div>
        </div>
      `;
    }
    const { cause, index } = meta;
    const code = formatCauseCode(index);
    const prefix = `Related to Cause ${code}`;
    const hypothesis = buildHypothesisSentence(cause);
    const safeHypothesis = htmlEscape(hypothesis);
    const safePrefix = htmlEscape(prefix);
    return `
      <div class="summary__subtitle" data-cause-id="${escapeAttribute(causeId)}">
        <span class="summary__subtitle-text">${safePrefix} — ${safeHypothesis}</span>
        <div class="summary__subtitle-actions">
          <button type="button" class="summary__subtitle-button" data-action="change-cause">Change</button>
          <button type="button" class="summary__subtitle-button" data-action="unlink-cause">Unlink</button>
        </div>
      </div>
    `;
  }

  const OWNER_OTHER_VALUE = '__OWNER_OTHER__';
  const OWNER_CATEGORY_INDEX = new Map();
  const OWNER_CATEGORY_OPTIONS_HTML = OWNER_CATEGORIES
    .map(category => `<option value="${htmlEscape(category.id)}">${htmlEscape(category.label)}</option>`)
    .join('');

  OWNER_CATEGORIES.forEach(category => {
    OWNER_CATEGORY_INDEX.set(category.id, category);
  });

  function getOwnerCategory(categoryId) {
    if (!categoryId) return null;
    return OWNER_CATEGORY_INDEX.get(categoryId) || null;
  }

  function getOwnerCategoryLabel(categoryId) {
    const category = getOwnerCategory(categoryId);
    return category ? category.label : '';
  }

  function getOwnerSubOwnerLabel(categoryId, subOwnerValue) {
    if (!subOwnerValue) return '';
    const category = getOwnerCategory(categoryId);
    if (!category || !Array.isArray(category.subOwners)) {
      return subOwnerValue;
    }
    const match = category.subOwners.find(entry => entry.id === subOwnerValue);
    return match ? match.label : subOwnerValue;
  }

  function normalizeOwnerForUI(raw) {
    const base = {
      name: '',
      category: '',
      subOwner: '',
      notes: '',
      lastAssignedBy: '',
      lastAssignedAt: '',
      source: 'Manual'
    };
    if (!raw) return base;
    if (typeof raw === 'string') {
      return { ...base, name: raw.trim() };
    }
    if (typeof raw !== 'object') return base;
    const owner = { ...base };
    if (typeof raw.name === 'string') owner.name = raw.name.trim();
    if (typeof raw.category === 'string') owner.category = raw.category.trim();
    if (typeof raw.subOwner === 'string') owner.subOwner = raw.subOwner.trim();
    if (typeof raw.notes === 'string') owner.notes = raw.notes.trim();
    if (typeof raw.lastAssignedBy === 'string') owner.lastAssignedBy = raw.lastAssignedBy.trim();
    if (typeof raw.lastAssignedAt === 'string') owner.lastAssignedAt = raw.lastAssignedAt.trim();
    if (typeof raw.source === 'string' && raw.source.trim()) owner.source = raw.source.trim();
    return owner;
  }

  function formatOwnerDisplay(raw) {
    const owner = normalizeOwnerForUI(raw);
    const name = owner.name;
    const categoryLabel = getOwnerCategoryLabel(owner.category);
    const subOwnerLabel = getOwnerSubOwnerLabel(owner.category, owner.subOwner);
    const notes = owner.notes;
    const hasName = !!name;
    const hasCategory = !!categoryLabel;
    const hasSubOwner = !!subOwnerLabel;
    const isEmpty = !hasName && !hasCategory && !hasSubOwner;
    if (isEmpty) {
      return {
        html: 'Owner',
        tooltip: 'Assign owner (O)',
        isEmpty: true,
        notes: ''
      };
    }

    const parts = [];
    if (hasName) {
      parts.push(`<span class="owner-chip__name">${htmlEscape(name)}</span>`);
    }

    let metaText = '';
    if (hasCategory) {
      metaText = htmlEscape(categoryLabel);
      if (hasSubOwner) {
        metaText += ` › ${htmlEscape(subOwnerLabel)}`;
      }
    } else if (hasSubOwner) {
      metaText = htmlEscape(subOwnerLabel);
    }

    if (metaText) {
      if (hasName) {
        parts.push('<span class="owner-chip__separator">•</span>');
      }
      parts.push(`<span class="owner-chip__meta">${metaText}</span>`);
    }

    const tooltipSegments = [];
    if (hasName) tooltipSegments.push(name);
    if (hasCategory) {
      const categorySegment = hasSubOwner ? `${categoryLabel} › ${subOwnerLabel}` : categoryLabel;
      tooltipSegments.push(categorySegment);
    } else if (hasSubOwner) {
      tooltipSegments.push(subOwnerLabel);
    }
    const tooltipMain = tooltipSegments.join(' • ');
    const tooltipNotes = notes ? `\nNotes: ${notes}` : '';
    const tooltipText = tooltipMain ? `Owner: ${tooltipMain}${tooltipNotes}` : `Owner${tooltipNotes}`;
    return {
      html: parts.join(''),
      tooltip: tooltipText,
      isEmpty: false,
      notes
    };
  }

  function trackOwnerEvent(name, detail = {}) {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (error) {
      console.debug('[owner-event]', name, detail, error);
    }
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
    const ownerNotes = normalizeOwnerForUI(action.owner).notes;
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
          ${ownerNotes ? `
          <div class="summary__detail-row">
            <dt>Owner notes</dt>
            <dd class="summary__value">${htmlEscape(ownerNotes).replace(/\n/g, '<br>')}</dd>
          </div>` : ''}
        </dl>
      `,
      state,
      verification,
    };
  }

  function renderBlockerDetail(action) {
    if (!action.notes) return '';
    const note = htmlEscape(action.notes).replace(/\n/g, '<br>');
    const status = action.status === 'Blocked' ? 'blocked' : 'not-blocked';
    return `
      <div class="summary__blocker" data-blocker-state="${status}">
        <span class="summary__blocker-label">Blocker</span>
        <span class="summary__blocker-text">${note}</span>
      </div>
    `;
  }

  function renderActionRow(it) {
    const detailTitle = it.detail ? htmlEscape(it.detail) : '';
    const { detail, state, verification } = renderVerificationDetail(it);
    const summaryTitle = htmlEscape(it.summary);
    const ownerDisplay = formatOwnerDisplay(it.owner);
    const ownerTooltip = ownerDisplay.tooltip || 'Assign owner (O)';
    const ownerTitleAttr = escapeAttribute(ownerTooltip);
    const ownerHtml = ownerDisplay.html || 'Owner';
    const verifyButtonLabel = verification.result ? 'Update' : 'Verify';
    const verifyState = state;
    const blockerDetail = renderBlockerDetail(it);
    const causeSubtitle = renderCauseSubtitle(it);
    return `
      <li class="action-row" data-id="${it.id}" data-status="${it.status}" data-priority="${it.priority}">
        <button class="chip chip--status status" data-status="${it.status}" title="Advance status (Space)">${htmlEscape(it.status)}</button>
        <button class="chip chip--priority priority" data-priority="${it.priority}" title="Set priority (1/2/3)">${htmlEscape(it.priority)}</button>
        <div class="summary" title="${detailTitle}">
          <div class="summary__title">${summaryTitle}</div>
          ${causeSubtitle}
          ${blockerDetail}
          ${detail}
        </div>
        <button class="chip chip--pill owner" data-owner-empty="${ownerDisplay.isEmpty ? '1' : '0'}" title="${ownerTitleAttr}" aria-label="${ownerTitleAttr}">${ownerHtml}</button>
        <button class="chip chip--pill eta" title="Set ETA (E)">${htmlEscape(fmtETA(it.dueAt))}</button>
        <button class="chip chip--pill verify-button" data-verify-state="${verifyState}" title="Record verification (V)">${verifyButtonLabel}</button>
        <button class="icon-button more" title="More">⋯</button>
      </li>
    `;
  }

  function editSummary(id) {
    const analysisId = getCurrentAnalysisId();
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

  function applyPatch(id, delta, onOk, onError) {
    const analysisId = getCurrentAnalysisId();
    const res = patchAction(analysisId, id, delta);
    if (res && res.__error) {
      if (typeof onError === 'function') {
        onError(res.__error);
      } else {
        toast(res.__error);
      }
      return null;
    }
    sortActions(analysisId);
    render();
    if (onOk) onOk(res);
    return res;
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
  /**
   * Steps the action status forward (Planned → In-Progress → Done) and saves it.
   *
   * @param {string} id - Identifier of the action to update.
   * @returns {void}
   */
  function advanceStatus(id) {
    const analysisId = getCurrentAnalysisId();
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it) return;
    const next = nextPrimaryStatus(it.status);
    applyPatch(id, { status: next });
  }
  /**
   * Rotates the action priority (P1 → P2 → P3) and persists the result.
   *
   * @param {string} id - Identifier of the action to reprioritise.
   * @returns {void}
   */
  function cyclePriority(id) {
    const analysisId = getCurrentAnalysisId();
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it) return;
    const next = it.priority === 'P1' ? 'P2' : it.priority === 'P2' ? 'P3' : 'P1';
    applyPatch(id, { priority: next });
  }
  function setOwner(id) {
    const analysisId = getCurrentAnalysisId();
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it) return;
    closeEtaPicker();
    closeVerificationDialog();
    closeBlockerDialog();
    closeMoreMenu();
    closeCausePicker();
    openOwnerDialog(it);
  }
  function setEta(id) {
    const analysisId = getCurrentAnalysisId();
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it) return;
    closeOwnerDialog();
    closeCausePicker();
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
    const analysisId = getCurrentAnalysisId();
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it) return;
    closeOwnerDialog();
    closeCausePicker();
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
    const analysisId = getCurrentAnalysisId();
    const items = listActions(analysisId);
    const it = items.find(x => x.id === id);
    if (!it || !anchorEl) return;

    closeMoreMenu();
    closeCausePicker();

    const overlay = document.createElement('div');
    overlay.className = 'action-menu-overlay';

    const menu = document.createElement('div');
    menu.className = 'action-menu';
    menu.setAttribute('role', 'menu');
    const isBlocked = it.status === 'Blocked';
    const blockLabel = isBlocked ? 'Update block status' : 'Mark blocked';
    const blockHint = isBlocked
      ? 'Refresh blocker notes to keep the team aligned'
      : 'Flag the action as blocked and capture context';
    const clearBlockButton = isBlocked
      ? `
        <button type="button" class="action-menu__item" data-action="clear-block">
          <span class="action-menu__label">Clear block</span>
          <span class="action-menu__hint">Remove blocker notes and return to Planned</span>
        </button>
      `
      : '';
    menu.innerHTML = `
      <button type="button" class="action-menu__item" data-action="block">
        <span class="action-menu__label">${blockLabel}</span>
        <span class="action-menu__hint">${blockHint}</span>
      </button>
      ${clearBlockButton}
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
            const analysisId = getCurrentAnalysisId();
            removeAction(analysisId, id);
            render();
          }
          return;
        }
        if (action === 'block') {
          openBlockerDialog(it);
          return;
        }
        if (action === 'clear-block') {
          applyPatch(id, { status: 'Planned', notes: '' }, () => {
            toast('Block cleared.');
          });
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
          openCausePicker(it, anchorEl);
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

  function openBlockerDialog(action) {
    closeBlockerDialog();

    const overlay = document.createElement('div');
    overlay.className = 'blocker-dialog-overlay';
    overlay.innerHTML = `
      <div class="blocker-dialog" role="dialog" aria-modal="true" aria-label="Manage block status">
        <header class="blocker-dialog__header">
          <h4>${action.status === 'Blocked' ? 'Update block status' : 'Mark as blocked'}</h4>
          <button type="button" class="blocker-dialog__close" aria-label="Close">×</button>
        </header>
        <form class="blocker-dialog__form">
          <p class="blocker-dialog__intro">Add context so others can help remove the blocker.</p>
          <label class="blocker-dialog__field">
            <span>Blocker notes</span>
            <textarea class="blocker-dialog__textarea" rows="4" required></textarea>
          </label>
          <div class="blocker-dialog__actions">
            <button type="button" class="blocker-dialog__button blocker-dialog__button--ghost" data-action="cancel">Cancel</button>
            <button type="submit" class="blocker-dialog__button blocker-dialog__button--primary">Save</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector('.blocker-dialog__form');
    const textarea = overlay.querySelector('.blocker-dialog__textarea');
    const closeBtn = overlay.querySelector('.blocker-dialog__close');
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');

    textarea.value = action.notes || '';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeBlockerDialog();
      }
    };

    const focusTimer = requestAnimationFrame(() => {
      textarea.focus();
      textarea.select();
    });

    const onSubmit = (event) => {
      event.preventDefault();
      const value = textarea.value.trim();
      if (!value) {
        textarea.setCustomValidity('Please add blocker notes so the team has context.');
        textarea.reportValidity();
        return;
      }
      textarea.setCustomValidity('');
      applyPatch(action.id, { status: 'Blocked', notes: value }, () => {
        closeBlockerDialog();
        toast('Action marked as blocked.');
      });
    };

    form.addEventListener('submit', onSubmit);
    const onCloseClick = () => { closeBlockerDialog(); };
    const onCancelClick = () => { closeBlockerDialog(); };
    const onOverlayClick = (event) => {
      if (event.target === overlay) {
        closeBlockerDialog();
      }
    };

    closeBtn.addEventListener('click', onCloseClick);
    cancelBtn.addEventListener('click', onCancelClick);
    overlay.addEventListener('click', onOverlayClick);

    document.addEventListener('keydown', onKeyDown, true);

    disposeBlockerDialog = () => {
      cancelAnimationFrame(focusTimer);
      document.removeEventListener('keydown', onKeyDown, true);
      form.removeEventListener('submit', onSubmit);
      closeBtn.removeEventListener('click', onCloseClick);
      cancelBtn.removeEventListener('click', onCancelClick);
      overlay.removeEventListener('click', onOverlayClick);
      overlay.remove();
      const trigger = listEl.querySelector(`.action-row[data-id="${action.id}"] .more`);
      if (trigger && typeof trigger.focus === 'function') {
        trigger.focus();
      }
    };
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
    const analysisId = getCurrentAnalysisId();
    const item = createAction(analysisId, { summary, links: { hypothesisId: getLikelyCauseId() || undefined } });
    if (item) {
      sortActions(analysisId);
      input.value = '';
      render();
      input.focus();
    }
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

  if (hostEl && typeof hostEl[REFRESH_CLEANUP_KEY] === 'function') {
    hostEl[REFRESH_CLEANUP_KEY]();
  }
  const unregisterRefresh = registerActionListRefresh(render);
  if (hostEl) {
    hostEl[REFRESH_CLEANUP_KEY] = unregisterRefresh;
  }

  render();
}
