/**
 * Menu bar controller that orchestrates the header navigation clusters,
 * including hover-activated panels, keyboard roving, and Escape/Enter
 * behaviour for the [header] anchor.
 *
 * @module menuBar
 */

const DEFAULT_HOVER_DELAY = 140;

/**
 * Initialize the header menu bar, binding hover and keyboard affordances to
 * each trigger and menu item.
 *
 * @param {object} [options] - Optional configuration for the menubar.
 * @param {number} [options.hoverDelay=DEFAULT_HOVER_DELAY] - Delay before
 * opening or closing menus when hovering.
 * @returns {HTMLElement|null} The menu bar element when mounted, otherwise
 * <code>null</code> if no menu exists.
 */
export function initMenuBar({ hoverDelay = DEFAULT_HOVER_DELAY } = {}) {
  const menuBar = document.querySelector('.menu-bar');
  if (!menuBar) {
    return null;
  }

  const triggers = Array.from(menuBar.querySelectorAll('[data-menu-target]'));
  const menus = buildMenuIndex(menuBar, triggers);
  let openMenuId = null;
  let hoverTimer = null;

  function closeMenu(menuId) {
    const entry = menus.get(menuId);
    if (!entry) {
      return;
    }
    entry.panel.classList.remove('is-open');
    entry.panel.hidden = true;
    entry.trigger.setAttribute('aria-expanded', 'false');
    if (openMenuId === menuId) {
      openMenuId = null;
    }
  }

  function closeAllMenus() {
    menus.forEach((_, menuId) => closeMenu(menuId));
  }

  function openMenu(menuId, { focusFirstItem = false, focusLastItem = false } = {}) {
    const entry = menus.get(menuId);
    if (!entry) {
      return;
    }

    closeAllMenus();
    entry.panel.hidden = false;
    entry.panel.classList.add('is-open');
    entry.trigger.setAttribute('aria-expanded', 'true');
    openMenuId = menuId;

    if (focusFirstItem || focusLastItem) {
      const items = getMenuItems(entry.panel);
      const target = focusLastItem ? items[items.length - 1] : items[0];
      if (target) {
        target.focus();
      }
    }
  }

  function toggleMenu(menuId, options = {}) {
    if (openMenuId === menuId) {
      closeMenu(menuId);
      return;
    }
    openMenu(menuId, options);
  }

  function scheduleHover(action) {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(action, hoverDelay);
  }

  function handleTriggerKeydown(event, trigger) {
    const { key } = event;
    const menuId = trigger.dataset.menuTarget;
    switch (key) {
      case 'ArrowRight':
        event.preventDefault();
        focusSiblingTrigger(triggers, trigger, 1, menuId ? { openNext: true, openMenuFn: openMenu } : {});
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusSiblingTrigger(triggers, trigger, -1, menuId ? { openNext: true, openMenuFn: openMenu } : {});
        break;
      case 'ArrowDown':
        event.preventDefault();
        openMenu(menuId, { focusFirstItem: true });
        break;
      case 'ArrowUp':
        event.preventDefault();
        openMenu(menuId, { focusLastItem: true });
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        toggleMenu(menuId, { focusFirstItem: true });
        break;
      }
      case 'Escape':
        closeAllMenus();
        break;
      default:
        break;
    }
  }

  function handleMenuItemKeydown(event, item) {
    const panel = item.closest('.menu-panel');
    if (!panel) {
      return;
    }
    const menuId = panel.id;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAdjacentMenuItem(panel, item, 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAdjacentMenuItem(panel, item, -1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        focusSiblingTrigger(triggers, menus.get(menuId)?.trigger, 1, {
          openNext: true,
          focusFirst: true,
          openMenuFn: openMenu
        });
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusSiblingTrigger(triggers, menus.get(menuId)?.trigger, -1, {
          openNext: true,
          focusFirst: true,
          openMenuFn: openMenu
        });
        break;
      case 'Escape': {
        const trigger = menus.get(menuId)?.trigger;
        closeMenu(menuId);
        if (trigger) {
          trigger.focus();
        }
        break;
      }
      default:
        break;
    }
  }

  function attachMenuBehaviour() {
    triggers.forEach(trigger => {
      const menuId = trigger.dataset.menuTarget;
      trigger.addEventListener('click', event => {
        event.preventDefault();
        toggleMenu(menuId, { focusFirstItem: true });
      });
      trigger.addEventListener('pointerenter', () => scheduleHover(() => openMenu(menuId)));
      trigger.addEventListener('keydown', event => handleTriggerKeydown(event, trigger));
    });

    menuBar.addEventListener('click', event => {
      const item = event.target.closest('.menu-item');
      if (item && !item.classList.contains('menu-trigger')) {
        closeAllMenus();
      }
    });

    menuBar.addEventListener('pointerenter', () => clearTimeout(hoverTimer));
    menuBar.addEventListener('pointerleave', () => scheduleHover(() => closeAllMenus()));

    menuBar.addEventListener('keydown', event => {
      const trigger = event.target.closest('[data-menu-target]');
      if (trigger) {
        handleTriggerKeydown(event, trigger);
        return;
      }
      const item = event.target.closest('.menu-item');
      if (item) {
        handleMenuItemKeydown(event, item);
      }
    });

    document.addEventListener('pointerdown', event => {
      if (!menuBar.contains(event.target)) {
        closeAllMenus();
      }
    });
  }

  attachMenuBehaviour();
  return menuBar;
}

function buildMenuIndex(menuBar, triggers) {
  const map = new Map();
  triggers.forEach(trigger => {
    const menuId = trigger.dataset.menuTarget;
    if (!menuId) {
      return;
    }
    const panel = menuBar.querySelector(`#${menuId}`);
    if (!panel) {
      return;
    }
    map.set(menuId, { trigger, panel });
  });
  return map;
}

function getMenuItems(panel) {
  return Array.from(panel.querySelectorAll('[role="menuitem"]'));
}

function focusAdjacentMenuItem(panel, currentItem, delta) {
  const items = getMenuItems(panel);
  const currentIndex = items.indexOf(currentItem);
  if (currentIndex === -1) {
    return;
  }
  const nextIndex = (currentIndex + delta + items.length) % items.length;
  const nextItem = items[nextIndex];
  if (nextItem) {
    nextItem.focus();
  }
}

function focusSiblingTrigger(
  triggers,
  currentTrigger,
  delta,
  { openNext = false, focusFirst = false, openMenuFn } = {}
) {
  const currentIndex = triggers.indexOf(currentTrigger);
  if (currentIndex === -1) {
    return;
  }
  const nextIndex = (currentIndex + delta + triggers.length) % triggers.length;
  const nextTrigger = triggers[nextIndex];
  if (nextTrigger) {
    nextTrigger.focus();
    if (openNext && typeof openMenuFn === 'function') {
      const menuId = nextTrigger.dataset.menuTarget;
      if (menuId) {
        openMenuFn(menuId, { focusFirstItem: focusFirst });
      }
    }
  }
}
