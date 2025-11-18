import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { TEMPLATE_MODE_IDS } from '../src/templateModes.js';
import { TEMPLATE_KINDS } from '../src/templateKinds.js';
import {
  __dangerousSetTemplateManifestForTests as setTemplateManifest,
  getTemplateMetadata,
  getTemplatePayload,
  listTemplateModes,
  listTemplates
} from '../src/templates.js';

const BASE_STATE = Object.freeze({
  meta: { version: 1, savedAt: null },
  pre: {
    oneLine: 'Example',
    proof: 'Proof',
    objectPrefill: 'Object',
    healthy: 'Healthy',
    now: 'Now'
  },
  impact: {
    now: 'Immediate impact',
    future: 'Future impact',
    time: 'Time context'
  },
  ops: {
    bridgeOpenedUtc: '2024-01-01T00:00:00Z',
    icName: 'IC',
    bcName: 'BC',
    semOpsName: 'SEM',
    severity: 'SEV-2',
    detectMonitoring: true,
    detectUserReport: false,
    detectAutomation: false,
    detectOther: false,
    evScreenshot: false,
    evLogs: true,
    evMetrics: true,
    evRepro: false,
    evOther: false,
    containStatus: 'investigating',
    containDesc: 'Working mitigation',
    commCadence: '30',
    commLog: [],
    commNextDueIso: '2024-01-01T00:30:00Z',
    commNextUpdateTime: '00:30',
    tableFocusMode: 'rapid'
  },
  table: [
    {
      band: 'WHAT',
      note: 'Primer row'
    },
    {
      questionId: 'what-object',
      q: 'What object?',
      is: 'Object is failing',
      no: 'Objects not failing',
      di: 'Differentiator',
      ch: 'Changes'
    }
  ],
  causes: [
    {
      id: 'cause-1',
      suspect: 'Cache',
      accusation: 'Cache busted',
      impact: 'Requests fail',
      findings: {},
      summaryText: 'Cache cause',
      confidence: '',
      evidence: '',
      editing: false,
      testingOpen: false
    }
  ],
  likelyCauseId: 'cause-1',
  steps: {
    items: [
      { id: '1', label: 'Assign IC', checked: true }
    ],
    drawerOpen: true
  },
  actions: {
    analysisId: 'analysis-1',
    items: [
      { id: 'action-1', summary: 'Do a thing' }
    ]
  }
});

function buildState(overrides = {}) {
  return {
    meta: { ...BASE_STATE.meta },
    pre: { ...BASE_STATE.pre },
    impact: { ...BASE_STATE.impact },
    ops: { ...BASE_STATE.ops },
    table: overrides.table ?? BASE_STATE.table.map(row => ({ ...row })),
    causes: overrides.causes ?? BASE_STATE.causes.map(cause => ({ ...cause })),
    likelyCauseId: overrides.likelyCauseId ?? BASE_STATE.likelyCauseId,
    steps: overrides.steps ?? {
      items: BASE_STATE.steps.items.map(item => ({ ...item })),
      drawerOpen: BASE_STATE.steps.drawerOpen
    },
    actions: overrides.actions ?? {
      analysisId: BASE_STATE.actions.analysisId,
      items: BASE_STATE.actions.items.map(item => ({ ...item }))
    }
  };
}

const TEMPLATE_ALPHA = {
  id: 'alpha-template',
  name: 'Alpha Template',
  description: 'Minimal state used for tests.',
  templateKind: TEMPLATE_KINDS.CASE_STUDY,
  supportedModes: [TEMPLATE_MODE_IDS.INTAKE, TEMPLATE_MODE_IDS.FULL],
  state: buildState({ actions: { analysisId: 'alpha-actions', items: [{ id: 'act-a' }] } })
};

const TEMPLATE_BETA = {
  id: 'beta-template',
  name: 'Beta Template',
  description: 'Supports every mode for projection tests.',
  templateKind: TEMPLATE_KINDS.STANDARD,
  supportedModes: Object.values(TEMPLATE_MODE_IDS),
  state: buildState({ steps: { items: [{ id: '2', label: 'Step 2', checked: false }], drawerOpen: true } })
};

beforeEach(() => {
  const manifest = [TEMPLATE_ALPHA, TEMPLATE_BETA].map(entry => ({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    templateKind: entry.templateKind,
    supportedModes: [...entry.supportedModes],
    state: JSON.parse(JSON.stringify(entry.state))
  }));
  setTemplateManifest(manifest);
});

test('listTemplates exposes manifest metadata for the drawer', () => {
  const templates = listTemplates();
  assert.deepEqual(templates, [
    {
      id: TEMPLATE_ALPHA.id,
      name: TEMPLATE_ALPHA.name,
      description: TEMPLATE_ALPHA.description,
      templateKind: TEMPLATE_ALPHA.templateKind
    },
    {
      id: TEMPLATE_BETA.id,
      name: TEMPLATE_BETA.name,
      description: TEMPLATE_BETA.description,
      templateKind: TEMPLATE_BETA.templateKind
    }
  ]);
  assert.deepEqual(getTemplateMetadata(TEMPLATE_ALPHA.id), {
    id: TEMPLATE_ALPHA.id,
    name: TEMPLATE_ALPHA.name,
    description: TEMPLATE_ALPHA.description,
    templateKind: TEMPLATE_ALPHA.templateKind
  });
  assert.strictEqual(getTemplateMetadata('missing'), null);
});

test('listTemplateModes preserves static mode metadata', () => {
  const modes = listTemplateModes();
  assert.ok(Array.isArray(modes));
  assert.ok(modes.find(mode => mode.id === TEMPLATE_MODE_IDS.INTAKE));
});

test('getTemplatePayload enforces supported modes per template', () => {
  const fullPayload = getTemplatePayload(TEMPLATE_ALPHA.id, TEMPLATE_MODE_IDS.FULL);
  assert.ok(fullPayload, 'full manifest payload should resolve');
  assert.strictEqual(
    getTemplatePayload(TEMPLATE_ALPHA.id, TEMPLATE_MODE_IDS.DC),
    null,
    'unsupported modes should return null'
  );
  assert.strictEqual(getTemplatePayload('missing', TEMPLATE_MODE_IDS.FULL), null);
});

test('mode projections follow visibility rules from the manifest', () => {
  const intakePayload = getTemplatePayload(TEMPLATE_BETA.id, TEMPLATE_MODE_IDS.INTAKE);
  assert.ok(intakePayload);
  assert.equal(intakePayload.table.length, 0, 'intake mode hides the table');
  assert.equal(intakePayload.causes.length, 0, 'intake mode hides causes');
  assert.equal(intakePayload.likelyCauseId, null, 'intake mode removes likely cause selection');
  assert.equal(intakePayload.actions.analysisId, '', 'intake mode strips actions metadata');
  assert.equal(intakePayload.steps.drawerOpen, false, 'intake mode closes the steps drawer');

  const fullPayload = getTemplatePayload(TEMPLATE_BETA.id, TEMPLATE_MODE_IDS.FULL);
  assert.ok(fullPayload.table.length > 0, 'full mode includes the table');
  assert.ok(fullPayload.causes.length > 0, 'full mode includes causes');
  assert.equal(fullPayload.likelyCauseId, TEMPLATE_BETA.state.likelyCauseId);
  assert.equal(fullPayload.actions.analysisId, TEMPLATE_BETA.state.actions.analysisId);
  assert.equal(fullPayload.steps.drawerOpen, TEMPLATE_BETA.state.steps.drawerOpen);
});
