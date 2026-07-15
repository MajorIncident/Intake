/**
 * @module intakeModes
 * @summary Defines reusable intake-mode metadata for tailoring the visible workflow.
 * @description
 *   Exports immutable mode identifiers, display labels, the default backward-compatible
 *   intake mode, section visibility flags, and field caption/helper overrides. This
 *   module is configuration-only and manages no DOM anchors; consumers decide how to
 *   apply these settings without altering the protected Kepner-Tregoe row text in
 *   `src/constants.js`.
 */

/**
 * Recursively freezes an intake-mode configuration object.
 *
 * @template {object} T
 * @param {T} value - Object or array to make immutable for runtime consumers.
 * @returns {Readonly<T>} The provided value after recursively freezing nested members.
 */
function deepFreeze(value) {
  Object.getOwnPropertyNames(value).forEach((name) => {
    const child = value[name];
    if (child && typeof child === 'object' && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  });

  return Object.freeze(value);
}

/**
 * Canonical identifiers for the supported intake modes.
 *
 * @type {Readonly<{
 *   GENERAL: 'general',
 *   IT: 'it',
 *   PHARMA: 'pharma',
 *   MAJOR_INCIDENT: 'majorIncident'
 * }>}
 */
export const INTAKE_MODE_IDS = deepFreeze({
  GENERAL: 'general',
  IT: 'it',
  PHARMA: 'pharma',
  MAJOR_INCIDENT: 'majorIncident'
});

/**
 * Human-readable labels for every supported intake mode.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const INTAKE_MODE_LABELS = deepFreeze({
  [INTAKE_MODE_IDS.GENERAL]: 'General Intake',
  [INTAKE_MODE_IDS.IT]: 'IT Incident',
  [INTAKE_MODE_IDS.PHARMA]: 'Pharma Quality Event',
  [INTAKE_MODE_IDS.MAJOR_INCIDENT]: 'Major Incident'
});

/**
 * Default intake mode used when no explicit mode is stored or selected.
 *
 * Major Incident preserves the existing incident-first experience for callers
 * that predate intake-mode selection.
 *
 * @type {'majorIncident'}
 */
export const DEFAULT_INTAKE_MODE = INTAKE_MODE_IDS.MAJOR_INCIDENT;

/**
 * Ordered intake-mode metadata for selectors and documentation surfaces.
 *
 * @type {ReadonlyArray<Readonly<{ id: string, label: string }>>}
 */
export const INTAKE_MODES = deepFreeze([
  { id: INTAKE_MODE_IDS.GENERAL, label: INTAKE_MODE_LABELS[INTAKE_MODE_IDS.GENERAL] },
  { id: INTAKE_MODE_IDS.IT, label: INTAKE_MODE_LABELS[INTAKE_MODE_IDS.IT] },
  { id: INTAKE_MODE_IDS.PHARMA, label: INTAKE_MODE_LABELS[INTAKE_MODE_IDS.PHARMA] },
  { id: INTAKE_MODE_IDS.MAJOR_INCIDENT, label: INTAKE_MODE_LABELS[INTAKE_MODE_IDS.MAJOR_INCIDENT] }
]);

const ALL_SECTIONS_VISIBLE = deepFreeze({
  problemSummary: true,
  impact: true,
  containment: true,
  problemAnalysis: true,
  possibleCauses: true,
  actions: true,
  handover: true,
  communications: true,
  steps: true
});

/**
 * Section visibility flags for each intake mode.
 *
 * The major-incident mode intentionally keeps every existing section visible to
 * maintain backward compatibility. Other modes progressively disclose operational
 * sections while preserving access to KT problem-analysis areas.
 *
 * @type {Readonly<Record<string, typeof ALL_SECTIONS_VISIBLE>>}
 */
export const INTAKE_MODE_SECTION_VISIBILITY = deepFreeze({
  [INTAKE_MODE_IDS.GENERAL]: {
    ...ALL_SECTIONS_VISIBLE,
    containment: false,
    handover: false,
    communications: false,
    steps: false
  },
  [INTAKE_MODE_IDS.IT]: {
    ...ALL_SECTIONS_VISIBLE,
    containment: false,
    handover: false,
    communications: false,
    steps: false
  },
  [INTAKE_MODE_IDS.PHARMA]: {
    ...ALL_SECTIONS_VISIBLE,
    containment: false,
    handover: false,
    communications: false,
    steps: false
  },
  [INTAKE_MODE_IDS.MAJOR_INCIDENT]: {
    ...ALL_SECTIONS_VISIBLE
  }
});

/**
 * Caption override maps keyed by stable field IDs in the intake UI.
 *
 * Each mode may override field labels without changing storage keys or KT row
 * prompts. Consumers should fall back to the existing markup copy whenever a
 * field ID is absent from the selected mode's map.
 *
 * @type {Readonly<Record<string, Readonly<Record<string, string>>>>}
 */
export const INTAKE_MODE_CAPTION_OVERRIDES = deepFreeze({
  [INTAKE_MODE_IDS.GENERAL]: {
    oneLine: 'One-line summary',
    objectPrefill: 'Object or process',
    healthy: 'Expected state',
    now: 'Current state',
    impactNow: 'Current impact',
    impactFuture: 'Potential impact',
    impactTime: 'Timing context'
  },
  [INTAKE_MODE_IDS.IT]: {
    oneLine: 'Incident summary',
    objectPrefill: 'Affected service or component',
    healthy: 'Known-good service behavior',
    now: 'Current service behavior',
    impactNow: 'Current user or system impact',
    impactFuture: 'Expected escalation risk',
    impactTime: 'Detection and onset timeline'
  },
  [INTAKE_MODE_IDS.PHARMA]: {
    oneLine: 'Quality event summary',
    objectPrefill: 'Product, process, or batch',
    healthy: 'Expected validated state',
    now: 'Observed deviation',
    impactNow: 'Current quality or patient impact',
    impactFuture: 'Potential compliance or release impact',
    impactTime: 'Discovery and process timing'
  },
  [INTAKE_MODE_IDS.MAJOR_INCIDENT]: {
    oneLine: 'Major incident summary',
    objectPrefill: 'Impacted object or service',
    healthy: 'Healthy baseline',
    now: 'Current deviation',
    impactNow: 'Current incident impact',
    impactFuture: 'Projected incident impact',
    impactTime: 'Incident timeline context'
  }
});

/**
 * Helper-text override maps keyed by stable field IDs in the intake UI.
 *
 * These values explain what operators should capture for a field while keeping
 * field identifiers and persisted app-state shape stable across modes.
 *
 * @type {Readonly<Record<string, Readonly<Record<string, string>>>>}
 */
export const INTAKE_MODE_HELPER_OVERRIDES = deepFreeze({
  [INTAKE_MODE_IDS.GENERAL]: {
    oneLine: 'Summarize the issue in one calm, specific sentence.',
    objectPrefill: 'Name the object, workflow, or outcome being investigated.',
    healthy: 'Describe what normal looks like before comparing the deviation.',
    now: 'Describe what is happening right now.',
    impactNow: 'Capture who or what is affected today.',
    impactFuture: 'Note credible downstream risks if nothing changes.',
    impactTime: 'Record when the issue started or was first noticed.'
  },
  [INTAKE_MODE_IDS.IT]: {
    oneLine: 'State the service disruption, scope, and symptom briefly.',
    objectPrefill: 'Use the service, application, dependency, or infrastructure name.',
    healthy: 'Document the expected technical behavior or SLO baseline.',
    now: 'Capture the failing behavior, alerts, or user-reported symptom.',
    impactNow: 'Quantify affected users, transactions, regions, or dependencies.',
    impactFuture: 'Call out likely escalation paths, deadlines, or cascading risks.',
    impactTime: 'Include detection time, suspected start, and recent change windows.'
  },
  [INTAKE_MODE_IDS.PHARMA]: {
    oneLine: 'Summarize the deviation with product/process context and batch scope.',
    objectPrefill: 'Identify the material, equipment, process step, study, or batch.',
    healthy: 'Reference the approved specification, validated state, or expected control.',
    now: 'Describe the observed out-of-expectation condition without changing KT prompts.',
    impactNow: 'Capture current quality, safety, release, or patient implications.',
    impactFuture: 'Note possible compliance, stability, supply, or investigation risks.',
    impactTime: 'Record discovery timing, processing stage, and relevant hold points.'
  },
  [INTAKE_MODE_IDS.MAJOR_INCIDENT]: {
    oneLine: 'Summarize the major incident so responders can align quickly.',
    objectPrefill: 'Name the customer-facing service, platform, region, or workflow.',
    healthy: 'Describe the known-good baseline responders should compare against.',
    now: 'Describe the active deviation responders are seeing now.',
    impactNow: 'Capture current blast radius, severity, and customer impact.',
    impactFuture: 'Capture near-term escalation risk if containment does not improve.',
    impactTime: 'Record start, detection, bridge, and update-cadence timing.'
  }
});
