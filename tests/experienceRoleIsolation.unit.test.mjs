/**
 * Regression coverage proving experience-role preference stays outside Intake persistence.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  EXPERIENCE_ROLE_STORAGE_KEY,
  persistExperienceRolePreference
} from '../src/experienceRoleController.js';
import { EXPERIENCE_ROLE_IDS } from '../src/experienceRoles.js';
import {
  STORAGE_KEY,
  clearAllIntakeStorage,
  migrateAppState,
  saveToStorage
} from '../src/storage.js';

let dom = null;
let previousLocalStorage = null;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://intake.test/' });
  previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = dom.window.localStorage;
});

afterEach(() => {
  if (previousLocalStorage === undefined) {
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = previousLocalStorage;
  }
  previousLocalStorage = null;
  dom?.window.close();
  dom = null;
});

test('normalizing imported Intake state strips accidental experience-role fields', () => {
  const normalized = migrateAppState({
    meta: {
      version: 2,
      savedAt: null,
      intakeMode: 'general',
      experienceRole: EXPERIENCE_ROLE_IDS.INSTRUCTOR
    },
    experienceRole: EXPERIENCE_ROLE_IDS.STUDENT
  });

  assert.ok(normalized);
  assert.equal(Object.hasOwn(normalized, 'experienceRole'), false);
  assert.equal(Object.hasOwn(normalized.meta, 'experienceRole'), false);
});

test('experience role uses its own storage key and survives Start Fresh Intake clearing', () => {
  persistExperienceRolePreference(EXPERIENCE_ROLE_IDS.STUDENT, dom.window.localStorage);

  const normalized = migrateAppState({
    meta: { version: 2, savedAt: null, intakeMode: 'general' }
  });
  saveToStorage(normalized);

  const intakePayload = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY));
  assert.equal(Object.hasOwn(intakePayload, 'experienceRole'), false);
  assert.equal(Object.hasOwn(intakePayload.meta, 'experienceRole'), false);
  assert.equal(JSON.parse(dom.window.localStorage.getItem(EXPERIENCE_ROLE_STORAGE_KEY)).role, EXPERIENCE_ROLE_IDS.STUDENT);

  clearAllIntakeStorage();

  assert.equal(dom.window.localStorage.getItem(STORAGE_KEY), null);
  assert.equal(JSON.parse(dom.window.localStorage.getItem(EXPERIENCE_ROLE_STORAGE_KEY)).role, EXPERIENCE_ROLE_IDS.STUDENT);
});
