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


test('each mode exposes the approved simplified intake questions and helpers', () => {
  const expectedCopy = {
    [INTAKE_MODE_IDS.GENERAL]: {
      oneLine: ['What item is affected, and what is wrong with it?', 'Describe one item and one clear difference from what should be happening. Do not include the cause or solution.'],
      impactTime: ['By when must action be taken before the impact gets worse?', 'Give a date, time, deadline, or event, and explain what changes after that point.']
    },
    [INTAKE_MODE_IDS.IT]: {
      oneLine: ['What service or system is affected, and what is it doing wrong?', 'State the affected service, the problem users or systems are seeing, and the known scope. Do not include a suspected cause.'],
      impactTime: ['What is the next deadline or event before the impact becomes worse?', 'Give the specific time and consequence, such as a processing cutoff, release window, capacity limit, or business deadline.']
    },
    [INTAKE_MODE_IDS.PHARMA]: {
      oneLine: ['What unexpected condition was observed, and what product, batch, process, material, or equipment may be affected?', 'State what was observed and the initial scope. Do not include an assumed cause or unconfirmed product impact.'],
      impactTime: ['By when must containment, assessment, or a decision occur?', 'Give the relevant hold point, release date, manufacturing step, shipment, reporting deadline, or other decision point.']
    },
    [INTAKE_MODE_IDS.MAJOR_INCIDENT]: {
      oneLine: ['What critical service or business capability is affected, and what is happening?', 'State the affected capability, the current problem, and the confirmed scope. Do not include a suspected cause.'],
      impactTime: ['What is the next hard deadline before the impact becomes much worse?', 'Give the exact time, event, or threshold and explain the consequence. Track communication update times separately.']
    }
  };

  Object.entries(expectedCopy).forEach(([modeId, fields]) => {
    Object.entries(fields).forEach(([fieldId, [label, helper]]) => {
      assert.equal(INTAKE_MODE_CAPTION_OVERRIDES[modeId][fieldId], label);
      assert.equal(INTAKE_MODE_HELPER_OVERRIDES[modeId][fieldId], helper);
    });
  });
});

test('every simplified prompt retains a question label and directive helper text', () => {
  Object.values(INTAKE_MODE_IDS).forEach((modeId) => {
    REQUIRED_FIELD_IDS.forEach((fieldId) => {
      const { label, helper } = INTAKE_MODE_FIELD_CAPTIONS[modeId][fieldId];
      assert.match(label, /\?$/, `${modeId}.${fieldId} label should be a question`);
      assert.doesNotMatch(helper, /\?$/, `${modeId}.${fieldId} helper should be direct guidance`);
      assert.equal(label, INTAKE_MODE_CAPTION_OVERRIDES[modeId][fieldId]);
      assert.equal(helper, INTAKE_MODE_HELPER_OVERRIDES[modeId][fieldId]);
    });
  });
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
