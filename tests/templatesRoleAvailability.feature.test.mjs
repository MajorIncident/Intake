/**
 * Feature coverage for role-projected Templates and Case Studies in the production drawer.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  applyExperienceRole,
  initExperienceRoleController,
  persistExperienceRolePreference
} from '../src/experienceRoleController.js';
import { EXPERIENCE_ROLE_IDS } from '../src/experienceRoles.js';
import { initTemplatesDrawer } from '../src/templatesDrawer.js';
import { getTemplatePayload, TEMPLATE_MODE_IDS } from '../src/templates.js';
import { installJsdomGlobals, restoreJsdomGlobals } from './helpers/jsdom-globals.js';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
const globals = installJsdomGlobals(dom.window);
globalThis.__toastMocks = { showToast: () => {} };
let lastAppliedState = null;
globalThis.__appStateMocks = {
  collectAppState: () => ({}),
  applyAppState: state => { lastAppliedState = state; },
  getSummaryState: () => ({}),
  resetAnalysisId: () => {},
  getAnalysisId: () => '',
  getLikelyCauseId: () => null
};

dom.window.requestAnimationFrame = callback => callback();
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);

persistExperienceRolePreference(EXPERIENCE_ROLE_IDS.STANDALONE, dom.window.localStorage);
initExperienceRoleController({
  documentRef: dom.window.document,
  windowRef: dom.window,
  storage: dom.window.localStorage,
  location: dom.window.location
});
const protectedProvider = {
  getCatalog: () => [{
    id: 'authorized-case',
    name: 'Authorized Case',
    description: 'Loaded only after classroom authorization.',
    templateKind: 'case-study',
    supportedModes: ['intake', 'is-is-not', 'dc', 'full']
  }],
  getPayload: async caseStudyId => {
    if (caseStudyId !== 'authorized-case') return null;
    const state = getTemplatePayload('checkout-latency', TEMPLATE_MODE_IDS.FULL);
    state.pre.oneLine = 'Protected Case Study applied';
    return {
      id: 'authorized-case',
      name: 'Authorized Case',
      description: 'Loaded only after classroom authorization.',
      templateKind: 'case-study',
      supportedModes: ['intake', 'is-is-not', 'dc', 'full'],
      state
    };
  }
};
initTemplatesDrawer({ protectedCaseStudies: protectedProvider });

after(() => {
  delete globalThis.__toastMocks;
  delete globalThis.__appStateMocks;
  restoreJsdomGlobals(globals);
  dom.window.close();
});

function resourceKinds() {
  return [...dom.window.document.querySelectorAll('#templatesList [data-template-kind]')]
    .map(element => element.dataset.templateKind);
}

test('drawer projects normal resources across Standalone, Student, and Instructor', () => {
  assert.ok(resourceKinds().includes('standard'));
  assert.equal(resourceKinds().includes('case-study'), false, 'Standalone must not render Case Studies');

  applyExperienceRole(EXPERIENCE_ROLE_IDS.STUDENT);
  assert.ok(resourceKinds().includes('standard'));
  assert.ok(resourceKinds().includes('case-study'));
  assert.equal(dom.window.document.getElementById('templatesDrawerTitle').textContent, 'Learning Resources');
  assert.equal(
    dom.window.document.querySelector('[data-template-resource-launcher-label]').textContent,
    'Templates & Case Studies'
  );

  const caseButton = dom.window.document.querySelector('#templatesList [data-template-kind="case-study"]');
  assert.ok(caseButton);
  caseButton.click();
  assert.equal(dom.window.document.getElementById('templatesAuthSection').hidden, false);
  assert.equal(dom.window.document.getElementById('templatesModeSection').hidden, false);
  assert.equal(dom.window.document.getElementById('templatesDrawerFooter').hidden, false);

  applyExperienceRole(EXPERIENCE_ROLE_IDS.INSTRUCTOR);
  assert.deepEqual([...new Set(resourceKinds())], ['case-study']);
  assert.equal(dom.window.document.getElementById('templatesDrawerTitle').textContent, 'Teaching Case Studies');
  assert.equal(dom.window.document.getElementById('templatesTeachingNotice').hidden, false);
  assert.equal(dom.window.document.getElementById('templatesModeSection').hidden, true);
  assert.equal(dom.window.document.getElementById('templatesAuthSection').hidden, true);
  assert.equal(dom.window.document.getElementById('templatesDrawerFooter').hidden, true);
  assert.equal(dom.window.document.getElementById('templatesSaveBtn').hidden, true);
  assert.equal(dom.window.document.getElementById('instructorTeachingResourcesBtn').getAttribute('aria-controls'), 'templatesDrawer');

  applyExperienceRole(EXPERIENCE_ROLE_IDS.STANDALONE);
  assert.ok(resourceKinds().includes('standard'));
  assert.equal(resourceKinds().includes('case-study'), false);
  assert.equal(dom.window.document.getElementById('templatesDrawerTitle').textContent, 'Templates');
});


test('authorized Case Study payload is fetched only when Student applies it', async () => {
  applyExperienceRole(EXPERIENCE_ROLE_IDS.STUDENT);
  const caseButton = dom.window.document.querySelector('#templatesList [data-template-id="authorized-case"]');
  assert.ok(caseButton);
  caseButton.click();

  const password = dom.window.document.getElementById('templatesPassword');
  const minutes = String(new Date().getMinutes()).padStart(2, '0');
  password.value = `full${minutes}`;
  dom.window.document.getElementById('templatesApplyBtn').click();

  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(lastAppliedState?.pre?.oneLine, 'Protected Case Study applied');
});
