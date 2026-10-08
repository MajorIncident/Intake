/**
 * @module startupExperienceHub
 * @description Detects resumable local contexts and owns explicit startup intent.
 *
 * The hub never serializes navigation state into Intake. It reads current
 * canonical persistence envelopes, renders independent Continue choices, and
 * delegates actual Student/Instructor resume to their existing lifecycle
 * controllers by applying the corresponding experience role.
 */

import { APP_STATE_VERSION } from './appStateVersion.js';
import {
  clearInstructorSession,
  isInstructorSessionExpired,
  readInstructorSession
} from './classroomInstructor.js';
import {
  clearStudentSession,
  isStudentSessionExpired,
  readStudentSession
} from './classroomStudent.js';
import { readClassroomJoinIntent } from './classroomJoinLink.js';
import {
  applyExperienceRole,
  closeExperienceRoleChooser,
  openExperienceRoleChooser,
  resetExperienceRoleSelection
} from './experienceRoleController.js';
import { EXPERIENCE_ROLE_IDS } from './experienceRoles.js';
import { DEFAULT_INTAKE_MODE } from './intakeModes.js';
import { STORAGE_KEY, migrateAppState } from './storage.js';

const BASELINE_STATE = migrateAppState({ meta: { version: APP_STATE_VERSION } });

let documentRef = null;
let windowRef = null;
let storageRef = null;
let locationRef = null;
let startFreshRef = () => {};
let context = null;

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function anyNonEmpty(values) {
  return values.some(nonEmpty);
}

function meaningfulTable(table) {
  return Array.isArray(table) && table.some(row => (
    row
    && !row.band
    && anyNonEmpty([row.is, row.no, row.di, row.ch])
  ));
}

function meaningfulCauses(causes) {
  return Array.isArray(causes) && causes.some(cause => {
    if (!cause || typeof cause !== 'object') return false;
    if (anyNonEmpty([
      cause.suspect,
      cause.accusation,
      cause.impact,
      cause.summaryText,
      cause.confidence,
      cause.evidence
    ])) return true;
    return Object.values(cause.findings || {}).some(finding => (
      finding
      && typeof finding === 'object'
      && anyNonEmpty([finding.mode, finding.note])
    ));
  });
}

function meaningfulSteps(steps) {
  return Array.isArray(steps?.items) && steps.items.some(item => item?.checked === true);
}

function meaningfulHandover(handover) {
  if (!handover || typeof handover !== 'object') return false;
  return Object.values(handover).some(value => (
    Array.isArray(value)
      ? value.some(nonEmpty)
      : nonEmpty(value)
  ));
}

function stable(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '';
  }
}

function meaningfulMajorAnalysis(snapshot) {
  if (!BASELINE_STATE) return false;
  return stable(snapshot?.decisionAnalysis) !== stable(BASELINE_STATE.decisionAnalysis)
    || stable(snapshot?.potentialProblemAnalysis) !== stable(BASELINE_STATE.potentialProblemAnalysis);
}

/**
 * Determine whether a normalized current-version Intake contains user work.
 *
 * Timestamp/presentation-only noise is deliberately ignored: savedAt, bridge
 * activation time, next communication time, table focus mode, theme, Notes
 * open/collapse state, action analysis ID, table labels, and unchecked steps.
 *
 * @param {unknown} candidate Current-version normalized or raw snapshot.
 * @returns {boolean} Whether the snapshot is worth offering as "Continue".
 */
export function isSubstantiveSavedIntake(candidate) {
  const snapshot = migrateAppState(candidate);
  if (!snapshot) return false;

  if (snapshot.meta?.intakeMode && snapshot.meta.intakeMode !== DEFAULT_INTAKE_MODE) return true;
  if (anyNonEmpty(Object.values(snapshot.pre || {}))) return true;
  if (anyNonEmpty(Object.values(snapshot.impact || {}))) return true;

  const ops = snapshot.ops || {};
  if (anyNonEmpty([
    ops.icName,
    ops.bcName,
    ops.semOpsName,
    ops.severity,
    ops.containStatus,
    ops.containDesc,
    ops.commCadence
  ])) return true;
  if ([
    ops.detectMonitoring,
    ops.detectUserReport,
    ops.detectAutomation,
    ops.detectOther,
    ops.evScreenshot,
    ops.evLogs,
    ops.evMetrics,
    ops.evRepro,
    ops.evOther
  ].some(Boolean)) return true;
  if (Array.isArray(ops.commLog) && ops.commLog.length > 0) return true;

  if (meaningfulTable(snapshot.table)) return true;
  if (meaningfulCauses(snapshot.causes)) return true;
  if (nonEmpty(snapshot.likelyCauseId)) return true;
  if (meaningfulSteps(snapshot.steps)) return true;
  if (Array.isArray(snapshot.actions?.items) && snapshot.actions.items.length > 0) return true;
  if (meaningfulHandover(snapshot.handover)) return true;
  if (Array.isArray(snapshot.notesWorkspace?.notes) && snapshot.notesWorkspace.notes.some(note => nonEmpty(note?.text))) {
    return true;
  }
  return meaningfulMajorAnalysis(snapshot);
}

/**
 * Read a current, substantive saved Intake without mutating storage.
 *
 * @param {Storage|null} storage Browser storage.
 * @returns {object|null} Normalized substantive snapshot or null.
 */
export function readSubstantiveSavedIntake(storage = globalThis.localStorage) {
  if (!storage) return null;
  try {
    const raw = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    const normalized = migrateAppState(raw);
    return normalized && isSubstantiveSavedIntake(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

/**
 * Detect independent resumable contexts for the startup hub.
 *
 * @param {object} [options] Detection dependencies.
 * @param {Storage|null} [options.storage=localStorage] Local storage.
 * @param {Location|null} [options.location=location] Browser location.
 * @param {number} [options.nowMs=Date.now()] Current epoch.
 * @returns {object} Startup context.
 */
export function detectStartupContext({
  storage = globalThis.localStorage,
  location = globalThis.location,
  nowMs = Date.now()
} = {}) {
  const savedIntake = readSubstantiveSavedIntake(storage);
  const student = readStudentSession(storage);
  const instructor = readInstructorSession(storage);
  const studentResumable = Boolean(student && !isStudentSessionExpired(student, nowMs));
  const instructorResumable = Boolean(instructor && !isInstructorSessionExpired(instructor, nowMs));

  return {
    savedIntake,
    student: studentResumable ? student : null,
    instructor: instructorResumable ? instructor : null,
    hasStoredStudentSession: Boolean(student),
    hasStoredInstructorSession: Boolean(instructor),
    studentSessionExpired: Boolean(student && !studentResumable),
    instructorSessionExpired: Boolean(instructor && !instructorResumable),
    joinIntent: readClassroomJoinIntent(location) || ''
  };
}

function formatSavedAt(value) {
  const stamp = Date.parse(value || '');
  if (!Number.isFinite(stamp)) return '';
  try {
    return new Date(stamp).toLocaleString();
  } catch {
    return '';
  }
}

function element(id) {
  return documentRef?.getElementById(id) || null;
}

function buildResumeButton({ kind, title, description, meta }) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = 'startup-resume-card';
  button.dataset.startupResume = kind;
  button.setAttribute('data-persistence', 'local-only');
  button.setAttribute('data-summary', 'exclude');

  const copy = documentRef.createElement('span');
  copy.className = 'startup-resume-card__copy';
  const heading = documentRef.createElement('strong');
  heading.textContent = title;
  const detail = documentRef.createElement('span');
  detail.textContent = description;
  copy.append(heading, detail);

  if (meta) {
    const small = documentRef.createElement('small');
    small.textContent = meta;
    copy.append(small);
  }

  const action = documentRef.createElement('span');
  action.className = 'startup-resume-card__action';
  action.textContent = 'Continue';
  button.append(copy, action);
  return button;
}

function renderContinueCards() {
  const section = element('startupContinueSection');
  const list = element('startupContinueList');
  if (!section || !list || !context) return;

  list.replaceChildren();

  if (context.savedIntake) {
    const problem = context.savedIntake.pre?.oneLine?.trim();
    const savedAt = formatSavedAt(context.savedIntake.meta?.savedAt);
    list.append(buildResumeButton({
      kind: 'intake',
      title: 'Continue your saved Intake',
      description: problem || 'Return to your saved independent Intake.',
      meta: savedAt ? `Saved ${savedAt}` : ''
    }));
  }

  if (context.student) {
    const assignment = context.student.assignment?.label;
    list.append(buildResumeButton({
      kind: 'student',
      title: `Rejoin ${context.student.class.title}`,
      description: `Continue as ${context.student.participant.displayName}.`,
      meta: assignment ? `Assigned to ${assignment}` : 'Waiting for assignment'
    }));
  }

  if (context.instructor) {
    list.append(buildResumeButton({
      kind: 'instructor',
      title: `Continue managing ${context.instructor.class.title}`,
      description: 'Resume the Instructor workspace on this device.',
      meta: context.instructor.joinCode ? `Class code ${context.instructor.joinCode}` : ''
    }));
  }

  section.hidden = list.childElementCount === 0;
}

function renderJoinIntent() {
  const notice = element('startupJoinIntentNotice');
  const studentButton = documentRef?.querySelector('[data-experience-role-choice="student"]');
  const code = context?.joinIntent || '';
  if (notice) {
    notice.hidden = !code;
    notice.textContent = code
      ? `Class link detected · ${code.slice(0, 4)}-${code.slice(4)}. Choose Join a class to continue.`
      : '';
  }
  studentButton?.classList?.toggle('is-recommended', Boolean(code));
  studentButton?.toggleAttribute?.('data-join-intent', Boolean(code));
}

function setHubStatus(message = '', state = '') {
  const status = element('startupHubStatus');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
  status.hidden = !message;
}

function render() {
  context = detectStartupContext({
    storage: storageRef,
    location: locationRef,
    nowMs: Date.now()
  });
  renderContinueCards();
  renderJoinIntent();
  return context;
}

function confirmReplace(message) {
  return typeof windowRef?.confirm === 'function' ? windowRef.confirm(message) : true;
}

function chooseRole(role) {
  const applied = applyExperienceRole(role);
  if (!applied) return false;
  closeExperienceRoleChooser({ force: true });
  setHubStatus('');
  return true;
}

function chooseFreshStandalone() {
  if (context?.savedIntake) {
    const proceed = confirmReplace(
      'Start a new independent Intake? Your currently saved Intake will be cleared. Save it to a file first if you need a portable copy.'
    );
    if (!proceed) return true;
    startFreshRef();
  }
  return chooseRole(EXPERIENCE_ROLE_IDS.STANDALONE);
}

function chooseNewStudent() {
  const stored = readStudentSession(storageRef);
  if (stored) {
    const proceed = isStudentSessionExpired(stored)
      || confirmReplace(
        `Join a different class? This device will stop resuming “${stored.class.title}” as ${stored.participant.displayName}.`
      );
    if (!proceed) return true;
    clearStudentSession(storageRef);
  }
  return chooseRole(EXPERIENCE_ROLE_IDS.STUDENT);
}

function chooseNewInstructor() {
  const stored = readInstructorSession(storageRef);
  if (stored) {
    const proceed = isInstructorSessionExpired(stored)
      || confirmReplace(
        `Run a different class? This device will stop automatically resuming “${stored.class.title}”. Administration / Maintenance can reissue Instructor access later if needed.`
      );
    if (!proceed) return true;
    clearInstructorSession(storageRef);
  }
  return chooseRole(EXPERIENCE_ROLE_IDS.INSTRUCTOR);
}

/**
 * Handle one new-session role intent from the shared role controls.
 *
 * @param {string} role Canonical experience role.
 * @returns {boolean} True because the hub owns all supported role intents.
 */
function handleRoleIntent(role) {
  render();
  if (role === EXPERIENCE_ROLE_IDS.STANDALONE) return chooseFreshStandalone();
  if (role === EXPERIENCE_ROLE_IDS.STUDENT) return chooseNewStudent();
  if (role === EXPERIENCE_ROLE_IDS.INSTRUCTOR) return chooseNewInstructor();
  return false;
}

function handleResumeClick(event) {
  const button = event.target?.closest?.('[data-startup-resume]');
  if (!button) return;
  const kind = button.dataset.startupResume;
  if (kind === 'intake') {
    chooseRole(EXPERIENCE_ROLE_IDS.STANDALONE);
  } else if (kind === 'student') {
    chooseRole(EXPERIENCE_ROLE_IDS.STUDENT);
  } else if (kind === 'instructor') {
    chooseRole(EXPERIENCE_ROLE_IDS.INSTRUCTOR);
  }
}

/**
 * Reopen the required startup hub after a saved server-backed resume becomes invalid.
 *
 * @param {string} message Human-facing recovery explanation.
 * @returns {void}
 */
function showResumeFailure(message) {
  resetExperienceRoleSelection();
  render();
  setHubStatus(message || 'That saved session is no longer available. Choose what you want to do next.', 'error');
  openExperienceRoleChooser({ required: true });
}

/**
 * Initialize startup-hub detection and intent handling.
 *
 * @param {object} [options] Dependencies.
 * @returns {object} Startup hub controller.
 */
export function initStartupExperienceHub({
  documentRef: nextDocument = globalThis.document,
  windowRef: nextWindow = globalThis.window,
  storage = globalThis.localStorage,
  location = nextWindow?.location || globalThis.location,
  startFresh = () => {}
} = {}) {
  documentRef = nextDocument;
  windowRef = nextWindow;
  storageRef = storage;
  locationRef = location;
  startFreshRef = typeof startFresh === 'function' ? startFresh : () => {};
  context = null;

  element('startupContinueList')?.addEventListener('click', handleResumeClick);
  render();

  return {
    refresh: render,
    handleRoleIntent,
    showResumeFailure,
    getContext: () => context
  };
}
