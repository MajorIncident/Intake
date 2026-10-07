/**
 * Integrated real-browser acceptance for one Instructor and multiple live Students.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

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

async function joinLiveStudent(page, { name, classCode }) {
  await startFresh(page);
  await page.getByRole('button', { name: /Join a class/ }).click();
  await page.locator('#studentDisplayName').fill(name);
  await page.getByLabel('Class code').fill(classCode);
  await page.getByRole('button', { name: 'Join class' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-student-class-status', 'waiting');
  await expect(page.locator('#studentClassWaitingIdentity')).toHaveText(name);
}

async function createTeam(page, label) {
  await page.locator('#instructorWorkspaceLabel').fill(label);
  await page.getByLabel('Workspace type').selectOption('group');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.locator('.instructor-workspace-item').filter({ hasText: label })).toBeVisible();
}

test('live class integrates Instructor roster, team sync, isolation, coaching, reassignment, and unassign', async ({ browser }, testInfo) => {
  test.setTimeout(75_000);
  test.skip(testInfo.project.name === 'chromium-mobile', 'Integrated four-browser classroom acceptance is covered once on desktop; mobile Student and Instructor paths have dedicated coverage.');

  const contextOptions = { baseURL: testInfo.project.use.baseURL };
  const instructorContext = await browser.newContext(contextOptions);
  const studentAContext = await browser.newContext(contextOptions);
  const studentBContext = await browser.newContext(contextOptions);
  const lateStudentContext = await browser.newContext(contextOptions);

  const instructor = await instructorContext.newPage();
  const studentA = await studentAContext.newPage();
  const studentB = await studentBContext.newPage();
  const lateStudent = await lateStudentContext.newPage();

  const instructorErrors = watchPageErrors(instructor);
  const studentAErrors = watchPageErrors(studentA);
  const studentBErrors = watchPageErrors(studentB);
  const lateStudentErrors = watchPageErrors(lateStudent);
  const studentATokens = [];

  studentA.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname !== '/api/workspaces/session') return;
    const header = request.headers().authorization || '';
    const match = /^Bearer\s+(.+)$/u.exec(header);
    if (match && !studentATokens.includes(match[1])) studentATokens.push(match[1]);
  });

  try {
    await startFresh(instructor);
    await instructor.getByRole('button', { name: /Teach a class/ }).click();
    await instructor.getByLabel('Class title').fill('Integrated Browser Classroom');
    await instructor.getByRole('button', { name: 'Start class' }).click();

    await expect(instructor.locator('#instructorClassDashboard')).toBeVisible();
    const classCode = (await instructor.locator('#instructorJoinCode').textContent())?.trim() || '';
    expect(classCode).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/u);

    await createTeam(instructor, 'Team Alpha');
    await createTeam(instructor, 'Team Beta');

    await expect(instructor.locator('#instructorExerciseStatus')).toHaveText('1 staged Case Study available');
    await instructor.getByLabel('Staged Case Study').selectOption('browser-staged-simulation');
    await instructor.getByRole('button', { name: 'Create draft' }).click();
    await expect(instructor.locator('#instructorExerciseStatus')).toHaveText('Draft · draft created');
    await instructor.getByRole('button', { name: 'Start exercise' }).click();
    await expect(instructor.locator('#instructorExerciseStatus')).toHaveText('In progress · exercise started');

    await joinLiveStudent(studentA, { name: 'Student Alpha One', classCode });
    await joinLiveStudent(studentB, { name: 'Student Alpha Two', classCode });

    await expect(instructor.locator('[data-participant-id]').filter({ hasText: 'Student Alpha One' })).toBeVisible({ timeout: 10000 });
    await expect(instructor.locator('[data-participant-id]').filter({ hasText: 'Student Alpha Two' })).toBeVisible({ timeout: 10000 });

    await instructor.getByLabel('Assignment for Student Alpha One').selectOption({ label: 'Team · Team Alpha' });
    await instructor.getByLabel('Assignment for Student Alpha Two').selectOption({ label: 'Team · Team Alpha' });

    await expect(studentA.locator('body')).toHaveAttribute('data-student-class-status', 'connected', { timeout: 10000 });
    await expect(studentB.locator('body')).toHaveAttribute('data-student-class-status', 'connected', { timeout: 10000 });
    await expect(studentA.locator('#studentClassWorkspace')).toHaveText('Team Alpha');
    await expect(studentB.locator('#studentClassWorkspace')).toHaveText('Team Alpha');
    await expect(studentA.locator('#oneLine')).toHaveValue('Team Alpha live-class Intake.');
    await expect(studentB.locator('#oneLine')).toHaveValue('Team Alpha live-class Intake.');

    const alphaUpdate = 'Team Alpha converged on one shared Intake.';
    const alphaSave = studentA.waitForResponse(response => (
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname === '/api/workspaces/session'
      && response.ok()
    ));
    await studentA.locator('#oneLine').fill(alphaUpdate);
    await studentA.locator('#oneLine').blur();
    await alphaSave;
    await expect(studentB.locator('#oneLine')).toHaveValue(alphaUpdate, { timeout: 10000 });

    await joinLiveStudent(lateStudent, { name: 'Late Student', classCode });
    await expect(instructor.locator('[data-participant-id]').filter({ hasText: 'Late Student' })).toContainText('Waiting / unassigned', { timeout: 10000 });
    await instructor.getByLabel('Assignment for Late Student').selectOption({ label: 'Team · Team Beta' });

    await expect(lateStudent.locator('body')).toHaveAttribute('data-student-class-status', 'connected', { timeout: 10000 });
    await expect(lateStudent.locator('#studentClassWorkspace')).toHaveText('Team Beta');
    await expect(lateStudent.locator('#oneLine')).toHaveValue('Team Beta live-class Intake.');

    const betaUpdate = 'Team Beta stayed isolated with its own Intake.';
    const betaSave = lateStudent.waitForResponse(response => (
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname === '/api/workspaces/session'
      && response.ok()
    ));
    await lateStudent.locator('#oneLine').fill(betaUpdate);
    await lateStudent.locator('#oneLine').blur();
    await betaSave;

    await expect(studentA.locator('#oneLine')).toHaveValue(alphaUpdate);
    await expect(studentB.locator('#oneLine')).toHaveValue(alphaUpdate);

    await instructor.locator('.instructor-workspace-item').filter({ hasText: 'Team Alpha' }).click();
    await expect(instructor.locator('#instructorObservedWorkspace')).toHaveText('Team Alpha');
    await expect(instructor.locator('#oneLine')).toHaveValue(alphaUpdate, { timeout: 10000 });
    await expect(instructor.locator('#oneLine')).toHaveJSProperty('readOnly', true);

    const coaching = instructor.locator('.classroom-coaching--instructor[data-coaching-target-id="problem.one-line"]');
    await expect(coaching).toBeVisible();
    await coaching.locator('summary').click();
    await coaching.locator('textarea').fill('Make the deviation measurable before the debrief.');
    const feedbackSaved = instructor.waitForResponse(response => (
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname === '/api/classes/coaching'
      && response.ok()
    ));
    await coaching.getByRole('button', { name: 'Needs improvement' }).click();
    await feedbackSaved;

    const studentFeedback = studentB.locator('.classroom-coaching--student[data-coaching-target-id="problem.one-line"]');
    await expect(studentFeedback).toContainText('Instructor feedback · Needs improvement', { timeout: 10000 });
    await expect(studentFeedback).toContainText('Make the deviation measurable before the debrief.');

    expect(studentATokens.length).toBeGreaterThanOrEqual(1);
    const staleAlphaToken = studentATokens.at(-1);

    await instructor.getByLabel('Assignment for Student Alpha One').selectOption({ label: 'Team · Team Beta' });

    await expect(studentA.locator('#studentClassWorkspace')).toHaveText('Team Beta', { timeout: 10000 });
    await expect(studentA.locator('#oneLine')).toHaveValue(betaUpdate, { timeout: 10000 });
    await expect(studentB.locator('#studentClassWorkspace')).toHaveText('Team Alpha');
    await expect(studentB.locator('#oneLine')).toHaveValue(alphaUpdate);
    expect(studentATokens.length).toBeGreaterThanOrEqual(2);

    const staleAlphaResponse = await studentA.request.get('/api/workspaces/session', {
      headers: { Authorization: `Bearer ${staleAlphaToken}` }
    });
    expect(staleAlphaResponse.status()).toBe(404);

    const betaToken = studentATokens.at(-1);
    await instructor.getByLabel('Assignment for Student Alpha One').selectOption('');

    await expect(studentA.locator('body')).toHaveAttribute('data-student-class-status', 'waiting', { timeout: 10000 });
    await expect(studentA.locator('#studentClassWaitingPanel')).toBeVisible();
    await expect(studentA.locator('.wrap')).toBeHidden();

    const staleBetaResponse = await studentA.request.get('/api/workspaces/session', {
      headers: { Authorization: `Bearer ${betaToken}` }
    });
    expect(staleBetaResponse.status()).toBe(404);

    await expect(lateStudent.locator('#oneLine')).toHaveValue(betaUpdate);
    await expect(studentB.locator('#oneLine')).toHaveValue(alphaUpdate);

    await expect(studentB.locator('#studentCaseReference')).toBeVisible();
    await expect(studentB.locator('#studentCaseReferenceStatus')).toHaveText('Work');

    await instructor.getByRole('button', { name: 'Begin debrief' }).click();
    await expect(instructor.locator('#instructorExerciseEditingStatus')).toHaveText('Student editing frozen during debrief');
    await expect(studentB.locator('#studentCaseReferenceStatus')).toHaveText('Debrief · editing frozen', { timeout: 10000 });
    await expect(studentB.locator('#studentCaseReferenceMessage')).toContainText('frozen Student editing');
    await expect(studentB.locator('#oneLine')).toHaveJSProperty('readOnly', true);
    await expect(studentB.locator('#studentClassLeaveBtn')).toBeEnabled();

    await instructor.getByRole('button', { name: 'Allow editing' }).click();
    await expect(instructor.locator('#instructorExerciseEditingStatus')).toHaveText('Student editing allowed during debrief');
    await expect(studentB.locator('#studentCaseReferenceStatus')).toHaveText('Debrief · editing open', { timeout: 10000 });
    await expect(studentB.locator('#oneLine')).toHaveJSProperty('readOnly', false);
    await expect(studentB.locator('#studentClassLeaveBtn')).toBeEnabled();

    await expectNoBlockingA11yViolations(instructor);
    await expectNoBlockingA11yViolations(studentA);

    expect(instructorErrors).toEqual([]);
    expect(studentAErrors).toEqual([]);
    expect(studentBErrors).toEqual([]);
    expect(lateStudentErrors).toEqual([]);
  } finally {
    await instructorContext.close();
    await studentAContext.close();
    await studentBContext.close();
    await lateStudentContext.close();
  }
});


test('Instructor compares immutable debrief checkpoint with current live Intake', async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name === 'chromium-mobile', 'Checkpoint/live comparison is covered once on desktop; mobile Instructor layout has dedicated coverage.');

  const contextOptions = { baseURL: testInfo.project.use.baseURL };
  const instructorContext = await browser.newContext(contextOptions);
  const studentContext = await browser.newContext(contextOptions);
  const instructor = await instructorContext.newPage();
  const student = await studentContext.newPage();
  const instructorErrors = watchPageErrors(instructor);
  const studentErrors = watchPageErrors(student);

  try {
    await startFresh(instructor);
    await instructor.getByRole('button', { name: /Teach a class/ }).click();
    await instructor.getByLabel('Class title').fill('Integrated Browser Classroom');
    await instructor.getByRole('button', { name: 'Start class' }).click();
    await expect(instructor.locator('#instructorClassDashboard')).toBeVisible();

    const classCode = (await instructor.locator('#instructorJoinCode').textContent())?.trim() || '';
    await createTeam(instructor, 'Team Alpha');

    await instructor.getByLabel('Staged Case Study').selectOption('browser-staged-simulation');
    await instructor.getByRole('button', { name: 'Create draft' }).click();
    await instructor.getByRole('button', { name: 'Start exercise' }).click();
    await expect(instructor.locator('#instructorExerciseStatus')).toHaveText('In progress · exercise started');

    await joinLiveStudent(student, { name: 'Checkpoint Student', classCode });
    await expect(instructor.locator('[data-participant-id]').filter({ hasText: 'Checkpoint Student' })).toBeVisible({ timeout: 10000 });
    await instructor.getByLabel('Assignment for Checkpoint Student').selectOption({ label: 'Team · Team Alpha' });
    await expect(student.locator('body')).toHaveAttribute('data-student-class-status', 'connected', { timeout: 10000 });

    const beforeDebrief = 'Team Alpha reasoning captured before debrief.';
    const beforeSave = student.waitForResponse(response => (
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname === '/api/workspaces/session'
      && response.ok()
    ));
    await student.locator('#oneLine').fill(beforeDebrief);
    await student.locator('#oneLine').blur();
    await beforeSave;

    await instructor.locator('.instructor-workspace-item').filter({ hasText: 'Team Alpha' }).click();
    await expect(instructor.locator('#oneLine')).toHaveValue(beforeDebrief, { timeout: 10000 });

    await instructor.getByRole('button', { name: 'Begin debrief' }).click();
    await expect(instructor.locator('#instructorExerciseCheckpointList')).toContainText('Revision 2');
    await instructor.getByRole('button', { name: 'Allow editing' }).click();

    const afterDebrief = 'Team Alpha refined its reasoning after discussion.';
    const afterSave = student.waitForResponse(response => (
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname === '/api/workspaces/session'
      && response.ok()
    ));
    await student.locator('#oneLine').fill(afterDebrief);
    await student.locator('#oneLine').blur();
    await afterSave;
    await expect(instructor.locator('#oneLine')).toHaveValue(afterDebrief, { timeout: 10000 });

    const checkpointResponse = instructor.waitForResponse(response => (
      response.request().method() === 'GET'
      && new URL(response.url()).pathname === '/api/classes/exercise/checkpoint'
      && response.ok()
    ));
    await instructor.getByRole('button', {
      name: 'Inspect Team Alpha checkpoint, revision 2'
    }).click();
    await checkpointResponse;

    await expect(instructor.locator('#oneLine')).toHaveValue(beforeDebrief);
    await expect(instructor.locator('#instructorObservedRevision')).toHaveText(
      'Checkpoint at debrief start · Revision 2'
    );
    await expect(instructor.locator('#instructorObserverStatus')).toHaveText(
      'Immutable checkpoint · live updates paused'
    );
    await expect(instructor.getByRole('button', { name: 'View current live Intake' })).toBeVisible();

    const liveObservation = instructor.waitForResponse(response => (
      response.request().method() === 'GET'
      && new URL(response.url()).pathname === '/api/classes/observe'
      && response.ok()
    ));
    await instructor.getByRole('button', { name: 'View current live Intake' }).click();
    await liveObservation;

    await expect(instructor.locator('#oneLine')).toHaveValue(afterDebrief);
    await expect(instructor.locator('#instructorObservedRevision')).toHaveText('Revision 3');
    await expect(instructor.locator('#instructorObserverStatus')).toHaveText('Live read-only view');

    await expectNoBlockingA11yViolations(instructor);
    expect(instructorErrors).toEqual([]);
    expect(studentErrors).toEqual([]);
  } finally {
    await instructorContext.close();
    await studentContext.close();
  }
});
