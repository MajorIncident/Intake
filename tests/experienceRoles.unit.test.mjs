/**
 * Unit coverage for canonical experience-role configuration.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EXPERIENCE_ROLE_IDS,
  EXPERIENCE_ROLE_SURFACES,
  getExperienceRoleDefinition,
  isExperienceSurfaceVisible,
  normalizeExperienceRole
} from '../src/experienceRoles.js';

test('experience roles normalize independently from Intake workflow modes', () => {
  assert.equal(normalizeExperienceRole('STUDENT'), EXPERIENCE_ROLE_IDS.STUDENT);
  assert.equal(normalizeExperienceRole(' instructor '), EXPERIENCE_ROLE_IDS.INSTRUCTOR);
  assert.equal(normalizeExperienceRole('majorIncident'), null);
  assert.equal(normalizeExperienceRole('case-study'), null);
});

test('experience role metadata exposes stable human labels', () => {
  assert.equal(getExperienceRoleDefinition(EXPERIENCE_ROLE_IDS.STANDALONE)?.label, 'Standalone');
  assert.equal(getExperienceRoleDefinition(EXPERIENCE_ROLE_IDS.STUDENT)?.actionLabel, 'Join a class');
  assert.equal(getExperienceRoleDefinition(EXPERIENCE_ROLE_IDS.INSTRUCTOR)?.actionLabel, 'Run a class');
});

test('role surface policy keeps Standalone and Student in Intake while Instructor uses its shell', () => {
  assert.equal(isExperienceSurfaceVisible(EXPERIENCE_ROLE_IDS.STANDALONE, 'intake'), true);
  assert.equal(isExperienceSurfaceVisible(EXPERIENCE_ROLE_IDS.STANDALONE, 'student-entry'), false);
  assert.equal(isExperienceSurfaceVisible(EXPERIENCE_ROLE_IDS.STANDALONE, 'student-notice'), false);

  assert.equal(isExperienceSurfaceVisible(EXPERIENCE_ROLE_IDS.STUDENT, 'intake'), true);
  assert.equal(isExperienceSurfaceVisible(EXPERIENCE_ROLE_IDS.STUDENT, 'student-entry'), true);
  assert.equal(isExperienceSurfaceVisible(EXPERIENCE_ROLE_IDS.STUDENT, 'student-notice'), true);

  assert.equal(isExperienceSurfaceVisible(EXPERIENCE_ROLE_IDS.INSTRUCTOR, 'intake'), false);
  assert.equal(isExperienceSurfaceVisible(EXPERIENCE_ROLE_IDS.INSTRUCTOR, 'intake-control'), false);
  assert.equal(isExperienceSurfaceVisible(EXPERIENCE_ROLE_IDS.INSTRUCTOR, 'student-entry'), false);
  assert.equal(isExperienceSurfaceVisible(EXPERIENCE_ROLE_IDS.INSTRUCTOR, 'instructor-shell'), true);

  assert.deepEqual(Object.keys(EXPERIENCE_ROLE_SURFACES).sort(), [
    EXPERIENCE_ROLE_IDS.INSTRUCTOR,
    EXPERIENCE_ROLE_IDS.STANDALONE,
    EXPERIENCE_ROLE_IDS.STUDENT
  ].sort());
});
