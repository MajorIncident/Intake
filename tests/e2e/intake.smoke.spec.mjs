/**
 * Browser smoke coverage for the real Intake entry surface.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Clear browser-local Intake state before the app bootstraps.
 *
 * @param {import('@playwright/test').Page} page Playwright page.
 * @returns {Promise<void>} Resolves after the init script is registered.
 */
async function startFresh(page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

test('fresh Intake boots into the required role chooser without browser errors', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await startFresh(page);

  await page.goto('/');

  const dialog = page.getByRole('dialog', { name: 'How are you using Intake?' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: /Work independently/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Join a class/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Teach a class/ })).toBeVisible();
  await expect(page.locator('#experienceRoleCancelBtn')).toBeHidden();
  await expect(page.locator('[data-experience-role-choice="standalone"]')).toBeFocused();

  const accessibility = await new AxeBuilder({ page }).analyze();
  const blockingViolations = accessibility.violations.filter(
    violation => violation.impact === 'serious' || violation.impact === 'critical'
  );

  expect(blockingViolations, JSON.stringify(blockingViolations, null, 2)).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('browser fixture does not expose authored template JSON or server source', async ({ request }) => {
  const protectedCase = await request.get('/templates/Microcomputer%20Cabinets.json');
  const publicAuthoringSource = await request.get('/templates/checkout-latency.json');
  const rawApiSource = await request.get('/api/protected-case-studies.manifest.js');

  expect(protectedCase.status()).toBe(404);
  expect(publicAuthoringSource.status()).toBe(404);
  expect(rawApiSource.status()).toBe(404);
});
