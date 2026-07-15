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
  assert.equal(DEFAULT_INTAKE_MODE, INTAKE_MODE_IDS.MAJOR_INCIDENT);
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
  assert.match(itCopy, /technology operations/i);

  const majorIncidentCopy = [
    ...Object.values(INTAKE_MODE_CAPTION_OVERRIDES[INTAKE_MODE_IDS.MAJOR_INCIDENT]),
    ...Object.values(INTAKE_MODE_HELPER_OVERRIDES[INTAKE_MODE_IDS.MAJOR_INCIDENT])
  ].join(' ');
  assert.match(majorIncidentCopy, /major incident/i);
  assert.match(majorIncidentCopy, /responders/i);
  assert.match(majorIncidentCopy, /bridge/i);
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
