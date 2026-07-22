/**
 * @module intakeModes
 * @summary Defines reusable intake-mode metadata for tailoring the visible workflow.
 * @description
 *   Exports immutable mode identifiers, display labels, the default scratch/new-form
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
 * Scratch and new forms default to General so they stay lightweight while
 * restored snapshots continue to apply their saved `meta.intakeMode` value
 * when present.
 *
 * @type {'general'}
 */
export const DEFAULT_INTAKE_MODE = INTAKE_MODE_IDS.GENERAL;

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
  collaboration: true,
  detectionSource: true,
  evidenceCollected: true,
  incidentProof: true,
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
    collaboration: false,
    detectionSource: false,
    evidenceCollected: false,
    incidentProof: false,
    containment: false,
    handover: false,
    communications: false,
    steps: false
  },
  [INTAKE_MODE_IDS.IT]: {
    ...ALL_SECTIONS_VISIBLE,
    collaboration: false,
    detectionSource: false,
    evidenceCollected: false,
    incidentProof: false,
    containment: false,
    handover: false,
    communications: false,
    steps: false
  },
  [INTAKE_MODE_IDS.PHARMA]: {
    ...ALL_SECTIONS_VISIBLE,
    collaboration: false,
    detectionSource: false,
    evidenceCollected: false,
    incidentProof: false,
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
    oneLine: 'What problem is affecting the service or capability?',
    proof: 'What evidence confirms the deviation?',
    objectPrefill: 'Which object is affected?',
    healthy: 'What should the object do normally?',
    now: 'What is the object doing now?',
    impactNow: 'What is the current impact?',
    impactFuture: 'What future impact is likely if unresolved?',
    impactTime: 'When is a decision or resolution needed?'
  },
  [INTAKE_MODE_IDS.IT]: {
    oneLine: 'What IT service or capability is degraded?',
    proof: 'What evidence confirms the technical deviation?',
    objectPrefill: 'Which IT object is affected?',
    healthy: 'What service behavior is expected?',
    now: 'What is the actual service behavior now?',
    impactNow: 'What is the current user or system impact?',
    impactFuture: 'What future operational impact is likely if unresolved?',
    impactTime: 'When is a decision or resolution needed?'
  },
  [INTAKE_MODE_IDS.PHARMA]: {
    oneLine: 'What quality event is affecting the product, process, or batch?',
    proof: 'What evidence confirms the quality deviation?',
    objectPrefill: 'Which product, process, batch, material, or equipment is affected?',
    healthy: 'What validated or approved state is expected?',
    now: 'What condition is observed now?',
    impactNow: 'What is the current quality, release, safety, or patient impact?',
    impactFuture: 'What future compliance, stability, supply, or patient impact is likely if unresolved?',
    impactTime: 'When is a quality decision or resolution needed?'
  },
  [INTAKE_MODE_IDS.MAJOR_INCIDENT]: {
    oneLine: 'What major incident is degrading which customer-facing service or capability?',
    proof: 'What observable or measurable evidence confirms the incident deviation?',
    objectPrefill: 'Which specific service, platform, region, or workflow object is affected?',
    healthy: 'What known-good behavior is expected, and what baseline should responders use?',
    now: 'What actual behavior are responders seeing now, and how does it differ from the baseline?',
    impactNow: 'What is the current incident impact and blast radius?',
    impactFuture: 'What future incident impact is likely if containment does not improve?',
    impactTime: 'By what incident deadline or timeframe does resolution become difficult, expensive, impossible, or meaningless?'
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
    oneLine: 'State the affected service or capability and the observed degradation.',
    proof: 'Include alerts, observations, measurements, reports, or reproducible results.',
    objectPrefill: 'Provide the service, process, tool, machine, model, or configuration identifier.',
    healthy: 'Give the expected behavior, measure, or prior normal condition.',
    now: 'Record current observations or measurements and the difference from normal.',
    impactNow: 'Identify who or what is affected and quantify the current scope or severity.',
    impactFuture: 'Describe the likely downstream effect if the deviation continues.',
    impactTime: 'Include the relevant deadline, dependency, or decision point.'
  },
  [INTAKE_MODE_IDS.IT]: {
    oneLine: 'State the degraded service or capability, symptom, and affected scope.',
    proof: 'Include alerts, logs, metrics, customer reports, or reproduction results.',
    objectPrefill: 'Provide the service, application, dependency, host, OS, platform, version, or configuration identifier.',
    healthy: 'Give the expected behavior, SLO, metric, or known-good configuration.',
    now: 'Record current behavior, alerts, metrics, or user symptoms against the baseline.',
    impactNow: 'Identify affected users, transactions, regions, systems, or dependencies and quantify the scope.',
    impactFuture: 'Describe the operational risk, deadline, or dependent service at risk.',
    impactTime: 'Include the applicable SLA, release, dependency, or other deadline.'
  },
  [INTAKE_MODE_IDS.PHARMA]: {
    oneLine: 'State the deviation, product or process context, and batch scope.',
    proof: 'Include inspection results, assay data, exceptions, complaints, or verified observations.',
    objectPrefill: 'Provide the material, equipment, process step, study, product, or batch identifier.',
    healthy: 'Give the approved specification, validated state, or control.',
    now: 'Record the observed condition and its difference from the approved baseline.',
    impactNow: 'Identify current quality, safety, release, or patient implications.',
    impactFuture: 'Describe the likely compliance, stability, supply, or investigation risk.',
    impactTime: 'Include hold points, release dates, or process deadlines.'
  },
  [INTAKE_MODE_IDS.MAJOR_INCIDENT]: {
    oneLine: 'Which major incident, degraded customer-facing service or capability, and scope should responders align on?',
    proof: 'Which alerts, metrics, reports, screenshots, or logs demonstrate the incident deviation?',
    objectPrefill: 'Which customer-facing service, platform, region, workflow, or configuration details distinguish the affected object?',
    healthy: 'Which known-good behavior, metric, or service baseline should responders use for comparison?',
    now: 'Which active behavior, measurements, or customer symptoms show the difference from that baseline?',
    impactNow: 'Which customers, services, regions, or business functions are affected now, and what is the blast radius?',
    impactFuture: 'Which near-term escalation or customer impact is likely if containment does not improve?',
    impactTime: 'When do recovery commitments, updates, or business deadlines make resolution difficult, expensive, impossible, or meaningless?'
  }
});


/**
 * Full caption bundles for the visible non-KT fields controlled by intake mode.
 *
 * Labels and helpers are duplicated here so the application layer can update
 * labels, helper text, subtitles, and placeholders from one immutable source
 * without altering KT Problem Analysis rows in `src/constants.js`.
 *
 * @type {Readonly<Record<string, Readonly<Record<string, Readonly<{ label: string, helper: string, subtitle: string, placeholder: string }>>>>>}
 */
export const INTAKE_MODE_FIELD_CAPTIONS = deepFreeze(Object.fromEntries(
  Object.values(INTAKE_MODE_IDS).map((modeId) => [modeId, Object.fromEntries(
    Object.keys(INTAKE_MODE_HELPER_OVERRIDES[modeId]).map((fieldId) => [fieldId, {
      label: INTAKE_MODE_CAPTION_OVERRIDES[modeId][fieldId],
      helper: INTAKE_MODE_HELPER_OVERRIDES[modeId][fieldId],
      subtitle: {
        oneLine: modeId === INTAKE_MODE_IDS.MAJOR_INCIDENT ? 'Problem Summary' : 'Intake Summary',
        proof: modeId === INTAKE_MODE_IDS.PHARMA ? 'Evidence & Affected Product' : 'Evidence & Affected Object',
        objectPrefill: modeId === INTAKE_MODE_IDS.PHARMA ? 'Evidence & Affected Product' : 'Evidence & Affected Object',
        healthy: 'Baseline vs Current Behavior',
        now: 'Baseline vs Current Behavior',
        impactNow: INTAKE_MODE_CAPTION_OVERRIDES[modeId].impactNow,
        impactFuture: INTAKE_MODE_CAPTION_OVERRIDES[modeId].impactFuture,
        impactTime: INTAKE_MODE_CAPTION_OVERRIDES[modeId].impactTime
      }[fieldId],
      placeholder: ''
    }])
  )])
));
