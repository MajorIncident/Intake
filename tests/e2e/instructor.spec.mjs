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

test('Instructor starts a live class, creates a team, assigns a waiting Student, and resumes it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Desktop live-management journey; responsive Instructor observer remains covered on mobile.');
  const pageErrors = watchPageErrors(page);
  const classroomRequests = [];

  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/classes')) {
      classroomRequests.push({
        method: request.method(),
        pathname: url.pathname,
        body: request.postData() || ''
      });
    }
  });

  await startFresh(page);
  await page.getByRole('button', { name: /Teach a class/ }).click();

  await expect(page.locator('#instructorClassEntryCard')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Run a class' })).toBeVisible();

  await page.getByLabel('Class title').fill('Browser Live PSDM');
  await page.getByRole('button', { name: 'Start class' }).click();

  await expect(page.locator('#instructorClassDashboard')).toBeVisible();
  await expect(page.locator('#instructorClassTitle')).toHaveText('Browser Live PSDM');
  await expect(page.locator('#instructorJoinCode')).toHaveText('K7FM-P4Q2');
  await expect(page.locator('#instructorParticipantSummary')).toHaveText('1 student · 1 waiting');
  await expect(page.locator('[data-participant-id="99999999-9999-4999-8999-999999999999"]')).toContainText('Waiting Student');
  await expect(page.getByLabel('Assignment for Waiting Student')).toHaveValue('');

  await expect(page.locator('#instructorExerciseConsole')).toBeVisible();
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('1 staged Case Study available');
  await page.getByLabel('Staged Case Study').selectOption('browser-staged-simulation');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('Draft · draft created');
  await expect(page.locator('#instructorExerciseCaseName')).toHaveText('Browser Staged Simulation');
  await expect(page.locator('#instructorExerciseCreateBtn')).toBeDisabled();
  await expect(page.locator('#instructorExerciseStartBtn')).toBeVisible();

  await page.getByRole('button', { name: 'Start exercise' }).click();
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('In progress · exercise started');
  await expect(page.locator('#instructorExerciseStageTitle')).toHaveText('Clarify the browser case');
  await expect(page.locator('#instructorExerciseStageObjective')).toHaveText('Capture the initial situation in Intake.');
  await expect(page.locator('#instructorExerciseStageTiming')).toHaveText('Suggested time: 5 min');
  await expect(page.locator('#instructorExerciseFacilitation')).toContainText('Browser facilitation note');
  await expect(page.locator('#instructorExerciseFacilitation')).toContainText('Synthetic Instructor-only browser facilitation.');
  await expect(page.locator('#instructorExerciseReleasePanel')).toContainText('Optional browser evidence');
  await expect(page.locator('#instructorExercisePauseBtn')).toBeVisible();

  await page.getByRole('button', { name: 'Release Optional browser evidence to Students' }).click();
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('In progress · content released');
  await expect(page.locator('#instructorExerciseReleaseList')).toContainText('Released');

  await page.getByRole('button', { name: 'Pause exercise' }).click();
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('Paused · exercise paused');
  await expect(page.locator('#instructorExerciseResumeBtn')).toBeVisible();
  await expect(page.locator('#instructorExerciseLifecycleHelp')).toContainText('Pause controls class pacing only');

  await page.getByRole('button', { name: 'Resume exercise' }).click();
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('In progress · exercise resumed');
  await expect(page.locator('#instructorExercisePauseBtn')).toBeVisible();

  const storedAfterStart = await page.evaluate(key => window.localStorage.getItem(key), INSTRUCTOR_SESSION_STORAGE_KEY);
  expect(storedAfterStart).toContain('K7FM-P4Q2');
  expect(storedAfterStart).not.toContain('studentJoinToken');

  await page.getByPlaceholder('Team Alpha').fill('Team Alpha');
  await page.getByLabel('Workspace type').selectOption('group');
  await page.getByRole('button', { name: 'Create workspace' }).click();

  await expect(page.locator('#instructorRosterSummary')).toHaveText('1 workspace');
  await expect(page.locator('.instructor-workspace-item')).toContainText('Team Alpha');
  await expect(page.locator('#instructorObservedWorkspace')).toHaveText('Team Alpha');
  await expect(page.locator('#oneLine')).toHaveValue('Team Alpha live-class Intake.');
  await expect(page.locator('#oneLine')).toHaveJSProperty('readOnly', true);

  const assignment = page.getByLabel('Assignment for Waiting Student');
  await assignment.selectOption({ label: 'Team · Team Alpha' });
  await expect(page.locator('#instructorParticipantSummary')).toHaveText('1 student · 0 waiting');
  await expect(assignment).not.toHaveValue('');
  await expect(page.locator('[data-participant-id="99999999-9999-4999-8999-999999999999"]')).toContainText('Team · Team Alpha');

  await page.locator('#instructorExerciseRefreshBtn').click();
  await expect(page.locator('#instructorExerciseProgressSummary')).toHaveText('1 ready · 0 working');
  await expect(page.getByRole('button', { name: 'Observe Team Alpha, Ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Observe Team Alpha, Ready' }).click();
  await expect(page.locator('#instructorObservedWorkspace')).toHaveText('Team Alpha');

  await page.getByRole('button', { name: 'Begin debrief' }).click();
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('Debrief · debrief started');
  await expect(page.locator('#instructorExerciseEditingStatus')).toHaveText('Student editing frozen during debrief');
  await expect(page.locator('#instructorExerciseCheckpointSummary')).toHaveText('1 captured');
  await expect(page.locator('#instructorExerciseCheckpointList')).toContainText('Team Alpha');
  await expect(page.locator('#instructorExerciseCheckpointList')).toContainText('Revision 1');
  await expect(page.locator('#instructorObservedWorkspace')).toHaveText('Team Alpha');

  await page.getByRole('button', { name: 'Allow editing' }).click();
  await expect(page.locator('#instructorExerciseEditingStatus')).toHaveText('Student editing allowed during debrief');
  await page.getByRole('button', { name: 'Freeze editing' }).click();
  await expect(page.locator('#instructorExerciseEditingStatus')).toHaveText('Student editing frozen during debrief');

  await page.getByRole('button', { name: 'Advance to next stage' }).click();
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('In progress · advanced to next stage');
  await expect(page.locator('#instructorExerciseStageTitle')).toHaveText('Analyze the browser case');
  await expect(page.locator('#instructorExerciseStageObjective')).toHaveText('Use the second-stage information to refine the analysis.');
  await expect(page.locator('#instructorExerciseStageTiming')).toHaveText('Suggested time: 4 min');
  await expect(page.locator('#instructorExerciseFacilitation')).toContainText('Second-stage browser facilitation');
  await expect(page.locator('#instructorExerciseFacilitation')).toContainText('Synthetic Instructor-only guidance for the final browser stage.');
  await expect(page.locator('#instructorExerciseDebriefPanel')).toBeHidden();
  await expect(page.locator('#instructorObservedWorkspace')).toHaveText('Team Alpha');

  await page.getByRole('button', { name: 'Begin debrief' }).click();
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('Debrief · debrief started');
  await expect(page.locator('#instructorExerciseEditingStatus')).toHaveText('Student editing allowed during debrief');
  await expect(page.locator('#instructorExerciseCheckpointSummary')).toHaveText('1 captured');
  await expect(page.locator('#instructorExerciseCheckpointList')).toContainText('Team Alpha');
  await expect(page.locator('#instructorExerciseCheckpointList')).toContainText('Revision 1');
  await expect(page.getByRole('button', { name: 'Complete exercise' })).toBeVisible();

  await page.getByRole('button', { name: 'Complete exercise' }).click();
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('Completed · exercise completed');
  await expect(page.locator('#instructorExerciseDetail')).toContainText('No additional Student material is released automatically.');
  await expect(page.locator('#instructorExerciseEditingStatus')).toHaveText('Exercise completed; staged editing policy no longer applies');
  await expect(page.getByRole('button', { name: 'Complete exercise' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Freeze editing' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Allow editing' })).toBeHidden();
  await expect(page.locator('#instructorObservedWorkspace')).toHaveText('Team Alpha');

  expect(classroomRequests.some(request => request.method === 'POST' && request.pathname === '/api/classes')).toBe(true);
  expect(classroomRequests.some(request => request.method === 'POST' && request.pathname === '/api/classes/workspaces')).toBe(true);
  expect(classroomRequests.some(request => request.method === 'POST' && request.pathname === '/api/classes/exercise')).toBe(true);
  expect(classroomRequests.filter(request => request.method === 'PATCH' && request.pathname === '/api/classes/exercise')).toHaveLength(10);
  expect(classroomRequests.some(request => request.method === 'PATCH' && request.pathname === '/api/classes/participants')).toBe(true);
  expect(classroomRequests.some(request => request.pathname === '/api/classes/join')).toBe(false);
  expect(classroomRequests.some(request => request.body.includes('assignmentToken'))).toBe(false);

  await page.reload();

  await expect(page.locator('#experienceRoleGate')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'instructor');
  await expect(page.locator('#instructorClassDashboard')).toBeVisible();
  await expect(page.locator('#instructorClassTitle')).toHaveText('Browser Live PSDM');
  await expect(page.locator('#instructorJoinCode')).toHaveText('K7FM-P4Q2');
  await expect(page.locator('#instructorParticipantSummary')).toHaveText('1 student · 0 waiting');
  await expect(page.getByLabel('Assignment for Waiting Student')).not.toHaveValue('');
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('Completed');
  await expect(page.locator('#instructorExerciseCaseName')).toHaveText('Browser Staged Simulation');
  await expect(page.getByLabel('Staged Case Study')).toHaveValue('browser-staged-simulation');
  await expect(page.locator('#instructorExerciseCreateBtn')).toBeDisabled();
  await expect(page.locator('#instructorExerciseStageTitle')).toHaveText('Analyze the browser case');
  await expect(page.locator('#instructorExerciseProgressSummary')).toHaveText('1 ready · 0 working');
  await expect(page.locator('#instructorExerciseEditingStatus')).toHaveText('Exercise completed; staged editing policy no longer applies');
  await expect(page.locator('#instructorExerciseCheckpointList')).toContainText('Team Alpha');
  await expect(page.locator('#instructorExerciseCheckpointList')).toContainText('Revision 1');
  await expect(page.locator('#instructorExerciseLifecycleHelp')).toContainText('completion does not release additional case or exemplar material');
  await expect(page.locator('#instructorExercisePauseBtn')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Advance to next stage' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Complete exercise' })).toBeHidden();

  await expectNoBlockingA11yViolations(page);
  expect(pageErrors).toEqual([]);
});

test('mobile Instructor can open and run the staged exercise console accessibly', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Focused staged-console mobile acceptance.');
  const pageErrors = watchPageErrors(page);
  const instructorCode = `i${'m'.repeat(40)}${testInfo.retry}m`;

  await startFresh(page);
  await page.getByRole('button', { name: /Teach a class/ }).click();
  await page.locator('#instructorExistingClass > summary').click();
  await page.getByLabel('Instructor access code').fill(instructorCode);
  await page.getByRole('button', { name: 'Open class' }).click();

  await expect(page.locator('#instructorClassDashboard')).toBeVisible();
  await expect(page.locator('#instructorClassDashboard')).toHaveClass(/is-collapsed/);
  await page.getByRole('button', { name: 'Open class panel' }).click();
  await expect(page.locator('#instructorClassDashboard')).not.toHaveClass(/is-collapsed/);

  await page.getByRole('button', { name: 'Show QR' }).click();
  await expect(page.locator('#instructorJoinQrPanel')).toBeVisible();
  await expect(page.locator('#instructorJoinQrSvg')).toHaveAttribute('role', 'img');
  const qrLayout = await page.locator('#instructorJoinQrPanel').evaluate(node => {
    const box = node.getBoundingClientRect();
    return {
      right: box.right,
      left: box.left,
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth
    };
  });
  expect(qrLayout.left).toBeGreaterThanOrEqual(0);
  expect(qrLayout.right).toBeLessThanOrEqual(qrLayout.viewportWidth + 1);
  expect(qrLayout.scrollWidth).toBeLessThanOrEqual(qrLayout.viewportWidth + 1);
  await page.getByRole('button', { name: 'Hide QR' }).click();
  await expect(page.locator('#instructorJoinQrPanel')).toBeHidden();

  await expect(page.locator('#instructorExerciseConsole')).toBeVisible();
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('1 staged Case Study available');
  await page.getByLabel('Staged Case Study').selectOption('browser-staged-simulation');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('Draft · draft created');

  await page.getByRole('button', { name: 'Start exercise' }).click();
  await expect(page.locator('#instructorExerciseStatus')).toHaveText('In progress · exercise started');
  await expect(page.locator('#instructorExerciseStageTitle')).toHaveText('Clarify the browser case');
  await expect(page.locator('#instructorExerciseFacilitation')).toContainText('Browser facilitation note');
  await expect(page.getByRole('button', { name: 'Pause exercise' })).toBeVisible();

  await expectNoBlockingA11yViolations(page);
  expect(pageErrors).toEqual([]);
});

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

  await page.locator('#instructorExistingClass > summary').click();
  await page.getByLabel('Instructor access code').fill(instructorCode);
  await page.getByRole('button', { name: 'Open class' }).click();

  await expect(page.locator('#instructorClassDashboard')).toBeVisible();
  await expect(page.locator('#instructorClassTitle')).toHaveText('Browser Test Classroom');
  if (testInfo.project.name === 'chromium-mobile') {
    await expect(page.locator('#instructorClassDashboard')).toHaveClass(/is-collapsed/);
    await expect(page.getByRole('button', { name: 'Open class panel' })).toBeVisible();
    await page.getByRole('button', { name: 'Open class panel' }).click();
    await expect(page.locator('#instructorClassDashboard')).not.toHaveClass(/is-collapsed/);
  }
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
