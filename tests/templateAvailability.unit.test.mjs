import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXPERIENCE_ROLE_IDS } from '../src/experienceRoles.js';
import { TEMPLATE_KINDS } from '../src/templateKinds.js';
import {
  canApplyTemplateForExperience,
  filterTemplatesForExperience,
  getTemplateResourcePolicy,
  isTemplateKindAvailableForExperience
} from '../src/templateAvailability.js';

const RESOURCES = [
  { id: 'standard', templateKind: TEMPLATE_KINDS.STANDARD },
  { id: 'case', templateKind: TEMPLATE_KINDS.CASE_STUDY }
];

test('Standalone exposes only reusable Templates through normal UI', () => {
  assert.equal(isTemplateKindAvailableForExperience(EXPERIENCE_ROLE_IDS.STANDALONE, TEMPLATE_KINDS.STANDARD), true);
  assert.equal(isTemplateKindAvailableForExperience(EXPERIENCE_ROLE_IDS.STANDALONE, TEMPLATE_KINDS.CASE_STUDY), false);
  assert.deepEqual(filterTemplatesForExperience(EXPERIENCE_ROLE_IDS.STANDALONE, RESOURCES).map(item => item.id), ['standard']);
  assert.equal(canApplyTemplateForExperience(EXPERIENCE_ROLE_IDS.STANDALONE, TEMPLATE_KINDS.STANDARD), true);
});

test('Student exposes Templates and Case Studies with apply behavior intact', () => {
  assert.deepEqual(
    filterTemplatesForExperience(EXPERIENCE_ROLE_IDS.STUDENT, RESOURCES).map(item => item.id),
    ['standard', 'case']
  );
  assert.equal(canApplyTemplateForExperience(EXPERIENCE_ROLE_IDS.STUDENT, TEMPLATE_KINDS.STANDARD), true);
  assert.equal(canApplyTemplateForExperience(EXPERIENCE_ROLE_IDS.STUDENT, TEMPLATE_KINDS.CASE_STUDY), true);
});

test('Instructor exposes Case Studies as teaching-only resources', () => {
  const policy = getTemplateResourcePolicy(EXPERIENCE_ROLE_IDS.INSTRUCTOR);
  assert.deepEqual(filterTemplatesForExperience(EXPERIENCE_ROLE_IDS.INSTRUCTOR, RESOURCES).map(item => item.id), ['case']);
  assert.equal(policy.teachingOnly, true);
  assert.equal(policy.canApply, false);
  assert.equal(canApplyTemplateForExperience(EXPERIENCE_ROLE_IDS.INSTRUCTOR, TEMPLATE_KINDS.CASE_STUDY), false);
});

test('missing role defaults to least-privileged Standalone resource visibility', () => {
  assert.equal(getTemplateResourcePolicy(null).role, EXPERIENCE_ROLE_IDS.STANDALONE);
  assert.deepEqual(filterTemplatesForExperience(null, RESOURCES).map(item => item.id), ['standard']);
});
