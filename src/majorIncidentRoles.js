/**
 * @module majorIncidentRoles
 * @summary Renders Major Incident phase ownership guidance without persisting UI state.
 * @description Owns the `[feature:major-incident-role-legend]` mount and contextual
 *   role badges attached to existing workflow headings and KT question rows. It
 *   responds to `intake:mode-changed` and leaves all form IDs and storage untouched.
 */

import { getActiveIntakeMode } from './intakeModeController.js';
import {
  INTAKE_MODE_IDS,
  MAJOR_INCIDENT_KT_PHASES,
  MAJOR_INCIDENT_WORKFLOW_METADATA
} from './intakeModes.js';

const MODE_CHANGE_EVENT = 'intake:mode-changed';
const BADGE_CLASS = 'major-incident-role-badge';
const PHASE_ICONS = Object.freeze({
  situationAppraisal: '◎',
  problemAnalysis: '⌕',
  decisionAnalysis: '✓',
  potentialProblemAnalysis: '⛨'
});

const HEADING_TARGETS = Object.freeze([
  ['#problem-summary > h3', 'problemSummary'],
  ['.card.impact > h3', 'impact'],
  ['#kt-is-is-not', 'problemAnalysis'],
  ['#possibleCausesCard > h3', 'possibleCauses'],
  ['#commsDrawerTitle', 'communications'],
  ['#stepsDrawerTitle', 'steps']
]);

/** Builds a complete text description of phase participation for assistive technology and tooltips. */
function describeRoles(metadata) {
  const consulted = metadata.supportingRoles.map(({ role }) => role).join(', ');
  return `${metadata.phase.label}. Primary: ${metadata.primaryRespondent.role}. Consulted: ${consulted}. Approver: ${metadata.approvalDecisionRole.role}. ${metadata.phase.purpose}`;
}

/** Returns a shorter role name suitable for the always-visible badge. */
function shortRole(role) {
  return role
    .replace('Incident Manager / Incident Commander', 'Incident Manager')
    .replace('Application Owner or delegated business/service owner', 'Application Owner')
    .replace('Subject-Matter Expert', 'SME');
}

/** Creates a contextual badge whose text, colour, and accessible description all convey ownership. */
function createBadge(metadata) {
  const badge = document.createElement('span');
  badge.className = BADGE_CLASS;
  badge.dataset.phase = metadata.phase.id;
  badge.title = describeRoles(metadata);
  badge.setAttribute('aria-label', describeRoles(metadata));
  badge.innerHTML = `<span aria-hidden="true">${PHASE_ICONS[metadata.phase.id]}</span><span>${metadata.phase.label} · ${shortRole(metadata.primaryRespondent.role)} leads</span>`;
  return badge;
}

/** Renders all four phases into the static Major Incident legend mount. */
function renderLegend() {
  const mount = document.getElementById('majorIncidentRoleLegendItems');
  if (!mount || mount.childElementCount) return;

  MAJOR_INCIDENT_KT_PHASES.forEach((phase) => {
    const item = document.createElement('article');
    item.className = 'major-incident-role-legend__item';
    item.dataset.phase = phase.id;
    item.innerHTML = `
      <div class="major-incident-role-legend__heading">
        <span class="major-incident-role-legend__swatch" aria-hidden="true"></span>
        <span class="major-incident-role-legend__icon" aria-hidden="true">${PHASE_ICONS[phase.id]}</span>
        <span><small>KT phase</small><strong>${phase.label}</strong></span>
      </div>
      <p class="major-incident-role-legend__role">${shortRole(phase.primaryRespondent.role)} leads</p>
      <p>${phase.purpose}</p>`;
    mount.appendChild(item);
  });
}

/** Attaches idempotent badges to workflow headings and each rendered KT question row. */
function renderContextualBadges() {
  HEADING_TARGETS.forEach(([selector, area]) => {
    const heading = document.querySelector(selector);
    const metadata = MAJOR_INCIDENT_WORKFLOW_METADATA[area];
    if (heading && metadata && !heading.querySelector(`.${BADGE_CLASS}`)) {
      heading.appendChild(createBadge(metadata));
    }
  });

  const metadata = MAJOR_INCIDENT_WORKFLOW_METADATA.problemAnalysis;
  document.querySelectorAll('#tbody tr[data-question-id] > th:first-child').forEach((heading) => {
    if (!heading.querySelector(`.${BADGE_CLASS}`)) heading.appendChild(createBadge(metadata));
  });
}

/** Shows role guidance only in Major Incident mode while retaining reusable badge DOM. */
function updateVisibility() {
  const active = getActiveIntakeMode() === INTAKE_MODE_IDS.MAJOR_INCIDENT;
  const legend = document.getElementById('majorIncidentRoleLegend');
  if (legend) {
    legend.hidden = !active;
    legend.setAttribute('aria-hidden', String(!active));
  }
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => {
    badge.hidden = !active;
  });
}

/**
 * Initialises the legend, contextual badges, and mode-change listener.
 * @returns {void}
 */
export function initMajorIncidentRoles() {
  renderLegend();
  renderContextualBadges();
  updateVisibility();
  window.addEventListener(MODE_CHANGE_EVENT, updateVisibility);
}
