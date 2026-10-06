/**
 * Real-browser coverage for Student Classroom admission and same-device resume.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const STUDENT_SESSION_STORAGE_KEY = 'kt-classroom-student-session-v1';

function capability(fill, suffix) {
  return fill.repeat(42) + suffix;
}

function workspaceTokenForAssignment(assignmentToken) {
  return `w${assignmentToken.slice(1)}`;
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

test('Student joins an assigned workspace, discards admission codes, and resumes shared work after reload', async ({ page }, testInfo) => {
  const pageErrors = watchPageErrors(page);
  const suffix = testInfo.project.name === 'chromium-mobile' ? 'm' : 'd';
  const classCode = capability('c', suffix);
  const assignmentCode = capability('a', suffix);
  const expectedWorkspaceToken = workspaceTokenForAssignment(assignmentCode);
  const displayName = testInfo.project.name === 'chromium-mobile' ? 'Mobile Student' : 'Desktop Student';

  await startFresh(page);
  await page.getByRole('button', { name: /Join a class/ }).click();

  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'student');
  await expect(page.locator('#studentClassEntryShell')).toBeVisible();

  await page.locator('#studentDisplayName').fill(displayName);
  await page.getByLabel('Class code').fill(classCode);
  await page.getByLabel('Assignment code').fill(assignmentCode);
  await page.getByRole('button', { name: 'Join class' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-student-class-status', 'connected');
  await expect(page.locator('#studentExperienceNotice')).toBeVisible();
  await expect(page.locator('#studentClassContextTitle')).toHaveText('Browser Test Classroom');
  await expect(page.locator('#studentClassWorkspace')).toHaveText('Browser Test Workspace');
  await expect(page.locator('#studentClassIdentity')).toHaveText(displayName);
  await expect(page.locator('#studentClassCode')).toHaveValue('');
  await expect(page.locator('#studentAssignmentCode')).toHaveValue('');

  const storedSession = await page.evaluate(key => window.localStorage.getItem(key), STUDENT_SESSION_STORAGE_KEY);
  expect(storedSession).toBeTruthy();
  expect(storedSession).toContain(expectedWorkspaceToken);
  expect(storedSession).not.toContain(classCode);
  expect(storedSession).not.toContain(assignmentCode);

  const sharedProblem = `${displayName} updated the shared browser-test Intake.`;
  const saveResponse = page.waitForResponse(response => (
    response.request().method() === 'PUT'
    && new URL(response.url()).pathname === '/api/workspaces/session'
    && response.ok()
  ));
  await page.locator('#oneLine').fill(sharedProblem);
  await page.locator('#oneLine').blur();
  await saveResponse;

  await page.reload();

  await expect(page.locator('#experienceRoleGate')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'student');
  await expect(page.locator('body')).toHaveAttribute('data-student-class-status', 'connected');
  await expect(page.locator('#studentExperienceNotice')).toBeVisible();
  await expect(page.locator('#studentClassIdentity')).toHaveText(displayName);
  await expect(page.locator('#oneLine')).toHaveValue(sharedProblem);

  await expectNoBlockingA11yViolations(page);
  expect(pageErrors).toEqual([]);
});
