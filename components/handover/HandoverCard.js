/**
 * Renders the handover card that summarizes current status, shifts, and next
 * steps for incident responders. The card presents five labeled sections—
 * current state, changes, risks, metrics, and next actions—and mirrors user
 * input into bullet lists for quick scanning.
 *
 * Key exports:
 * - {@link mountHandoverCard}: Mounts the card markup inside the provided host
 *   element and wires input listeners.
 */

export const HANDOVER_SECTIONS = [
  {
    id: 'current-state',
    title: 'Current State',
    helper: 'Snapshot of the incident right now.',
    placeholder: 'System posture, stability, and ownership...'
  },
  {
    id: 'what-changed',
    title: 'What Changed',
    helper: 'New observations since the last update.',
    placeholder: 'Recent shifts, toggles, or discoveries...'
  },
  {
    id: 'remaining-risks',
    title: 'Remaining Risks',
    helper: 'Edge cases or impact that still worry you.',
    placeholder: 'Edge cases, blast radius, rollback risks...'
  },
  {
    id: 'must-watch-metrics',
    title: 'Must-Watch Metrics',
    helper: 'Vitals that decide whether we are winning.',
    placeholder: 'Error rates, latency slices, saturation signals...'
  },
  {
    id: 'whats-next',
    title: "What's Next",
    helper: 'Next moves for the incoming lead.',
    placeholder: 'Immediate steps, owners, decision points...'
  }
];

/**
 * Convert newline-delimited input into list items and render them beneath the
 * matching section.
 *
 * @param {HTMLTextAreaElement} textarea - Textarea whose value should be split into bullets.
 * @param {Map<string, HTMLUListElement>} listLookup - Map connecting section IDs to list elements.
 * @returns {void}
 */
function syncBullets(textarea, listLookup) {
  const sectionId = textarea?.dataset?.section;
  if (!sectionId) return;

  const listEl = listLookup.get(sectionId);
  if (!listEl) return;

  const items = textarea.value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  listEl.replaceChildren();
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    listEl.appendChild(li);
  });
}

/**
 * Mount the Handover card into the provided host element and bind textarea
 * listeners so each section displays bullets for every entered line item.
 *
 * @param {HTMLElement} hostEl - Container node where the handover card will render.
 * @param {{onChange?: () => void}} [options] - Optional hooks for reacting to edits.
 * @returns {void}
 */
export function mountHandoverCard(hostEl, { onChange } = {}) {
  if (!hostEl) {
    throw new Error('mountHandoverCard requires a host element');
  }

  hostEl.innerHTML = `
    <section class="card" id="handover-card">
      <header class="card-header">
        <div class="card-title-group">
          <h3>Handover</h3>
          <div class="muted">State, risks, and next moves</div>
        </div>
      </header>
      <div class="handover-grid">
        ${HANDOVER_SECTIONS.map(section => `
          <article class="handover-section" data-section-block="${section.id}">
            <div class="handover-section__title">
              <h4>${section.title}</h4>
              <p class="muted">${section.helper}</p>
            </div>
            <label class="handover-input__label" for="handover-${section.id}">
              Bullet items (one per line)
            </label>
            <textarea
              id="handover-${section.id}"
              class="tableta handover-input"
              rows="3"
              data-section="${section.id}"
              placeholder="${section.placeholder}"
            ></textarea>
            <ul class="handover-list" data-section-list="${section.id}" aria-live="polite"></ul>
          </article>
        `).join('')}
      </div>
    </section>
  `;

  const textareas = Array.from(hostEl.querySelectorAll('.handover-input'));
  const listLookup = new Map(
    HANDOVER_SECTIONS.map(section => [
      section.id,
      hostEl.querySelector(`[data-section-list="${section.id}"]`)
    ])
  );

  textareas.forEach(textarea => {
    textarea.addEventListener('input', () => {
      syncBullets(textarea, listLookup);
      if (typeof onChange === 'function') {
        onChange();
      }
    });
  });
}
