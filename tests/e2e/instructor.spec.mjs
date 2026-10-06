/**
 * Real-browser coverage for Instructor class resume and read-only observation.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const INSTRUCTOR_SESSION_STORAGE_KEY = 'kt-classroom-instructor-session-v1';
const FIRST_WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

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

test('Instructor opens a class, observes work read-only, switches workspaces, and resumes after reload', async ({ page }, testInfo) => {
  const pageErrors = watchPageErrors(page);
  const suffix = testInfo.project.name === 'chromium-mobile' ? 'm' : 'd';
  const instructorCode = capability('i', suffix);
  const classroomRequests = [];

  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) {
      classroomRequests.push({ method: request.method(), pathname: url.pathname });
    }
  });

  await startFresh(page);
  await page.getByRole('button', { name: /Teach a class/ }).click();

  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'instructor');
  await expect(page.locator('#instructorClassEntryCard')).toBeVisible();

  await page.getByLabel('Instructor access code').fill(instructorCode);
  await page.getByRole('button', { name: 'Open class' }).click();

  await expect(page.locator('#instructorClassDashboard')).toBeVisible();
  await expect(page.locator('#instructorClassTitle')).toHaveText('Browser Test Classroom');
  await expect(page.locator('#instructorRosterSummary')).toHaveText('2 workspaces');
  await expect(page.locator('#instructorObservedWorkspace')).toHaveText('Alex Student');
  await expect(page.locator('#instructorObserverStatus')).toHaveText('Live read-only view');
  await expect(page.locator('#oneLine')).toHaveValue('Alex Student observed browser-test Intake.');
  await expect(page.locator('#oneLine')).toHaveAttribute('aria-readonly', 'true');
  await expect(page.locator('#oneLine')).toHaveJSProperty('readOnly', true);
  await expect(page.locator('#action-add')).toBeDisabled();

  const storedSession = await page.evaluate(key => window.localStorage.getItem(key), INSTRUCTOR_SESSION_STORAGE_KEY);
  expect(storedSession).toBeTruthy();
  expect(storedSession).toContain(instructorCode);
  expect(storedSession).toContain(FIRST_WORKSPACE_ID);
  expect(storedSession).not.toContain('workspaceToken');

  await page.locator(`[data-workspace-id="${SECOND_WORKSPACE_ID}"]`).click();
  await expect(page.locator('#instructorObservedWorkspace')).toHaveText('Team Beta');
  await expect(page.locator('#oneLine')).toHaveValue('Team Beta observed browser-test Intake.');
  await expect(page.locator('#oneLine')).toHaveJSProperty('readOnly', true);

  const switchedSession = await page.evaluate(key => window.localStorage.getItem(key), INSTRUCTOR_SESSION_STORAGE_KEY);
  expect(switchedSession).toContain(SECOND_WORKSPACE_ID);

  await page.reload();

  await expect(page.locator('#experienceRoleGate')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'instructor');
  await expect(page.locator('#instructorClassDashboard')).toBeVisible();
  await expect(page.locator('#instructorObservedWorkspace')).toHaveText('Team Beta');
  await expect(page.locator('#oneLine')).toHaveValue('Team Beta observed browser-test Intake.');
  await expect(page.locator('#oneLine')).toHaveJSProperty('readOnly', true);
  await expect(page.locator('#action-add')).toBeDisabled();

  expect(classroomRequests.some(request => (
    ['/api/classes/workspaces', '/api/classes/observe'].includes(request.pathname)
    && request.method === 'GET'
  ))).toBe(true);
  expect(classroomRequests.filter(request => (
    request.pathname === '/api/workspaces/session'
    || request.pathname === '/api/workspaces/presence'
    || request.pathname === '/api/classes/join'
  ))).toEqual([]);

  await expectNoBlockingA11yViolations(page);
  expect(pageErrors).toEqual([]);
});
