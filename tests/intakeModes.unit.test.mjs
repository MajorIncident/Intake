/**
 * @file Verifies intake-mode metadata, visibility, and copy-map contracts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_INTAKE_MODE,
  INTAKE_MODE_CAPTION_OVERRIDES,
  INTAKE_MODE_FIELD_CAPTIONS,
  INTAKE_MODE_HELPER_OVERRIDES,
  INTAKE_MODE_IDS,
  INTAKE_MODE_LABELS,
  INTAKE_MODE_SECTION_VISIBILITY,
  INTAKE_MODES
} from '../src/intakeModes.js';

const REQUIRED_FIELD_IDS = ['oneLine', 'proof', 'objectPrefill', 'healthy', 'now', 'impactNow', 'impactFuture', 'impactTime'];
const REQUIRED_SECTION_IDS = [
  'problemSummary',
  'collaboration',
  'detectionSource',
  'evidenceCollected',
  'incidentProof',
  'impact',
  'containment',
  'problemAnalysis',
  'possibleCauses',
  'actions',
  'handover',
  'communications',
  'steps'
];

test('intake mode IDs, labels, and default mode are exported for all supported modes', () => {
  assert.deepEqual(INTAKE_MODE_IDS, {
    GENERAL: 'general',
    IT: 'it',
    PHARMA: 'pharma',
    MAJOR_INCIDENT: 'majorIncident'
  });
  assert.equal(DEFAULT_INTAKE_MODE, INTAKE_MODE_IDS.GENERAL);
  assert.deepEqual(
    INTAKE_MODES.map(({ id, label }) => [id, label]),
    Object.values(INTAKE_MODE_IDS).map((id) => [id, INTAKE_MODE_LABELS[id]])
  );
});

test('each intake mode declares visibility for every known workflow section', () => {
  Object.values(INTAKE_MODE_IDS).forEach((modeId) => {
    assert.deepEqual(Object.keys(INTAKE_MODE_SECTION_VISIBILITY[modeId]).sort(), [...REQUIRED_SECTION_IDS].sort());
  });
  assert.ok(Object.values(INTAKE_MODE_SECTION_VISIBILITY[INTAKE_MODE_IDS.MAJOR_INCIDENT]).every(Boolean));
});

test('caption and helper override maps preserve stable field IDs for every mode', () => {
  Object.values(INTAKE_MODE_IDS).forEach((modeId) => {
    assert.deepEqual(Object.keys(INTAKE_MODE_CAPTION_OVERRIDES[modeId]).sort(), [...REQUIRED_FIELD_IDS].sort());
    assert.deepEqual(Object.keys(INTAKE_MODE_HELPER_OVERRIDES[modeId]).sort(), [...REQUIRED_FIELD_IDS].sort());
    assert.deepEqual(Object.keys(INTAKE_MODE_FIELD_CAPTIONS[modeId]).sort(), [...REQUIRED_FIELD_IDS].sort());
    REQUIRED_FIELD_IDS.forEach((fieldId) => {
      assert.equal(typeof INTAKE_MODE_FIELD_CAPTIONS[modeId][fieldId].label, 'string');
      assert.equal(typeof INTAKE_MODE_FIELD_CAPTIONS[modeId][fieldId].helper, 'string');
      assert.equal(typeof INTAKE_MODE_FIELD_CAPTIONS[modeId][fieldId].subtitle, 'string');
      assert.equal(typeof INTAKE_MODE_FIELD_CAPTIONS[modeId][fieldId].placeholder, 'string');
    });
  });
});


test('controlled fields use single-question labels and mode-appropriate helper guidance', () => {
  const expectedCopy = {
    [INTAKE_MODE_IDS.GENERAL]: {
      oneLine: /what is wrong.*affected item.*differ from expectation/i,
      objectPrefill: /affected item or object/i,
      impactTime: /action or resolution needed to avoid additional impact/i
    },
    [INTAKE_MODE_IDS.IT]: {
      oneLine: /what problem is affecting the service or system/i,
      proof: /observed evidence confirms the technical deviation/i,
      objectPrefill: /which system is affected/i,
      impactTime: /action or resolution needed to avoid additional impact/i
    },
    [INTAKE_MODE_IDS.PHARMA]: {
      oneLine: /observed deviation.*product, process, material, equipment, study, or batch/i,
      proof: /evidence confirms the quality deviation/i,
      impactTime: /action or resolution needed to avoid additional impact/i
    },
    [INTAKE_MODE_IDS.MAJOR_INCIDENT]: {
      oneLine: /major incident.*service or capability/i,
      now: /differ from the baseline/i,
      impactTime: /difficult, expensive, impossible, or meaningless/i
    }
  };

  Object.values(INTAKE_MODE_IDS).forEach((modeId) => {
    REQUIRED_FIELD_IDS.forEach((fieldId) => {
      const { label, helper } = INTAKE_MODE_FIELD_CAPTIONS[modeId][fieldId];
      assert.match(label, /\?$/, `${modeId}.${fieldId} label should be a question`);
      if (modeId === INTAKE_MODE_IDS.MAJOR_INCIDENT) {
        assert.match(helper, /\?$/, `${modeId}.${fieldId} helper should be a question`);
      } else {
        assert.doesNotMatch(helper, /\?$/, `${modeId}.${fieldId} helper should be concise guidance, not a question`);
      }
      assert.equal(label, INTAKE_MODE_CAPTION_OVERRIDES[modeId][fieldId]);
      assert.equal(helper, INTAKE_MODE_HELPER_OVERRIDES[modeId][fieldId]);
    });
    Object.entries(expectedCopy[modeId]).forEach(([fieldId, pattern]) => {
      assert.match(INTAKE_MODE_FIELD_CAPTIONS[modeId][fieldId].label, pattern);
    });
  });
});

test('General, IT, and Pharma helpers guide operators to concrete answer details', () => {
  const guidancePatterns = {
    [INTAKE_MODE_IDS.GENERAL]: /for example.*product defect.*photos.*equipment item.*approved specification.*business or process deadline/is,
    [INTAKE_MODE_IDS.IT]: /scope.*logs.*metrics.*application.*dependency.*host.*environment.*version.*configuration.*service-level objective \(SLO\).*service-level agreement \(SLA\)/is,
    [INTAKE_MODE_IDS.PHARMA]: /assay results.*specification references.*identifier.*batch hold.*release status/is
  };

  Object.entries(guidancePatterns).forEach(([modeId, pattern]) => {
    const helpers = Object.values(INTAKE_MODE_HELPER_OVERRIDES[modeId]).join(' ');
    assert.match(helpers, pattern, `${modeId} helpers should identify concrete evidence and decision details`);
  });
});

test('impact timeframe copy identifies the deadline that governs action for each intake mode', () => {
  const expectedGuidance = {
    [INTAKE_MODE_IDS.GENERAL]: /specific date or timeframe.*business or process deadline.*dependency.*milestone.*decision point/i,
    [INTAKE_MODE_IDS.IT]: /specific date or timeframe.*service-level agreement \(SLA\).*release date.*dependency.*decision point/i,
    [INTAKE_MODE_IDS.PHARMA]: /specific date or timeframe.*batch hold point.*release date.*process milestone or deadline.*decision point/i
  };

  Object.entries(expectedGuidance).forEach(([modeId, helperPattern]) => {
    const { label, helper } = INTAKE_MODE_FIELD_CAPTIONS[modeId].impactTime;
    assert.equal(label, 'When is action or resolution needed to avoid additional impact?');
    assert.match(helper, /^For example,/i);
    assert.match(helper, helperPattern);
    assert.doesNotMatch(helper, /difficult, expensive, impossible, or meaningless/i);
  });
});

test('Pharma copy distinguishes confirmed impact, assessment status, and potential unresolved risk', () => {
  const captions = INTAKE_MODE_CAPTION_OVERRIDES[INTAKE_MODE_IDS.PHARMA];
  const helpers = INTAKE_MODE_HELPER_OVERRIDES[INTAKE_MODE_IDS.PHARMA];

  assert.match(captions.oneLine, /observed deviation.*product.*process.*material.*equipment.*study.*batch/i);
  assert.match(captions.impactNow, /confirmed current impact.*current assessment status/i);
  assert.match(captions.impactFuture, /credible potential risk.*remains unresolved/i);
  assert.doesNotMatch(captions.impactFuture, /(?:compliance|stability|supply|patient) impact is likely/i);
  assert.match(helpers.oneLine, /batch or lot scope/i);
  assert.match(helpers.proof, /specification references/i);
  assert.match(helpers.objectPrefill, /batch, or lot identifier/i);
  assert.match(helpers.impactNow, /assessment status.*batch hold or release status/i);
  assert.match(helpers.impactFuture, /potential risk.*safety implications where applicable/i);
});

test('IT primary questions stay plain-language while helpers define technical details', () => {
  const captions = INTAKE_MODE_CAPTION_OVERRIDES[INTAKE_MODE_IDS.IT];
  const helpers = INTAKE_MODE_HELPER_OVERRIDES[INTAKE_MODE_IDS.IT];

  assert.equal(captions.oneLine, 'What problem is affecting the service or system?');
  assert.equal(captions.objectPrefill, 'Which system is affected?');
  assert.doesNotMatch(Object.values(captions).join(' '), /\b(?:IT|SLO|SLA|OS)\b/);
  assert.match(helpers.objectPrefill, /application.*dependency.*host.*environment.*version.*configuration/i);
  assert.match(helpers.healthy, /service-level objective \(SLO\)/i);
  assert.match(helpers.impactTime, /service-level agreement \(SLA\)/i);
  assert.match(captions.proof, /observed evidence/i);
  assert.match(captions.healthy, /service behavior.*expected/i);
  assert.match(captions.now, /actual service behavior now/i);
  assert.match(captions.impactNow, /current user or system impact/i);
  assert.match(captions.impactFuture, /future operational impact.*unresolved/i);
  assert.match(captions.impactTime, /action or resolution needed to avoid additional impact/i);
});

test('General captions and helpers support operational and non-technical intake', () => {
  const captions = INTAKE_MODE_CAPTION_OVERRIDES[INTAKE_MODE_IDS.GENERAL];
  const helpers = INTAKE_MODE_HELPER_OVERRIDES[INTAKE_MODE_IDS.GENERAL];

  assert.match(captions.oneLine, /what is wrong.*affected item.*differ from expectation/i);
  assert.match(captions.objectPrefill, /affected item or object/i);
  assert.match(captions.healthy, /expected.*affected item/i);
  assert.match(captions.now, /observed.*affected item/i);
  assert.match(captions.proof, /evidence confirms the observed difference/i);
  assert.match(captions.impactNow, /current impact/i);
  assert.match(captions.impactFuture, /future impact.*unresolved/i);
  assert.match(captions.impactTime, /action or resolution needed to avoid additional impact/i);

  Object.entries(helpers).forEach(([fieldId, helper]) => {
    assert.match(helper, /^For example,/i, `General ${fieldId} helper should provide examples`);
  });
  assert.match(Object.values(helpers).join(' '), /product defect.*workflow.*equipment.*service/is);
});

test('IT and Major Incident use distinct operations and incident copy maps', () => {
  assert.notDeepEqual(
    INTAKE_MODE_CAPTION_OVERRIDES[INTAKE_MODE_IDS.IT],
    INTAKE_MODE_CAPTION_OVERRIDES[INTAKE_MODE_IDS.MAJOR_INCIDENT]
  );
  assert.notDeepEqual(
    INTAKE_MODE_HELPER_OVERRIDES[INTAKE_MODE_IDS.IT],
    INTAKE_MODE_HELPER_OVERRIDES[INTAKE_MODE_IDS.MAJOR_INCIDENT]
  );

  const itCopy = [
    ...Object.values(INTAKE_MODE_CAPTION_OVERRIDES[INTAKE_MODE_IDS.IT]),
    ...Object.values(INTAKE_MODE_HELPER_OVERRIDES[INTAKE_MODE_IDS.IT])
  ].join(' ');
  assert.doesNotMatch(itCopy, /\b(bridge|comms|communications|handover)\b/i);
  assert.match(itCopy, /technical deviation/i);

  const majorIncidentCopy = [
    ...Object.values(INTAKE_MODE_CAPTION_OVERRIDES[INTAKE_MODE_IDS.MAJOR_INCIDENT]),
    ...Object.values(INTAKE_MODE_HELPER_OVERRIDES[INTAKE_MODE_IDS.MAJOR_INCIDENT])
  ].join(' ');
  assert.match(majorIncidentCopy, /major incident/i);
  assert.match(majorIncidentCopy, /responders/i);
  assert.match(majorIncidentCopy, /blast radius/i);
});

test('IT keeps the same minimal visible sections as General and Pharma', () => {
  assert.deepEqual(
    INTAKE_MODE_SECTION_VISIBILITY[INTAKE_MODE_IDS.IT],
    INTAKE_MODE_SECTION_VISIBILITY[INTAKE_MODE_IDS.GENERAL]
  );
  assert.deepEqual(
    INTAKE_MODE_SECTION_VISIBILITY[INTAKE_MODE_IDS.IT],
    INTAKE_MODE_SECTION_VISIBILITY[INTAKE_MODE_IDS.PHARMA]
  );
});
