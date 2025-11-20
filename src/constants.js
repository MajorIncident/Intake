/**
 * @module constants
 * Immutable domain data for the KT Intake experience.
 *
 * The collections exported from this module define the prompts, owner
 * categories, and workflow steps that power the UI. Each dataset is created in
 * a mutable form, then recursively frozen to guarantee that feature modules
 * cannot mutate the source of truth at runtime. Importers can therefore rely on
 * the structural contracts documented below without defensive copying.
 */

/**
 * Row entries capture either an anchor banner (band/note) or a probing
 * question. Optional properties are present only when relevant to the UI.
 *
 * @typedef {Object} RowDefinition
 * @property {string} [band] - Section heading grouping related questions.
 * @property {string} [note] - Contextual helper text shown alongside the band.
 * @property {string} [id] - Stable identifier used for persistence.
 * @property {string} [q] - Intake question template with `{OBJECT}` tokens.
 * @property {('p1'|'p2')} [priority] - Visual priority indicator for the row.
 * @property {string} [isPH] - Prompt for what is happening (Positive Hypothesis).
 * @property {string} [notPH] - Prompt for what is not happening (Negative Hypothesis).
 */

/**
 * @typedef {Object} OwnerSubCategory
 * @property {string} id - Stable identifier used for storage and analytics.
 * @property {string} label - Human readable label presented to operators.
 */

/**
 * @typedef {Object} OwnerCategory
 * @property {string} id - Stable identifier for the broader responsibility area.
 * @property {string} label - Category heading displayed in the UI.
 * @property {OwnerSubCategory[]} subOwners - Specific roles or teams.
 */

/**
 * @typedef {Object} StepPhase
 * @property {string} id - Phase code mapped to a display badge.
 * @property {string} label - Readable summary of the phase objective.
 */

/**
 * @typedef {Object} StepDefinition
 * @property {string} id - Identifier for ordering and persistence.
 * @property {string} phase - Associated {@link StepPhase} `id`.
 * @property {string} label - Description of the activity for operators to track.
 */

/**
 * Recursively applies {@link Object.freeze} to the provided structure so that
 * nested objects and arrays become deeply immutable.
 *
 * @template {object} T
 * @param {T} obj - Plain object or array to protect from runtime mutation.
 * @returns {Readonly<T>} The same reference, now deeply frozen.
 */
function deepFreeze(obj) {
  Object.getOwnPropertyNames(obj).forEach((name) => {
    const value = obj[name];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  });
  return Object.freeze(obj);
}

/** @type {RowDefinition[]} */
const ROWS_UNFROZEN = [
  { band: "WHAT", note: "Define the problem precisely (Object & Deviation)." },

  {
    id: 'what-object',
    q: "WHAT — Specific Object/Thing is having the {DEVIATION}",
    priority: 'p1',
    isPH:
      "What specific object has {DEVIATION}?",
    notPH:
      "What similar objects could reasonably have, but do NOT have {DEVIATION}?"
  },
  {
    id: 'what-deviation',
    q: "WHAT — Specific Deviation does the {OBJECT} have?",
    priority: 'p1',
    isPH:
      "What exactly is the deviation that has been confirmed?",
    notPH:
      "What reasonable symptoms could the {OBJECT} have had, but we have verified are NOT present?"
  },

  { band: "WHERE", note: "Locate the problem (geography/topology and on the object)." },

  {
    id: 'where-location',
    q: "WHERE — is the {OBJECT} geographically/topology when the {DEVIATION} occurs?",
    priority: 'p1',
    isPH:
      "Where is {OBJECT} when {DEVIATION} occurs?",
    notPH:
      "Where would you reasonably expect the {OBJECT} could have been when the {DEVIATION} was observed but we do NOT see it?"
  },
  {
    id: 'where-on-object',
    q: "WHERE — On the {OBJECT} is the {DEVIATION} observed?",
    priority: 'p2',
    isPH:
      "Where on {OBJECT} is {DEVIATION} observed?",
    notPH:
      "What neighboring parts on the {OBJECT} do NOT show {DEVIATION}?"
  },

  { band: "WHEN", note: "Timing and Description" },

  {
    id: 'when-first-observed',
    q: "WHEN — Was the {DEVIATION} First observed for {OBJECT}",
    priority: 'p2',
    isPH:
      "When was {DEVIATION} first observed for {OBJECT}? (date/time/zone)",
    notPH:
      "When was the last known good for {OBJECT}? When reasonably could we have observed other {DEVIATION} on {OBJECT} but we did not?"
  },
  {
    id: 'when-pattern',
    q: "WHEN — Since the first occurrence has {DEVIATION} been logged? What Pattern?",
    isPH:
      "Since first occurrence, when does {DEVIATION} re-occur?\n• What Pattern (continuous/periodic/sporadic/one time)",
    notPH:
      "What Similar windows/patterns of times is the {OBJECT} not having {DEVIATION}?"
  },
  {
    id: 'when-description',
    q: "WHEN — Describe using words When the {DEVIATION} was first seen",
    isPH:
      "At what point in {OBJECT}’s life-cycle did {DEVIATION} appear?\n• Use words like before, during, or after to describe these times and consider multiple lifecycles",
    notPH:
      "What Adjacent life-cycle moments could we have reasonably caught or observed the {DEVIATION} but we did not?"
  },

  { band: "EXTENT", note: "How big is it? Magnitude, count, scope, trend." },

  {
    id: 'extent-population',
    q: "EXTENT — What is the population or size of {OBJECT} affected?",
    isPH:
      "How many {OBJECT}s have {DEVIATION}?\nTrend (↑/↓/stable)?",
    notPH:
      "What population or Comparable object sets have not been affected"
  },
  {
    id: 'extent-size',
    q: "EXTENT — What is the size of a single {DEVIATION}?",
    isPH:
      "How big is a single {DEVIATION} on {OBJECT}?\nTrend (↑/↓/stable)?",
    notPH:
      "What sizes could the {DEVIATION} reasonably have been but were not?"
  },
  {
    id: 'extent-count',
    q: "EXTENT — How many {DEVIATION} are occuring on each {OBJECT}?",
    isPH:
      "How many instances of {DEVIATION} per {OBJECT}?\nTrend (↑/↓/stable)?",
    notPH:
      "Reasonably, how many instances of {DEVIATION} could have occured per {OBJECT} but did not?"
  }
];

export const ROWS = deepFreeze(ROWS_UNFROZEN);

export const CAUSE_FINDING_MODES = deepFreeze({
  ASSUMPTION: 'assumption',
  YES: 'yes',
  FAIL: 'fail'
});

export const CAUSE_FINDING_MODE_VALUES = Object.freeze(Object.values(CAUSE_FINDING_MODES));

/** @type {OwnerCategory[]} */
const OWNER_CATEGORIES_UNFROZEN = [
  {
    id: 'APPLICATION_PRODUCT',
    label: 'Application & Product',
    subOwners: [
      { id: 'APPLICATION_PRODUCT__APPLICATION_OWNER', label: 'Application Owner' },
      { id: 'APPLICATION_PRODUCT__BUSINESS_APPLICATION_SUPPORT', label: 'Business Application Support' },
      { id: 'APPLICATION_PRODUCT__PRODUCT_MANAGEMENT', label: 'Product Management' },
      { id: 'APPLICATION_PRODUCT__QA_TESTING', label: 'QA / Testing' },
      { id: 'APPLICATION_PRODUCT__RELEASE_MANAGEMENT', label: 'Release Management' }
    ]
  },
  {
    id: 'BUSINESS_CUSTOMER',
    label: 'Business & Customer',
    subOwners: [
      { id: 'BUSINESS_CUSTOMER__BUSINESS_CONTINUITY', label: 'Business Continuity (BCP)' },
      { id: 'BUSINESS_CUSTOMER__BUSINESS_RELATIONSHIP', label: 'Business Relationship Management' },
      { id: 'BUSINESS_CUSTOMER__CUSTOMER_SUPPORT', label: 'Customer Support / Service Desk' },
      { id: 'BUSINESS_CUSTOMER__EXECUTIVE_SPONSOR', label: 'Executive Business Sponsor' },
      { id: 'BUSINESS_CUSTOMER__PROCESS_OWNER', label: 'Process Owner (ASQ)' }
    ]
  },
  {
    id: 'CHANGE_CONFIGURATION',
    label: 'Change & Configuration (ITIL / ISO)',
    subOwners: [
      { id: 'CHANGE_CONFIGURATION__CAB', label: 'Change Advisory Board (CAB)' },
      { id: 'CHANGE_CONFIGURATION__CHANGE_MANAGER', label: 'Change Manager / Change Enablement' },
      { id: 'CHANGE_CONFIGURATION__CONFIGURATION_MANAGEMENT', label: 'Configuration Management / CMDB' }
    ]
  },
  {
    id: 'DATA_DATABASES',
    label: 'Data & Databases',
    subOwners: [
      { id: 'DATA_DATABASES__DBA', label: 'Database Administration (DBA)' },
      { id: 'DATA_DATABASES__DATA_GOVERNANCE', label: 'Data Governance / Data Owner' },
      { id: 'DATA_DATABASES__DATA_PRIVACY', label: 'Data Privacy / Records Management (ISO 27001)' }
    ]
  },
  {
    id: 'ENGINEERING_DEVELOPMENT',
    label: 'Engineering & Development',
    subOwners: [
      { id: 'ENGINEERING_DEVELOPMENT__BACKEND', label: 'Backend Engineering' },
      { id: 'ENGINEERING_DEVELOPMENT__FRONTEND', label: 'Frontend Engineering' },
      { id: 'ENGINEERING_DEVELOPMENT__DEVOPS', label: 'DevOps / Platform Engineering' },
      { id: 'ENGINEERING_DEVELOPMENT__SRE', label: 'SRE (Site Reliability Engineering)' }
    ]
  },
  {
    id: 'FACILITIES_PHYSICAL',
    label: 'Facilities / Physical',
    subOwners: [
      { id: 'FACILITIES_PHYSICAL__BUILDING_MANAGEMENT', label: 'Building Management / Security' },
      { id: 'FACILITIES_PHYSICAL__NETWORK_CABLING', label: 'Network Cabling / Infrastructure On-Prem' },
      { id: 'FACILITIES_PHYSICAL__POWER', label: 'Power / HVAC / UPS Vendor' }
    ]
  },
  {
    id: 'GOVERNANCE_RISK_COMPLIANCE',
    label: 'Governance / Risk / Compliance',
    subOwners: [
      { id: 'GOVERNANCE_RISK_COMPLIANCE__AUDIT', label: 'Audit & Compliance (ISO / ASQ)' },
      { id: 'GOVERNANCE_RISK_COMPLIANCE__ENTERPRISE_RISK', label: 'Enterprise Risk Management' },
      { id: 'GOVERNANCE_RISK_COMPLIANCE__IT_RISK', label: 'IT Risk & Control (SOX / ISO / NIST)' }
    ]
  },
  {
    id: 'HARDWARE_INFRASTRUCTURE',
    label: 'Hardware / Infrastructure',
    subOwners: [
      { id: 'HARDWARE_INFRASTRUCTURE__COMPUTE', label: 'Compute / Virtualization' },
      { id: 'HARDWARE_INFRASTRUCTURE__DATA_CENTER', label: 'Data Center Operations' },
      { id: 'HARDWARE_INFRASTRUCTURE__STORAGE', label: 'Storage Administration' }
    ]
  },
  {
    id: 'INFORMATION_SECURITY',
    label: 'Information Security (ISO / NIST)',
    subOwners: [
      { id: 'INFORMATION_SECURITY__INCIDENT_RESPONSE', label: 'Incident Response / CSIRT' },
      { id: 'INFORMATION_SECURITY__THREAT_INTEL', label: 'Threat Intelligence' },
      { id: 'INFORMATION_SECURITY__VULNERABILITY', label: 'Vulnerability Management' },
      { id: 'INFORMATION_SECURITY__SOC', label: 'Security Operations Center (SOC)' }
    ]
  },
  {
    id: 'KNOWLEDGE_CI',
    label: 'Knowledge & Continuous Improvement',
    subOwners: [
      { id: 'KNOWLEDGE_CI__LESSONS_LEARNED', label: 'Lessons Learned / Postmortem' },
      { id: 'KNOWLEDGE_CI__LEAN', label: 'Lean / Continuous Improvement (ASQ)' },
      { id: 'KNOWLEDGE_CI__TRAINING', label: 'Training / SOP Documentation' }
    ]
  },
  {
    id: 'MAJOR_INCIDENT_MANAGEMENT',
    label: 'Major Incident Management (ITIL / NIST)',
    subOwners: [
      { id: 'MAJOR_INCIDENT_MANAGEMENT__INCIDENT_COMMANDER', label: 'Incident Commander' },
      { id: 'MAJOR_INCIDENT_MANAGEMENT__COMMUNICATIONS_LEAD', label: 'Communications Lead' },
      { id: 'MAJOR_INCIDENT_MANAGEMENT__TECHNICAL_BRIDGE_LEAD', label: 'Technical Bridge Lead' },
      { id: 'MAJOR_INCIDENT_MANAGEMENT__SCRIBE', label: 'Scribe / Work Notes' }
    ]
  },
  {
    id: 'NETWORK',
    label: 'Network',
    subOwners: [
      { id: 'NETWORK__NETWORK_ENGINEERING', label: 'Network Engineering' },
      { id: 'NETWORK__FIREWALL', label: 'Firewall / Security Perimeter' },
      { id: 'NETWORK__TELECOM', label: 'Telecom / WAN / MPLS / SD-WAN' }
    ]
  },
  {
    id: 'PROJECT_PROGRAM_MANAGEMENT',
    label: 'Project / Program Management (PMI)',
    subOwners: [
      { id: 'PROJECT_PROGRAM_MANAGEMENT__PROJECT_MANAGER', label: 'Project Manager' },
      { id: 'PROJECT_PROGRAM_MANAGEMENT__PROGRAM_MANAGER', label: 'Program Manager' },
      { id: 'PROJECT_PROGRAM_MANAGEMENT__PMO', label: 'PMO (Project Management Office)' }
    ]
  },
  {
    id: 'RELEASE_DEPLOYMENT',
    label: 'Release / Environment / Deployment',
    subOwners: [
      { id: 'RELEASE_DEPLOYMENT__RELEASE_TRAIN_ENGINEER', label: 'Release Train Engineer (Scaled Agile)' },
      { id: 'RELEASE_DEPLOYMENT__ENVIRONMENT_MANAGER', label: 'Environment Manager' },
      { id: 'RELEASE_DEPLOYMENT__DEPLOYMENT_AUTOMATION', label: 'Deployment / Automation' }
    ]
  },
  {
    id: 'SERVICE_OPERATIONS',
    label: 'Service Operations (ITIL)',
    subOwners: [
      { id: 'SERVICE_OPERATIONS__AVAILABILITY', label: 'Availability Management' },
      { id: 'SERVICE_OPERATIONS__CAPACITY', label: 'Capacity Management' },
      { id: 'SERVICE_OPERATIONS__SERVICE_LEVEL', label: 'Service Level Management' },
      { id: 'SERVICE_OPERATIONS__PROBLEM_MANAGEMENT', label: 'Problem Management' },
      { id: 'SERVICE_OPERATIONS__SERVICE_OWNER', label: 'Service Owner' },
      { id: 'SERVICE_OPERATIONS__VENDOR_MANAGEMENT', label: 'Vendor / Supplier Management' }
    ]
  },
  {
    id: 'TECHNOLOGY_PLATFORM',
    label: 'Technology Platform Teams',
    subOwners: [
      { id: 'TECHNOLOGY_PLATFORM__CLOUD', label: 'Cloud / Infrastructure-as-Code' },
      { id: 'TECHNOLOGY_PLATFORM__INTEGRATION', label: 'Integration / API' },
      { id: 'TECHNOLOGY_PLATFORM__MIDDLEWARE', label: 'Middleware' },
      { id: 'TECHNOLOGY_PLATFORM__MONITORING', label: 'Monitoring & Observability' }
    ]
  },
  {
    id: 'USER_COMMS',
    label: 'User Experience & Comms',
    subOwners: [
      { id: 'USER_COMMS__CUSTOMER_COMMUNICATION', label: 'Customer Communication' },
      { id: 'USER_COMMS__UX', label: 'UX / Digital Experience Monitoring' },
      { id: 'USER_COMMS__TRAINING', label: 'Training & Instructions to End-Users' }
    ]
  },
  {
    id: 'GENERIC',
    label: 'Generic / Universal',
    subOwners: [
      { id: 'GENERIC__UNASSIGNED', label: 'Unassigned' },
      { id: 'GENERIC__TBD', label: 'TBD / To Be Determined' },
      { id: 'GENERIC__EXTERNAL_VENDOR', label: 'External Vendor' },
      { id: 'GENERIC__THIRD_PARTY_SUPPORT', label: '3rd-Party Support Provider' }
    ]
  }
];

export const OWNER_CATEGORIES = deepFreeze(OWNER_CATEGORIES_UNFROZEN);

/** @type {StepPhase[]} */
const STEPS_PHASES_UNFROZEN = [
  { id:'A', label:'Activate & Frame' },
  { id:'B', label:'Hypothesize, Test & Communicate' },
  { id:'C', label:'Evaluate & Decide' },
  { id:'D', label:'Restore, Validate' },
  { id:'E', label:'Handover & Close' }
];

export const STEPS_PHASES = deepFreeze(STEPS_PHASES_UNFROZEN);

/** @type {StepDefinition[]} */
const STEP_DEFINITIONS_UNFROZEN = [
  { id:'1', phase:'A', label:'Pre-analysis completed' },
  { id:'2', phase:'A', label:'Incident Commander assigned' },
  { id:'3', phase:'A', label:'Step 1 reviewed by BC' },
  { id:'4', phase:'A', label:'Problem statement created' },
  { id:'5', phase:'A', label:'Bridge options considered' },
  { id:'6', phase:'A', label:'Bridges opened and responders invited' },
  { id:'7', phase:'A', label:'Bridge etiquette, roles, and guidelines outlined' },
  { id:'8', phase:'A', label:'Current actions documented (Who/What/When)' },
  { id:'9', phase:'A', label:'Quick spec answers captured' },
  { id:'10', phase:'A', label:'Last changes, monitoring, and dependencies investigated' },
  { id:'11', phase:'A', label:'Attendees optimized' },
  { id:'12', phase:'B', label:'Possible causes developed' },
  { id:'13', phase:'B', label:'Testing actions documented (Who/What/When)' },
  { id:'14', phase:'B', label:'Micro-experiments/tests conducted' },
  { id:'15', phase:'B', label:'Containment options identified' },
  { id:'16', phase:'B', label:'Comms written, reviewed, and sent' },
  { id:'17', phase:'B', label:'Attendees optimized for next action' },
  { id:'18', phase:'C', label:'Possible causes evaluated and distinctions identified' },
  { id:'19', phase:'C', label:'Most probable cause identified' },
  { id:'20', phase:'C', label:'Restoration/rollback/workaround selected' },
  { id:'21', phase:'C', label:'Attendees optimized for decision' },
  { id:'22', phase:'C', label:'Verification and risk plan created' },
  { id:'23', phase:'D', label:'Restoration actions documented (Who/What/When)' },
  { id:'24', phase:'D', label:'Service validated internally and externally' },
  { id:'25', phase:'D', label:'Restoration comms sent' },
  { id:'26', phase:'E', label:'Handover template prepared (PIR/problem)' },
  { id:'27', phase:'E', label:'Downstream issues from fix assessed' },
  { id:'28', phase:'E', label:'Participants released and bridge closed' }
];

export const STEP_DEFINITIONS = deepFreeze(STEP_DEFINITIONS_UNFROZEN);

export { deepFreeze };
