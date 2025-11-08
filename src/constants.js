// Immutable data definitions for KT Intake.
// Centralises configuration and protects it via deep freeze.

function deepFreeze(obj) {
  Object.getOwnPropertyNames(obj).forEach((name) => {
    const value = obj[name];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  });
  return Object.freeze(obj);
}

const ROWS_UNFROZEN = [
  { band: "WHAT", note: "Define the problem precisely (Object & Deviation)." },

  {
    q: "WHAT — Specific Object/Thing is having the {DEVIATION}",
    priority: 'p1',
    isPH:
      "What specific object has {DEVIATION}?",
    notPH:
      "What similar objects could reasonably have, but do NOT have {DEVIATION}?"
  },
  {
    q: "WHAT — Specific Deviation does the {OBJECT} have?",
    priority: 'p1',
    isPH:
      "What exactly is the deviation that has been confirmed?",
    notPH:
      "What reasonable symptoms could the {OBJECT} have had, but we have verified are NOT present?"
  },

  { band: "WHERE", note: "Locate the problem (geography/topology and on the object)." },

  {
    q: "WHERE — is the {OBJECT} geographically/topology when the {DEVIATION} occurs?",
    priority: 'p1',
    isPH:
      "Where is {OBJECT} when {DEVIATION} occurs?",
    notPH:
      "Where would you reasonably expect the {OBJECT} could have been when the {DEVIATION} was observed but we do NOT see it?"
  },
  {
    q: "WHERE — On the {OBJECT} is the {DEVIATION} observed?",
    priority: 'p2',
    isPH:
      "Where on {OBJECT} is {DEVIATION} observed?",
    notPH:
      "What neighboring parts on the {OBJECT} do NOT show {DEVIATION}?"
  },

  { band: "WHEN", note: "Timing and Description" },

  {
    q: "WHEN — Was the {DEVIATION} First observed for {OBJECT}",
    priority: 'p2',
    isPH:
      "When was {DEVIATION} first observed for {OBJECT}? (date/time/zone)",
    notPH:
      "When was the last known good for {OBJECT}? When reasonably could we have observed other {DEVIATION} on {OBJECT} but we did not?"
  },
  {
    q: "WHEN — Since was the first time has {DEVIATION} been logged? What Pattern?",
    isPH:
      "Since first occurrence, when does {DEVIATION} re-occur?\n• What Pattern (continuous/periodic/sporadic/one time)",
    notPH:
      "What Similar windows/patterns of times is the {OBJECT} not having {DEVIATION}?"
  },
  {
    q: "WHEN — Describe using words When the {DEVIATION} was first seen",
    isPH:
      "At what point in {OBJECT}’s life-cycle did {DEVIATION} appear?\n• Use words like before, during, or after to describe these times and consider multiple lifecycles",
    notPH:
      "What Adjacent life-cycle moments could we have reasonably caught or observed the {DEVIATION} but we did not?"
  },

  { band: "EXTENT", note: "How big is it? Magnitude, count, scope, trend." },

  {
    q: "EXTENT — What is the population or size of {OBJECT} affected?",
    isPH:
      "How many {OBJECT}s have {DEVIATION}?\nTrend (↑/↓/stable)?",
    notPH:
      "What population or Comparable object sets have not been affected"
  },
  {
    q: "EXTENT — What is the size of a single {DEVIATION}?",
    isPH:
      "How big is a single {DEVIATION} on {OBJECT}?\nTrend (↑/↓/stable)?",
    notPH:
      "What sizes could the {DEVIATION} reasonably have been but were not?"
  },
  {
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

const STEPS_PHASES_UNFROZEN = [
  { id:'A', label:'Activate & Frame' },
  { id:'B', label:'Hypothesize, Test & Communicate' },
  { id:'C', label:'Evaluate & Decide' },
  { id:'D', label:'Restore, Validate & Close Comms Loop' },
  { id:'E', label:'Handover & Close' }
];

export const STEPS_PHASES = deepFreeze(STEPS_PHASES_UNFROZEN);

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
