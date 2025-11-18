/**
 * @module templates
 * @summary Provides curated intake starter templates and mode-aware payload helpers.
 * @description
 *   Exposes declarative metadata for the template drawer along with utilities that
 *   deliver ready-to-apply {@link import('./storage.js').SerializedAppState}
 *   payloads. Templates can be previewed in multiple modes (Intake, IS / IS NOT,
 *   D&C, and Full) so demos can start with as much structure as needed.
 */

import { APP_STATE_VERSION } from './appStateVersion.js';

/**
 * Immutable identifiers for the template presentation modes.
 * @type {Readonly<{ INTAKE: 'intake', IS_IS_NOT: 'is-is-not', DC: 'dc', FULL: 'full' }>}
 */
export const TEMPLATE_MODE_IDS = Object.freeze({
  INTAKE: 'intake',
  IS_IS_NOT: 'is-is-not',
  DC: 'dc',
  FULL: 'full'
});

const TEMPLATE_MODES = Object.freeze([
  {
    id: TEMPLATE_MODE_IDS.INTAKE,
    name: 'Intake',
    description: 'Prefills the preface, impact, and comms scaffolding only.'
  },
  {
    id: TEMPLATE_MODE_IDS.IS_IS_NOT,
    name: 'IS / IS NOT',
    description: 'Adds representative KT table entries to the intake view.'
  },
  {
    id: TEMPLATE_MODE_IDS.DC,
    name: 'D&C',
    description: 'Extends the KT table with causes and a partially completed steps list.'
  },
  {
    id: TEMPLATE_MODE_IDS.FULL,
    name: 'Full',
    description: 'Includes actions plus every other section for an end-to-end walkthrough.'
  }
]);

const MODE_RULES = Object.freeze({
  [TEMPLATE_MODE_IDS.INTAKE]: Object.freeze({ includeTable: false, includeCauses: false, includeSteps: false, includeActions: false }),
  [TEMPLATE_MODE_IDS.IS_IS_NOT]: Object.freeze({ includeTable: true, includeCauses: false, includeSteps: false, includeActions: false }),
  [TEMPLATE_MODE_IDS.DC]: Object.freeze({ includeTable: true, includeCauses: true, includeSteps: true, includeActions: false }),
  [TEMPLATE_MODE_IDS.FULL]: Object.freeze({ includeTable: true, includeCauses: true, includeSteps: true, includeActions: true })
});

const BASE_META = Object.freeze({
  version: APP_STATE_VERSION,
  savedAt: null
});

const BASE_PREFACE = Object.freeze({
  oneLine: '',
  proof: '',
  objectPrefill: '',
  healthy: '',
  now: ''
});

const BASE_IMPACT = Object.freeze({
  now: '',
  future: '',
  time: ''
});

const BASE_OPS = Object.freeze({
  bridgeOpenedUtc: '',
  icName: '',
  bcName: '',
  semOpsName: '',
  severity: '',
  detectMonitoring: false,
  detectUserReport: false,
  detectAutomation: false,
  detectOther: false,
  evScreenshot: false,
  evLogs: false,
  evMetrics: false,
  evRepro: false,
  evOther: false,
  containStatus: '',
  containDesc: '',
  commCadence: '',
  commLog: [],
  commNextDueIso: '',
  commNextUpdateTime: '',
  tableFocusMode: 'rapid'
});

const DEFAULT_STEPS_STATE = Object.freeze({
  items: [],
  drawerOpen: false
});

const DEFAULT_ACTIONS_STATE = Object.freeze({
  analysisId: '',
  items: []
});

/**
 * Deeply clones serializable values.
 * @template T
 * @param {T} value - Serializable value to clone.
 * @returns {T} Cloned value.
 */
function clone(value) {
  if (Array.isArray(value)) {
    return /** @type {T} */ (value.map(item => clone(item)));
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(key => {
      out[key] = clone(value[key]);
    });
    return /** @type {T} */ (out);
  }
  return value;
}

/**
 * Merges overrides into a cloned base object to avoid shared references.
 * @template T extends Record<string, any>
 * @param {T} base - Default structure.
 * @param {Partial<T>} [overrides] - Optional overrides.
 * @returns {T} Safe merged copy.
 */
function mergeSection(base, overrides) {
  const result = clone(base);
  if (!overrides || typeof overrides !== 'object') {
    return result;
  }
  Object.keys(overrides).forEach(key => {
    const value = overrides[key];
    if (Array.isArray(value)) {
      result[key] = clone(value);
    } else if (value && typeof value === 'object') {
      result[key] = clone(value);
    } else {
      result[key] = value;
    }
  });
  return /** @type {T} */ (result);
}

/**
 * Normalizes a steps payload into the exported storage shape.
 * @param {Partial<typeof DEFAULT_STEPS_STATE>} [steps] - Raw steps snapshot.
 * @returns {{ items: Array<{ id: string, label: string, checked: boolean }>, drawerOpen: boolean }} Normalized steps state.
 */
function normalizeSteps(steps) {
  if (!steps || typeof steps !== 'object') {
    return clone(DEFAULT_STEPS_STATE);
  }
  const items = Array.isArray(steps.items)
    ? steps.items
        .map(item => {
          if (!item || (typeof item.id !== 'string' && typeof item.id !== 'number')) {
            return null;
          }
          const label = typeof item.label === 'string' ? item.label : '';
          if (!label) {
            return null;
          }
          return {
            id: String(item.id),
            label,
            checked: !!item.checked
          };
        })
        .filter(Boolean)
    : [];
  return {
    items,
    drawerOpen: !!steps.drawerOpen
  };
}

/**
 * Normalizes an actions payload into the exported storage shape.
 * @param {Partial<typeof DEFAULT_ACTIONS_STATE>} [actions] - Raw actions snapshot.
 * @returns {{ analysisId: string, items: Array<Record<string, any>> }} Normalized actions state.
 */
function normalizeActions(actions) {
  if (!actions || typeof actions !== 'object') {
    return clone(DEFAULT_ACTIONS_STATE);
  }
  const items = Array.isArray(actions.items)
    ? actions.items
        .filter(item => item && typeof item === 'object')
        .map(item => clone(item))
    : [];
  return {
    analysisId: typeof actions.analysisId === 'string' ? actions.analysisId : '',
    items
  };
}

/**
 * Creates a normalized {@link import('./storage.js').SerializedAppState} seed.
 * @param {Partial<import('./storage.js').SerializedAppState>} [overrides] - Sections to override.
 * @returns {import('./storage.js').SerializedAppState} Normalized state payload.
 */
function createState(overrides = {}) {
  return {
    meta: mergeSection(BASE_META, overrides.meta),
    pre: mergeSection(BASE_PREFACE, overrides.pre),
    impact: mergeSection(BASE_IMPACT, overrides.impact),
    ops: mergeSection(BASE_OPS, overrides.ops),
    table: Array.isArray(overrides.table) ? clone(overrides.table) : [],
    causes: Array.isArray(overrides.causes) ? clone(overrides.causes) : [],
    likelyCauseId: typeof overrides.likelyCauseId === 'string' ? overrides.likelyCauseId : null,
    steps: normalizeSteps(overrides.steps),
    actions: normalizeActions(overrides.actions)
  };
}

/**
 * Applies a mode's visibility rules to a full template state.
 * @param {import('./storage.js').SerializedAppState} fullState - Complete state definition.
 * @param {keyof typeof MODE_RULES} modeId - Mode identifier to project.
 * @returns {import('./storage.js').SerializedAppState|null} Mode-aware state payload.
 */
function projectState(fullState, modeId) {
  const rule = MODE_RULES[modeId];
  if (!rule) {
    return null;
  }
  const projected = {
    meta: clone(fullState.meta),
    pre: clone(fullState.pre),
    impact: clone(fullState.impact),
    ops: clone(fullState.ops),
    table: rule.includeTable ? clone(fullState.table) : [],
    causes: rule.includeCauses ? clone(fullState.causes) : [],
    likelyCauseId: rule.includeCauses ? fullState.likelyCauseId : null,
    steps: rule.includeSteps ? clone(fullState.steps) : clone(DEFAULT_STEPS_STATE),
    actions: rule.includeActions ? clone(fullState.actions) : clone(DEFAULT_ACTIONS_STATE)
  };
  if (!rule.includeTable) {
    projected.ops.tableFocusMode = BASE_OPS.tableFocusMode;
  }
  if (!rule.includeActions) {
    projected.actions.analysisId = '';
  }
  if (!rule.includeSteps) {
    projected.steps.drawerOpen = false;
  }
  return projected;
}

const donutTemplateState = createState({
  pre: {
    oneLine: 'Pickup donut tickets stalled for east-coast bakeries.',
    proof: 'Kitchen monitors show donut-builder queue >25m; partner support flooded with screenshots.',
    objectPrefill: 'Bakery pickup service',
    healthy: 'Orders print within 90 seconds and toppings mirror POS selections.',
    now: 'Queue stalls and toppings are wrong, forcing manual rework and refunds.'
  },
  impact: {
    now: '42% of morning pickup customers abandon orders; bakeries comping dozens of boxes.',
    future: 'Extended outage risks franchise SLA penalties and national social coverage.',
    time: 'Detected 2024-02-14 11:05Z minutes after loyalty promo blast.'
  },
  ops: {
    bridgeOpenedUtc: '2024-02-14 11:12Z',
    icName: 'Maya Patel',
    bcName: 'Rob Flynn',
    semOpsName: 'Nia Jordan',
    severity: 'SEV-2',
    detectMonitoring: true,
    detectUserReport: true,
    detectAutomation: false,
    detectOther: false,
    evScreenshot: true,
    evLogs: true,
    evMetrics: true,
    evRepro: true,
    evOther: false,
    containStatus: 'stoppingImpact',
    containDesc: 'Throttled loyalty promo weights and routing backlog through legacy recipe path.',
    commCadence: '30',
    commLog: [
      { type: 'internal', ts: '2024-02-14T11:15:00Z', message: 'Bridge opened, validating scope with bakery ops.' },
      { type: 'external', ts: '2024-02-14T11:25:00Z', message: 'Posted advisory to bakery partners about delayed pickup tickets.' }
    ],
    commNextDueIso: '2024-02-14T11:45:00Z',
    commNextUpdateTime: '11:45',
    tableFocusMode: 'focused'
  },
  table: [
    { band: 'WHAT', note: 'Define the problem precisely (Object & Deviation).' },
    {
      questionId: 'what-object',
      q: 'WHAT — Specific Object/Thing is having the {DEVIATION}',
      is: 'Bakery pickup ticket pipeline for Maple, Boston Creme, and seasonal donuts.',
      no: 'Delivery-only donut SKUs and beverages print normally.',
      di: 'Impacted SKUs include caramel drizzle or >3 toppings.',
      ch: 'All failing orders route through donut-builder v3 in IAD.'
    },
    {
      questionId: 'what-deviation',
      q: 'WHAT — Specific Deviation does the {OBJECT} have?',
      is: 'Tickets print 20+ minutes late and toppings mis-apply.',
      no: 'Savory pastries, muffins, and croissants stay accurate.',
      di: 'Deviation tied to loyalty-heavy pickup orders only.',
      ch: 'Began immediately after enabling proofing profile weights.'
    },
    { band: 'WHERE', note: 'Locate the problem (geography/topology and on the object).' },
    {
      questionId: 'where-location',
      q: 'WHERE — is the {OBJECT} geographically/topology when the {DEVIATION} occurs?',
      is: 'East coast partner bakeries (BOS, NYC, ATL) plus curbside lanes.',
      no: 'West and central regions along with delivery-only kitchens are healthy.',
      di: 'Only stores pinned to the loyalty CDN path misbehave.',
      ch: 'IAD edge POP; ORD/SJC continue serving v2 config.'
    },
    { band: 'WHEN', note: 'Timing and Description' },
    {
      questionId: 'when-first-observed',
      q: 'WHEN — Was the {DEVIATION} First observed for {OBJECT}',
      is: 'First alert 2024-02-14 11:05Z during breakfast rush.',
      no: 'Night shift and pre-11:00Z pickups were normal.',
      di: 'Accelerates once loyalty blitz email landed at 11:00Z.',
      ch: 'Coincides with rollout of new proofing weights feature flag.'
    },
    { band: 'EXTENT', note: 'How big is it? Magnitude, count, scope, trend.' },
    {
      questionId: 'extent-population',
      q: 'EXTENT — What is the population or size of {OBJECT} affected?',
      is: 'Roughly 180 of 430 east region stores (~42%).',
      no: 'West and central regions remain <2 minute SLA.',
      di: 'Orders over $24 with >3 toppings almost always stall.',
      ch: 'Spike tracks with new loyalty segmentation job that reweighted queues.'
    }
  ],
  causes: [
    {
      id: 'cause-donut-proofing',
      suspect: 'Proofing profile weights stuck for loyalty orders.',
      accusation: 'New weights keep proofing microservice in "priority" state so bakery tickets never release.',
      impact: 'Pickup queue blocks and toppings drift, forcing manual comping.',
      summaryText: 'Proofing service pinned to loyalty profile causing donut-builder queue starvation.',
      confidence: 'high',
      evidence: 'Turning off loyalty flag immediately clears backlog on test bakery.',
      findings: {
        'what-object': { mode: 'yes', note: 'Impacts bakery pickup tickets that use the loyalty personalization path.' },
        'extent-population': { mode: 'yes', note: 'Matches east stores bound to loyalty CDN POP.' },
        'when-first-observed': { mode: 'yes', note: 'Exact start aligns with proofing weights deployment.' }
      },
      editing: false,
      testingOpen: false
    },
    {
      id: 'cause-donut-cache',
      suspect: 'Edge cache serving stale menu metadata.',
      accusation: 'CDN cached stale toppings metadata so donut-builder miscalculates assembly steps.',
      impact: 'Manual overrides spike and queue rebuild jobs restart continuously.',
      summaryText: 'Menu metadata cache missed invalidation and causes stale toppings to persist.',
      confidence: 'medium',
      evidence: 'Single-store purge temporarily cleared issues but problem returned.',
      findings: {
        'what-deviation': { mode: 'assumption', note: 'Would explain wrong toppings but not the 20m delay.' },
        'where-location': { mode: 'fail', note: 'West region also shares CDN but remains healthy.' }
      },
      editing: false,
      testingOpen: false
    }
  ],
  likelyCauseId: 'cause-donut-proofing',
  steps: {
    drawerOpen: true,
    items: [
      { id: '1', label: 'Pre-analysis completed', checked: true },
      { id: '6', label: 'Bridges opened and responders invited', checked: true },
      { id: '12', label: 'Possible causes developed', checked: true },
      { id: '15', label: 'Containment options identified', checked: true },
      { id: '19', label: 'Most probable cause identified', checked: false }
    ]
  },
  actions: {
    analysisId: 'template-donut',
    items: [
      {
        id: 'action-donut-rollback',
        analysisId: 'template-donut',
        createdAt: '2024-02-14T11:20:00Z',
        createdBy: 'TemplateBot',
        summary: 'Pin donut-builder traffic to legacy proofing profile.',
        detail: 'Use feature flag console to route pickup orders away from loyalty weights until a fix ships.',
        owner: {
          name: 'Ops Automation',
          category: 'TECHNOLOGY_PLATFORM',
          subOwner: 'TECHNOLOGY_PLATFORM__DEPLOYMENT_AUTOMATION',
          notes: 'Coordinating with bakery ops on customer impact.',
          lastAssignedBy: 'TemplateBot',
          lastAssignedAt: '2024-02-14T11:25:00Z',
          source: 'Template'
        },
        role: 'Deployment',
        status: 'In-Progress',
        priority: 'High',
        dueAt: '2024-02-14T11:45:00Z',
        startedAt: '2024-02-14T11:25:00Z',
        completedAt: '',
        dependencies: [],
        risk: 'Medium',
        changeControl: { required: true, rollbackPlan: 'Disable donut-builder v3 feature flag.' },
        verification: { required: true, result: '' },
        links: {},
        notes: 'Need SEM ops approval before rollout.',
        auditTrail: []
      },
      {
        id: 'action-donut-comms',
        analysisId: 'template-donut',
        createdAt: '2024-02-14T11:30:00Z',
        createdBy: 'TemplateBot',
        summary: 'Prep partner comms for bakery franchises.',
        detail: 'Draft acknowledgement plus ETA so BC can brief franchise owners and customer care.',
        owner: {
          name: 'Customer Care',
          category: 'USER_COMMS',
          subOwner: 'USER_COMMS__CUSTOMER_COMMUNICATION',
          notes: 'Aligning with BC on cadence.',
          lastAssignedBy: 'TemplateBot',
          lastAssignedAt: '2024-02-14T11:32:00Z',
          source: 'Template'
        },
        role: 'Comms',
        status: 'Planned',
        priority: 'Med',
        dueAt: '2024-02-14T12:00:00Z',
        startedAt: '',
        completedAt: '',
        dependencies: [],
        risk: 'Low',
        changeControl: { required: false },
        verification: { required: false },
        links: {},
        notes: 'Mirror copy to consumer status page.',
        auditTrail: []
      }
    ]
  }
});

const checkoutTemplateState = createState({
  pre: {
    oneLine: 'EU checkout requests timing out after CDN rule change.',
    proof: 'APM shows p95 latency at 18s with widespread gateway retries.',
    objectPrefill: 'Checkout service / EU tenants',
    healthy: 'Authorizations complete under 3s with <1% retry.',
    now: 'Cards time out, fallback queue saturates, and conversions drop 35%.'
  },
  impact: {
    now: 'Merchants losing €1.2M/hr, customers double-purchasing, and support volume spiking.',
    future: 'Merchants will disable promos and regulators expect notification if >60m.',
    time: 'Started 2024-03-08 07:38Z as CDN header rewrite pushed globally.'
  },
  ops: {
    bridgeOpenedUtc: '2024-03-08 07:42Z',
    icName: 'Jonas Reed',
    bcName: 'Eva Mendez',
    semOpsName: 'Luis Martin',
    severity: 'SEV-1',
    detectMonitoring: true,
    detectUserReport: false,
    detectAutomation: true,
    detectOther: false,
    evScreenshot: false,
    evLogs: true,
    evMetrics: true,
    evRepro: true,
    evOther: true,
    containStatus: 'stabilized',
    containDesc: 'Rolled back EU POPs to last-known-good CDN config and rate-limited loyalty header.',
    commCadence: '15',
    commLog: [
      { type: 'internal', ts: '2024-03-08T07:45:00Z', message: 'War room formed, diffing CDN configs.' },
      { type: 'external', ts: '2024-03-08T08:00:00Z', message: 'Status page updated with EU latency advisory.' },
      { type: 'internal', ts: '2024-03-08T08:10:00Z', message: 'Containment applied via POP rollback; monitoring drop.' }
    ],
    commNextDueIso: '2024-03-08T08:15:00Z',
    commNextUpdateTime: '08:15',
    tableFocusMode: 'comprehensive'
  },
  table: [
    { band: 'WHAT', note: 'Define the problem precisely (Object & Deviation).' },
    {
      questionId: 'what-object',
      q: 'WHAT — Specific Object/Thing is having the {DEVIATION}',
      is: 'Checkout API for EU tenants hitting FRA/AMS POPs.',
      no: 'US checkout tenants plus non-card wallets remain normal.',
      di: 'Only card payments routed through CDN header rewrite show latency.',
      ch: 'Impacted traffic contains new loyalty header added this morning.'
    },
    {
      questionId: 'what-deviation',
      q: 'WHAT — Specific Deviation does the {OBJECT} have?',
      is: 'Auth calls take 15-20s and time out, forcing retries.',
      no: 'Async webhook callbacks and idempotency layer stay nominal.',
      di: 'Latency spikes only on POPs where header rewrite is enabled.',
      ch: 'Deviation began minutes after config promotion.'
    },
    { band: 'WHERE', note: 'Locate the problem (geography/topology and on the object).' },
    {
      questionId: 'where-location',
      q: 'WHERE — is the {OBJECT} geographically/topology when the {DEVIATION} occurs?',
      is: 'FRA and AMS POPs fronting EU tenants.',
      no: 'DUB and LHR POPs on legacy routing stay healthy.',
      di: 'Only POPs that honor loyalty header override misbehave.',
      ch: 'Same POPs received header rewrite at 07:38Z.'
    },
    {
      questionId: 'where-on-object',
      q: 'WHERE — On the {OBJECT} is the {DEVIATION} observed?',
      is: 'Ingress CDN tier before requests reach checkout pods.',
      no: 'Checkout pods inside EU clusters show normal CPU/mem.',
      di: 'Only TLS handshake plus origin selection step regresses.',
      ch: 'Header rewrite manipulates origin cache key for loyalty path.'
    },
    { band: 'WHEN', note: 'Timing and Description' },
    {
      questionId: 'when-pattern',
      q: 'WHEN — Since was the first time has {DEVIATION} been logged? What Pattern?',
      is: 'Continuous since 07:38Z; no relief between retries.',
      no: 'Earlier in the day latency followed normal diurnal pattern.',
      di: 'Traffic during loyalty promo hours is hardest hit.',
      ch: 'Pattern maps to config roll at 07:38Z then steady state.'
    },
    {
      questionId: 'when-description',
      q: 'WHEN — Describe using words When the {DEVIATION} was first seen',
      is: 'Appeared immediately during CDN deploy validation (before user escalation).',
      no: 'No deviations overnight despite heavy load tests.',
      di: 'Only requests including loyalty header see rewrite and delay.',
      ch: 'New config rewrites Accept headers and bypasses warm cache.'
    },
    { band: 'EXTENT', note: 'How big is it? Magnitude, count, scope, trend.' },
    {
      questionId: 'extent-population',
      q: 'EXTENT — What is the population or size of {OBJECT} affected?',
      is: 'All EU card traffic (~2.1k rps) routed through FRA/AMS POPs.',
      no: 'Merchants pinned to DUB POP unaffected.',
      di: 'Premium merchants on loyalty pilot are 2x more impacted.',
      ch: 'Population exactly matches tenants moved to new header rule.'
    },
    {
      questionId: 'extent-size',
      q: 'EXTENT — What is the size of a single {DEVIATION}?',
      is: 'Single checkout attempts incur 18s additional latency and multiple retries.',
      no: 'Baseline deviation remained <500ms before change.',
      di: 'Latency delta grows with each loyalty header mutation.',
      ch: 'Size stabilized once rollback applied.'
    }
  ],
  causes: [
    {
      id: 'cause-cdn-rule',
      suspect: 'CDN header rewrite broke cache keying for loyalty traffic.',
      accusation: 'Rewrite adds Accept header fragment forcing origin revalidation on every request.',
      impact: 'POP queues build, TLS renegotiates, and checkout pods receive bursts.',
      summaryText: 'Misconfigured CDN rule for loyalty header invalidates cache and adds 15s delay.',
      confidence: 'high',
      evidence: 'Disabling rewrite on FRA instantly returns latency to baseline.',
      findings: {
        'what-object': { mode: 'yes', note: 'Only checkout API traffic on loyalty header is impacted.' },
        'where-location': { mode: 'yes', note: 'Matches FRA/AMS POPs that received rewrite.' },
        'when-pattern': { mode: 'yes', note: 'Timeline aligns with header deployment.' }
      },
      editing: false,
      testingOpen: false
    },
    {
      id: 'cause-db-hot',
      suspect: 'Multi-region DB hot partition.',
      accusation: 'EU tenant data co-located causing partition hotspot and slow auth.',
      impact: 'Would explain retries if DB were throttling connections.',
      summaryText: 'Potential DB hot partition causing cascading latency.',
      confidence: 'low',
      evidence: 'DB metrics remain green; theory kept for completeness.',
      findings: {
        'what-deviation': { mode: 'fail', note: 'DB tier shows no latency delta.' },
        'extent-size': { mode: 'fail', note: 'Does not explain 18s TLS stall before origin.' }
      },
      editing: false,
      testingOpen: false
    }
  ],
  likelyCauseId: 'cause-cdn-rule',
  steps: {
    drawerOpen: false,
    items: [
      { id: '2', label: 'Incident Commander assigned', checked: true },
      { id: '8', label: 'Current actions documented (Who/What/When)', checked: true },
      { id: '13', label: 'Testing actions documented (Who/What/When)', checked: true },
      { id: '20', label: 'Restoration/rollback/workaround selected', checked: true },
      { id: '24', label: 'Service validated internally and externally', checked: false }
    ]
  },
  actions: {
    analysisId: 'template-checkout',
    items: [
      {
        id: 'action-cdn-freeze',
        analysisId: 'template-checkout',
        createdAt: '2024-03-08T07:50:00Z',
        createdBy: 'TemplateBot',
        summary: 'Freeze CDN config and audit loyalty rewrite.',
        detail: 'Diff last-known-good config vs current, revert EU POPs, and prepare lock file.',
        owner: {
          name: 'CDN Engineering',
          category: 'TECHNOLOGY_PLATFORM',
          subOwner: 'TECHNOLOGY_PLATFORM__CLOUD',
          notes: 'On-call pair running diff script.',
          lastAssignedBy: 'TemplateBot',
          lastAssignedAt: '2024-03-08T07:52:00Z',
          source: 'Template'
        },
        role: 'Networking',
        status: 'In-Progress',
        priority: 'High',
        dueAt: '2024-03-08T08:20:00Z',
        startedAt: '2024-03-08T07:52:00Z',
        completedAt: '',
        dependencies: [],
        risk: 'High',
        changeControl: { required: true, rollbackPlan: 'CDN config checkpoint restore.' },
        verification: { required: true, result: '' },
        links: {},
        notes: 'Need approval from BC before global push.',
        auditTrail: []
      },
      {
        id: 'action-merchant-brief',
        analysisId: 'template-checkout',
        createdAt: '2024-03-08T08:05:00Z',
        createdBy: 'TemplateBot',
        summary: 'Brief top merchants and regulators.',
        detail: 'Share impact summary, containment ETA, and request extension on EU SLA.',
        owner: {
          name: 'Merchant Success',
          category: 'BUSINESS_CUSTOMER',
          subOwner: 'BUSINESS_CUSTOMER__BUSINESS_RELATIONSHIP',
          notes: 'Coordinating with exec sponsor.',
          lastAssignedBy: 'TemplateBot',
          lastAssignedAt: '2024-03-08T08:06:00Z',
          source: 'Template'
        },
        role: 'BC Comms',
        status: 'Planned',
        priority: 'Med',
        dueAt: '2024-03-08T08:30:00Z',
        startedAt: '',
        completedAt: '',
        dependencies: [],
        risk: 'Medium',
        changeControl: { required: false },
        verification: { required: false },
        links: {},
        notes: 'Prep template for EU regulator alias.',
        auditTrail: []
      }
    ]
  }
});

const TEMPLATES = Object.freeze([
  {
    id: 'donut-line',
    name: 'Donut Line Slowdown',
    description: 'Bakery pickup backlog template featuring the donut proofing example.',
    state: donutTemplateState
  },
  {
    id: 'checkout-latency',
    name: 'Checkout Latency Spike',
    description: 'EU checkout slowdown triggered by a CDN header rewrite.',
    state: checkoutTemplateState
  }
]);

const TEMPLATE_INDEX = new Map(TEMPLATES.map(template => [template.id, template]));
const MODE_INDEX = new Map(TEMPLATE_MODES.map(mode => [mode.id, mode]));

/**
 * List available template definitions for the drawer UI.
 * @returns {Array<{ id: string, name: string, description: string }>} Human-friendly template metadata.
 */
export function listTemplates() {
  return TEMPLATES.map(template => ({
    id: template.id,
    name: template.name,
    description: template.description
  }));
}

/**
 * Retrieve metadata for a specific template identifier.
 * @param {string} templateId - Unique template identifier.
 * @returns {{ id: string, name: string, description: string }|null} Metadata snapshot or null when missing.
 */
export function getTemplateMetadata(templateId) {
  if (typeof templateId !== 'string') {
    return null;
  }
  const template = TEMPLATE_INDEX.get(templateId.trim());
  if (!template) {
    return null;
  }
  return {
    id: template.id,
    name: template.name,
    description: template.description
  };
}

/**
 * List the fixed presentation modes for templates.
 * @returns {Array<{ id: string, name: string, description: string }>} Mode metadata for declarative UIs.
 */
export function listTemplateModes() {
  return TEMPLATE_MODES.map(mode => ({ ...mode }));
}

/**
 * Retrieve the serialized payload for a given template and mode.
 * @param {string} templateId - Template identifier from {@link listTemplates}.
 * @param {keyof typeof MODE_RULES} modeId - Mode identifier from {@link listTemplateModes}.
 * @returns {import('./storage.js').SerializedAppState|null} Mode-aware payload ready for applyAppState.
 */
export function getTemplatePayload(templateId, modeId) {
  if (typeof templateId !== 'string' || typeof modeId !== 'string') {
    return null;
  }
  const template = TEMPLATE_INDEX.get(templateId.trim());
  if (!template) {
    return null;
  }
  const normalizedMode = MODE_INDEX.has(modeId.trim()) ? modeId.trim() : null;
  if (!normalizedMode) {
    return null;
  }
  return projectState(template.state, /** @type {keyof typeof MODE_RULES} */ (normalizedMode));
}
