/**
 * Real-browser coverage for Instructor coaching -> Student read-only feedback.
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

test('Instructor feedback reaches only the assigned Student and becomes stale after that field changes', async ({ page }, testInfo) => {
  const pageErrors = watchPageErrors(page);
  const suffix = testInfo.project.name === 'chromium-mobile' ? 'm' : 'd';
  const instructorCode = capability('i', suffix);
  const classCode = capability('c', suffix);
  const assignmentCode = `a${'f'.repeat(40)}${testInfo.retry}${suffix}`;
  const studentName = testInfo.project.name === 'chromium-mobile' ? 'Mobile Reviewed Student' : 'Desktop Reviewed Student';
  const expectedWorkspaceLabel = suffix === 'm' ? 'Team Beta' : 'Alex Student';
  const studentCoachingWrites = [];

  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/classes/coaching/student' && request.method() !== 'GET') {
      studentCoachingWrites.push(request.method());
    }
  });

  await startFresh(page);
  await page.getByRole('button', { name: /Teach a class/ }).click();
  await page.locator('#instructorExistingClass > summary').click();
  await page.getByLabel('Instructor access code').fill(instructorCode);
  await page.getByRole('button', { name: 'Open class' }).click();

  await expect(page.locator('#instructorObservedWorkspace')).toHaveText('Alex Student');
  if (suffix === 'm') {
    await page.locator('[data-workspace-id="22222222-2222-4222-8222-222222222222"]').click();
    await expect(page.locator('#instructorObservedWorkspace')).toHaveText('Team Beta');
  }
  await expect(page.locator('#instructorObservedWorkspace')).toHaveText(expectedWorkspaceLabel);

  const coaching = page.locator('.classroom-coaching--instructor[data-coaching-target-id="problem.one-line"]');
  await expect(coaching).toBeVisible();
  await coaching.locator('summary').click();
  await coaching.locator('textarea').fill('Make the deviation measurable before continuing.');

  const feedbackSaved = page.waitForResponse(response => (
    response.request().method() === 'PUT'
    && new URL(response.url()).pathname === '/api/classes/coaching'
    && response.ok()
  ));
  await coaching.getByRole('button', { name: 'Needs improvement' }).click();
  await feedbackSaved;

  const refreshedCoaching = page.locator('.classroom-coaching--instructor[data-coaching-target-id="problem.one-line"]');
  await expect(refreshedCoaching).toContainText('Needs improvement');
  await expect(refreshedCoaching).toContainText('Make the deviation measurable before continuing.');

  // Start a separate Student browser session while retaining only server-side coaching state.
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
  await page.getByRole('button', { name: /Join a class/ }).click();
  await page.locator('#studentDisplayName').fill(studentName);
  await page.getByLabel('Class code').fill(classCode);
  await page.getByLabel('Assignment code').fill(assignmentCode);
  await page.getByRole('button', { name: 'Join class' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-student-class-status', 'connected');
  const studentFeedback = page.locator('.classroom-coaching--student[data-coaching-target-id="problem.one-line"]');
  await expect(studentFeedback).toBeVisible();
  await expect(studentFeedback).toContainText('Instructor feedback · Needs improvement');
  await expect(studentFeedback).toContainText('Make the deviation measurable before continuing.');
  await expect(studentFeedback).not.toContainText('Changed since review');
  await expect(studentFeedback.locator('button, textarea, input, select')).toHaveCount(0);

  await page.locator('#oneLine').fill('Student revised the problem after Instructor review.');
  await expect(studentFeedback).toContainText('Changed since review');
  expect(studentCoachingWrites).toEqual([]);

  await expectNoBlockingA11yViolations(page);
  expect(pageErrors).toEqual([]);
});
