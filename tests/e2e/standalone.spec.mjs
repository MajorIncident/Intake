/**
 * Real-browser coverage for the local-first Standalone experience.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const INTAKE_STORAGE_KEY = 'kt-intake-full-v2';

async function startFresh(page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

function watchPageErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

async function enterStandalone(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Work independently/ }).click();
  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'standalone');
  await expect(page.locator('.wrap')).toBeVisible();
}

async function expectNoBlockingA11yViolations(page) {
  const accessibility = await new AxeBuilder({ page }).analyze();
  const blockingViolations = accessibility.violations.filter(
    violation => violation.impact === 'serious' || violation.impact === 'critical'
  );
  expect(blockingViolations, JSON.stringify(blockingViolations, null, 2)).toEqual([]);
}

test('Standalone input generates a summary and survives a real browser reload', async ({ page }) => {
  const pageErrors = watchPageErrors(page);
  await startFresh(page);
  await enterStandalone(page);

  const problem = 'Checkout latency increased after the CDN routing change.';
  await page.locator('#oneLine').fill(problem);
  await page.locator('#oneLine').blur();

  await expect.poll(async () => page.evaluate(key => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw)?.pre?.oneLine || '' : '';
  }, INTAKE_STORAGE_KEY)).toBe(problem);

  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: /Generate Summary/ }).click();

  await expect(page.locator('#summaryCard')).toBeVisible();
  await expect(page.locator('#summaryPre')).toContainText(problem);

  await page.reload();

  await expect(page.locator('#experienceRoleGate')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'standalone');
  await expect(page.locator('#oneLine')).toHaveValue(problem);
  expect(pageErrors).toEqual([]);
});

test('Standalone resource drawer exposes public Templates only and remains accessible', async ({ page }) => {
  const pageErrors = watchPageErrors(page);
  await startFresh(page);
  await enterStandalone(page);

  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: /^Templates/ }).click();

  const drawer = page.getByRole('dialog', { name: 'Templates Library' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('group', { name: 'Templates' })).toBeVisible();
  await expect(drawer.getByText('Checkout Latency Spike', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('group', { name: 'Case Studies' })).toHaveCount(0);
  await expect(page.locator('#templatesAuthSection')).toBeHidden();

  await expectNoBlockingA11yViolations(page);
  expect(pageErrors).toEqual([]);
});
