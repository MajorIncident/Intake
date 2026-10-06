/**
 * Real-browser coverage for protected Classroom Case Study authorization and loading.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

function capability(fill, suffix) {
  return fill.repeat(42) + suffix;
}

function watchPageErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

async function startFresh(page) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
}

async function expectNoBlockingA11yViolations(page) {
  const accessibility = await new AxeBuilder({ page }).analyze();
  const blockingViolations = accessibility.violations.filter(
    violation => violation.impact === 'serious' || violation.impact === 'critical'
  );
  expect(blockingViolations, JSON.stringify(blockingViolations, null, 2)).toEqual([]);
}

test('protected Case Studies reject unauthenticated retrieval and an authorized Student can apply one', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Desktop resource-menu journey; mobile Student navigation is covered separately.');
  const pageErrors = watchPageErrors(page);

  const unauthorizedCatalog = await page.request.get('/api/classes/case-studies/student');
  expect(unauthorizedCatalog.status()).toBe(404);

  const unauthorizedPayload = await page.request.post('/api/classes/case-studies/student', {
    data: { caseStudyId: 'microcomputer-cabinets' }
  });
  expect(unauthorizedPayload.status()).toBe(404);

  await startFresh(page);

  const classCode = capability('c', 'p');
  const assignmentCode = capability('a', 'p');

  await page.getByRole('button', { name: /Join a class/ }).click();
  await page.locator('#studentDisplayName').fill('Protected Case Student');
  await page.getByLabel('Class code').fill(classCode);
  await page.getByLabel('Assignment code').fill(assignmentCode);

  const catalogResponsePromise = page.waitForResponse(response => (
    response.request().method() === 'GET'
    && new URL(response.url()).pathname === '/api/classes/case-studies/student'
    && response.ok()
  ));
  await page.getByRole('button', { name: 'Join class' }).click();
  const catalogResponse = await catalogResponsePromise;
  const catalogBody = await catalogResponse.json();

  expect(catalogBody.caseStudies.length).toBeGreaterThan(0);
  expect(catalogBody.caseStudies.some(record => record.id === 'microcomputer-cabinets')).toBe(true);
  expect(catalogBody.caseStudies.every(record => !Object.hasOwn(record, 'state'))).toBe(true);

  await expect(page.locator('body')).toHaveAttribute('data-student-class-status', 'connected');

  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: /Templates & Case Studies/ }).click();

  const drawer = page.locator('#templatesDrawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('#templatesDrawerTitle')).toHaveText('Learning Resources');
  await expect(drawer.getByRole('group', { name: 'Case Studies' })).toBeVisible();

  const caseStudy = drawer.locator('[data-template-id="microcomputer-cabinets"]');
  await expect(caseStudy).toBeVisible();
  await caseStudy.click();

  const minutes = String(new Date().getMinutes()).padStart(2, '0');
  await page.locator('#templatesPassword').fill(`full${minutes}`);

  const payloadResponsePromise = page.waitForResponse(response => (
    response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/classes/case-studies/student'
    && response.ok()
  ));
  await page.locator('#templatesApplyBtn').click();
  const payloadResponse = await payloadResponsePromise;
  const payloadBody = await payloadResponse.json();

  expect(payloadBody.caseStudy.id).toBe('microcomputer-cabinets');
  expect(payloadBody.caseStudy.state?.pre?.oneLine).toBe('Cabinets are being rejected');
  const closedDrawer = page.locator('#templatesDrawer');
  await expect(closedDrawer).toHaveAttribute('aria-hidden', 'true');
  await expect(closedDrawer).toHaveAttribute('inert', '');
  await expect(page.locator('#oneLine')).toHaveValue('Cabinets are being rejected');

  await expectNoBlockingA11yViolations(page);
  expect(pageErrors).toEqual([]);
});
