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
    oneLine: 'What item is affected, and what is wrong with it?',
    proof: 'What evidence shows that the problem is real?',
    objectPrefill: 'What specific item should we examine?',
    healthy: 'What should normally happen?',
    now: 'What is happening instead?',
    impactNow: 'What impact is the problem causing now?',
    impactFuture: 'What could happen if no effective action is taken?',
    impactTime: 'By when must action be taken before the impact gets worse?'
  },
  [INTAKE_MODE_IDS.IT]: {
    oneLine: 'What service or system is affected, and what is it doing wrong?',
    proof: 'What evidence confirms the incident?',
    objectPrefill: 'What specific system or service is affected?',
    healthy: 'What should the service normally do?',
    now: 'What is the service doing now?',
    impactNow: 'Who or what is affected right now?',
    impactFuture: 'What additional impact could occur if the incident continues?',
    impactTime: 'What is the next deadline or event before the impact becomes worse?'
  },
  [INTAKE_MODE_IDS.PHARMA]: {
    oneLine: 'What unexpected condition was observed, and what product, batch, process, material, or equipment may be affected?',
    proof: 'What records or observations confirm the event?',
    objectPrefill: 'What specific product, batch, material, process, or equipment may be affected?',
    healthy: 'What approved requirement should have been met?',
    now: 'What was observed instead?',
    impactNow: 'What impact is confirmed now, and what is still being assessed?',
    impactFuture: 'What credible risk could arise if the event is not contained or addressed?',
    impactTime: 'By when must containment, assessment, or a decision occur?'
  },
  [INTAKE_MODE_IDS.MAJOR_INCIDENT]: {
    oneLine: 'What critical service or business capability is affected, and what is happening?',
    proof: 'What current evidence confirms the incident?',
    objectPrefill: 'What specific service, region, platform, or customer journey is affected?',
    healthy: 'What should customers, users, or the business normally experience?',
    now: 'What is happening right now?',
    impactNow: 'Who cannot do what right now?',
    impactFuture: 'What could happen next if the incident continues or spreads?',
    impactTime: 'What is the next hard deadline before the impact becomes much worse?'
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
    oneLine: 'Describe one item and one clear difference from what should be happening. Do not include the cause or solution.',
    proof: 'Include observations, measurements, photos, test results, reports, or feedback.',
    objectPrefill: 'Name the product, part, machine, process step, workflow, document, or service. Include an ID or location if helpful.',
    healthy: 'State the expected condition, result, measurement, timing, or approved requirement.',
    now: 'Describe the actual condition and how much it differs from what is expected. Include when and how often it occurs.',
    impactNow: 'Consider people, safety, quality, output, customers, cost, schedule, or availability.',
    impactFuture: 'Describe the most likely additional impact, not only the worst possible outcome.',
    impactTime: 'Give a date, time, deadline, or event, and explain what changes after that point.'
  },
  [INTAKE_MODE_IDS.IT]: {
    oneLine: 'State the affected service, the problem users or systems are seeing, and the known scope. Do not include a suspected cause.',
    proof: 'Include alerts, logs, metrics, error messages, test results, or user reports. Add the time observed when possible.',
    objectPrefill: 'Name the application, service, API, database, host, network, environment, region, or version.',
    healthy: 'State the expected user result, system behaviour, performance level, service target, or known-good condition.',
    now: 'Describe the symptoms, errors, measurements, timing, and whether the condition is improving, stable, or getting worse.',
    impactNow: 'Identify affected users, transactions, regions, systems, or business activities. Include the size of the impact and any usable workaround.',
    impactFuture: 'Consider growing backlogs, missed deadlines, dependent systems, data issues, customer impact, or loss of service.',
    impactTime: 'Give the specific time and consequence, such as a processing cutoff, release window, capacity limit, or business deadline.'
  },
  [INTAKE_MODE_IDS.PHARMA]: {
    oneLine: 'State what was observed and the initial scope. Do not include an assumed cause or unconfirmed product impact.',
    proof: 'Include test results, batch records, instrument data, inspection findings, complaints, photos, or direct observations.',
    objectPrefill: 'Include the product name, batch or lot number, equipment ID, process step, site, line, room, sample, or study.',
    healthy: 'State the applicable specification, validated range, procedure, batch record, method, protocol, or acceptance limit.',
    now: 'Record the actual condition or result, how it differs from the requirement, and when it occurred. Keep retest results separate from the original result.',
    impactNow: 'State known quality, safety, release, or data implications. Include whether the batch is on hold, released, distributed, or still under review.',
    impactFuture: 'Consider patients, product quality, other batches, recurrence, contamination, data validity, supply, or regulatory impact. Do not present possible harm as confirmed harm.',
    impactTime: 'Give the relevant hold point, release date, manufacturing step, shipment, reporting deadline, or other decision point.'
  },
  [INTAKE_MODE_IDS.MAJOR_INCIDENT]: {
    oneLine: 'State the affected capability, the current problem, and the confirmed scope. Do not include a suspected cause.',
    proof: 'Include alerts, metrics, logs, test results, transaction failures, screenshots, or customer reports. Add the observation time.',
    objectPrefill: 'Identify the exact service, transaction path, environment, region, customer group, release, or configuration. Include what is known to be unaffected when helpful.',
    healthy: 'State the expected result and any useful baseline, such as success rate, response time, availability, throughput, or known-good condition.',
    now: 'Describe the current symptoms, measurements, scope, mitigation status, and whether the incident is improving, stable, or getting worse. Include an “as of” time.',
    impactNow: 'Quantify affected customers, users, transactions, regions, services, or business functions. Include any workaround.',
    impactFuture: 'Consider growing customer impact, backlogs, dependent-service failures, capacity limits, data issues, missed deadlines, or fewer recovery options.',
    impactTime: 'Give the exact time, event, or threshold and explain the consequence. Track communication update times separately.'
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
