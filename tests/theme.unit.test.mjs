/**
 * Theme preference utilities.
 *
 * Verifies that the appearance helpers apply, persist, and announce the
 * selected theme so UI controls stay in sync across reloads.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { applyThemePreference, getThemePreference, initThemeFromStorage } from '../src/theme.js';

let dom;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/'
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = window.localStorage;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.matchMedia = typeof window.matchMedia === 'function'
    ? window.matchMedia.bind(window)
    : () => ({ matches: false, addListener() {}, removeListener() {} });
});

afterEach(() => {
  if (dom) {
    dom.window.close();
  }
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.localStorage;
  delete globalThis.CustomEvent;
  delete globalThis.matchMedia;
});

test('applyThemePreference persists and announces the active theme', () => {
  const announcements = [];
  window.addEventListener('intake:theme-changed', event => announcements.push(event?.detail?.theme));

  const applied = applyThemePreference('dark');

  assert.equal(applied, 'dark');
  assert.equal(document.body.dataset.theme, 'dark');
  assert.ok(document.body.classList.contains('theme-dark'));
  assert.equal(localStorage.getItem('kt-intake-theme'), 'dark');
  assert.deepEqual(announcements.slice(-1), ['dark']);
});

test('initThemeFromStorage restores the saved preference', () => {
  applyThemePreference('light');
  localStorage.setItem('kt-intake-theme', 'dark');

  const initialized = initThemeFromStorage();

  assert.equal(initialized, 'dark');
  assert.equal(getThemePreference(), 'dark');
  assert.equal(document.body.dataset.theme, 'dark');
});
