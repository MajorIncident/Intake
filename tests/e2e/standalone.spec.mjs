/**
 * Real-browser coverage for the local-first Standalone experience.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const INTAKE_STORAGE_KEY = 'kt-intake-full-v2';

async function startFresh(page) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
}

function watchPageErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

async function enterStandalone(page) {
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

test('Standalone input generates a summary and survives a real browser reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Desktop Actions menu journey; mobile has a separate primary-input smoke.');
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

  await expect(page.locator('#experienceRoleGate')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'unselected');
  await expect(page.locator('[data-startup-resume="intake"]')).toContainText('Continue your saved Intake');
  await page.locator('[data-startup-resume="intake"]').click();

  await expect(page.locator('#experienceRoleGate')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'standalone');
  await expect(page.locator('#oneLine')).toHaveValue(problem);
  expect(pageErrors).toEqual([]);
});

test('Standalone resource drawer exposes public Templates only and remains accessible', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Desktop resource-menu journey; mobile navigation is covered separately.');
  const pageErrors = watchPageErrors(page);
  await startFresh(page);
  await enterStandalone(page);

  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: /^Templates/ }).click();

  const drawer = page.locator('#templatesDrawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('#templatesDrawerTitle')).toHaveText('Templates');
  await expect(drawer.getByRole('group', { name: 'Templates' })).toBeVisible();
  await expect(drawer.getByText('Checkout Latency Spike', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('group', { name: 'Case Studies' })).toHaveCount(0);
  await expect(page.locator('#templatesAuthSection')).toBeHidden();

  await expectNoBlockingA11yViolations(page);
  expect(pageErrors).toEqual([]);
});


test('Standalone file export/import round trip restores Intake data and workflow mode', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Desktop File menu journey; mobile primary interaction is covered separately.');
  const pageErrors = watchPageErrors(page);
  await startFresh(page);
  await enterStandalone(page);

  const exportedProblem = 'Payment authorization latency increased after a routing change.';
  await page.locator('#oneLine').fill(exportedProblem);
  await page.locator('#oneLine').blur();

  await page.locator('#intakeModeSelect').selectOption('majorIncident');
  await expect(page.locator('body')).toHaveAttribute('data-intake-mode', 'majorIncident');
  await expect(page.locator('#commsBtn')).not.toHaveAttribute('hidden', '');
  await expect(page.locator('#commsBtn')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#stepsBtn')).not.toHaveAttribute('hidden', '');
  await expect(page.locator('#stepsBtn')).toHaveAttribute('aria-hidden', 'false');

  await page.getByRole('button', { name: 'File' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Save to File' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^kt-intake-.*\.json$/);
  const exportedPath = await download.path();
  expect(exportedPath).toBeTruthy();

  await page.locator('#oneLine').fill('This mutation should disappear after import.');
  await page.locator('#oneLine').blur();
  await page.locator('#intakeModeSelect').selectOption('general');
  await expect(page.locator('body')).toHaveAttribute('data-intake-mode', 'general');
  await expect(page.locator('#commsBtn')).toHaveAttribute('hidden', '');
  await expect(page.locator('#commsBtn')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#stepsBtn')).toHaveAttribute('hidden', '');
  await expect(page.locator('#stepsBtn')).toHaveAttribute('aria-hidden', 'true');

  await page.getByRole('button', { name: 'File' }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Load from File' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(exportedPath);

  await expect(page.locator('#oneLine')).toHaveValue(exportedProblem);
  await expect(page.locator('#intakeModeSelect')).toHaveValue('majorIncident');
  await expect(page.locator('body')).toHaveAttribute('data-intake-mode', 'majorIncident');
  await expect(page.locator('#commsBtn')).not.toHaveAttribute('hidden', '');
  await expect(page.locator('#commsBtn')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#stepsBtn')).not.toHaveAttribute('hidden', '');
  await expect(page.locator('#stepsBtn')).toHaveAttribute('aria-hidden', 'false');

  expect(pageErrors).toEqual([]);
});

test('mobile Standalone accepts primary Intake input and persists it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile-only primary interaction smoke.');
  const pageErrors = watchPageErrors(page);
  await startFresh(page);
  await enterStandalone(page);

  const problem = 'Mobile checkout latency regression.';
  await page.locator('#oneLine').fill(problem);
  await page.locator('#oneLine').blur();

  await expect(page.locator('#oneLine')).toHaveValue(problem);
  await expect.poll(async () => page.evaluate(key => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw)?.pre?.oneLine || '' : '';
  }, INTAKE_STORAGE_KEY)).toBe(problem);

  const notesWorkspace = page.locator('#notesWorkspace');
  const notesToggle = page.getByRole('button', { name: 'Open notes' });
  await expect(notesWorkspace).toHaveClass(/is-collapsed/);
  await expect(notesToggle).toBeVisible();
  expect(await page.evaluate(() => window.matchMedia('(max-width: 700px)').matches)).toBe(true);
  const beforeNotesToggle = await page.evaluate(key => window.localStorage.getItem(key), INTAKE_STORAGE_KEY);

  // Pointer capture keeps activation targeted even if the fixed dock follows
  // a mobile visual-viewport shift between pointer down/up.
  await notesToggle.click();
  await expect(notesToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(notesWorkspace).not.toHaveClass(/is-collapsed/);
  await page.getByRole('button', { name: 'Collapse notes' }).tap();
  await expect(notesWorkspace).toHaveClass(/is-collapsed/);

  const afterNotesToggle = await page.evaluate(key => window.localStorage.getItem(key), INTAKE_STORAGE_KEY);
  expect(afterNotesToggle).toBe(beforeNotesToggle);

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  await expectNoBlockingA11yViolations(page);

  await page.reload();

  await expect(page.locator('#experienceRoleGate')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'unselected');
  await expect(page.locator('[data-startup-resume="intake"]')).toContainText('Continue your saved Intake');
  await page.locator('[data-startup-resume="intake"]').click();

  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'standalone');
  await expect(page.locator('#oneLine')).toHaveValue(problem);
  await expect(page.locator('#notesWorkspace')).toHaveClass(/is-collapsed/);
  expect(pageErrors).toEqual([]);
});
