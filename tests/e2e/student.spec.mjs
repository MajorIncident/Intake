/**
 * Real-browser coverage for Student Classroom admission and same-device resume.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const STUDENT_SESSION_STORAGE_KEY = 'kt-classroom-student-session-v1';

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

test('Student joins with one code, waits, resumes Team Alpha, moves to Team Beta, and returns to Waiting', async ({ page }, testInfo) => {
  const pageErrors = watchPageErrors(page);
  const displayName = testInfo.project.name === 'chromium-mobile' ? 'Mobile Live Student' : 'Desktop Live Student';
  const classCode = 'M7QR-T4P2';
  const workspaceTokens = [];
  const exerciseTokens = [];
  const readinessTokens = [];
  const readinessBodies = [];
  const debriefRequests = [];

  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/classes/debrief') {
      debriefRequests.push({ method: request.method(), authorization: request.headers().authorization || '' });
    }
    const header = request.headers().authorization || '';
    const match = /^Bearer\s+(.+)$/u.exec(header);
    if (!match) return;
    if (url.pathname === '/api/workspaces/session' && !workspaceTokens.includes(match[1])) {
      workspaceTokens.push(match[1]);
    }
    if (url.pathname === '/api/classes/exercise/student' && !exerciseTokens.includes(match[1])) {
      exerciseTokens.push(match[1]);
    }
    if (url.pathname === '/api/classes/exercise/student/ready') {
      readinessTokens.push(match[1]);
      readinessBodies.push(request.postDataJSON());
    }
  });

  await startFresh(page);
  await page.getByRole('button', { name: /Join a class/ }).click();

  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'student');
  await expect(page.getByRole('heading', { name: 'Join your class' })).toBeVisible();

  await page.locator('#studentDisplayName').fill(displayName);
  await page.getByLabel('Class code').fill(classCode);
  await page.getByRole('button', { name: 'Join class' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-student-class-status', 'waiting');
  await expect(page.locator('#studentClassWaitingPanel')).toBeVisible();
  await expect(page.locator('#studentClassWaitingClass')).toHaveText('Browser Student Live Classroom');
  await expect(page.locator('#studentClassWaitingIdentity')).toHaveText(displayName);
  await expect(page.locator('.wrap')).toBeHidden();

  const storedWaiting = await page.evaluate(key => JSON.parse(window.localStorage.getItem(key)), STUDENT_SESSION_STORAGE_KEY);
  expect(storedWaiting.mode).toBe('live');
  expect(storedWaiting.studentSessionToken).toBeTruthy();
  expect(storedWaiting.assignment).toBeNull();
  expect(storedWaiting.workspaceToken).toBeUndefined();
  expect(JSON.stringify(storedWaiting)).not.toContain(classCode);

  await expect(page.locator('body')).toHaveAttribute('data-student-class-status', 'connected', { timeout: 10000 });
  await expect(page.locator('#studentClassWorkspace')).toHaveText('Team Alpha');
  await expect(page.locator('#oneLine')).toHaveValue('Team Alpha destination Intake.');
  await expect(page.locator('#instructorDebriefComparison')).toBeHidden();
  expect(debriefRequests).toEqual([]);
  expect(workspaceTokens.length).toBeGreaterThanOrEqual(1);

  await expect(page.locator('#studentCaseReference')).toBeVisible();
  if (testInfo.project.name === 'chromium-mobile') {
    const classContext = page.locator('#studentExperienceNotice');
    const teamWorkspace = page.locator('#collaborationWorkspace');
    const notesWorkspace = page.locator('#notesWorkspace');

    await expect(classContext).toHaveClass(/is-collapsed/);
    await expect(page.getByRole('button', { name: 'Open class' })).toBeVisible();
    await expect(page.locator('#studentClassCompactSummary')).toContainText('Team Alpha');
    await page.getByRole('button', { name: 'Open class' }).click();
    await expect(classContext).not.toHaveClass(/is-collapsed/);
    await page.getByRole('button', { name: 'Collapse class' }).click();
    await expect(classContext).toHaveClass(/is-collapsed/);

    await expect(page.locator('#studentCaseReference')).toHaveClass(/is-collapsed/);
    await expect(page.getByRole('button', { name: 'Open case reference' })).toBeVisible();
    await page.getByRole('button', { name: 'Open case reference' }).click();
    await expect(page.locator('#studentCaseReference')).not.toHaveClass(/is-collapsed/);

    await expect(teamWorkspace).toBeVisible();
    await expect(teamWorkspace).toHaveClass(/is-collapsed/);
    await expect(page.getByRole('button', { name: 'Open team' })).toBeVisible();
    await page.getByRole('button', { name: 'Open team' }).click();
    await expect(teamWorkspace).not.toHaveClass(/is-collapsed/);
    await page.getByRole('button', { name: 'Collapse team' }).click();
    await expect(teamWorkspace).toHaveClass(/is-collapsed/);

    await expect(notesWorkspace).toHaveClass(/is-collapsed/);
    await expect(page.getByRole('button', { name: 'Open notes' })).toBeVisible();
    await page.getByRole('button', { name: 'Open notes' }).click();
    await expect(notesWorkspace).not.toHaveClass(/is-collapsed/);
    await page.getByRole('button', { name: 'Collapse notes' }).click();
    await expect(notesWorkspace).toHaveClass(/is-collapsed/);

    const mobileLayout = await page.evaluate(() => ({
      dockPosition: getComputedStyle(document.querySelector('.workspace-dock')).position,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));
    expect(mobileLayout.dockPosition).toBe('static');
    expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth + 1);
  }
  await expect(page.locator('#studentCaseReferenceTitle')).toHaveText('Browser Staged Simulation');
  await expect(page.locator('#studentCaseReferenceStatus')).toHaveText('Work');
  await expect(page.locator('#studentCaseReferenceStageTitle')).toHaveText('Clarify the browser case');
  await expect(page.locator('#studentCaseReferenceObjective')).toHaveText('Capture the initial situation in Intake.');
  await expect(page.locator('#studentCaseReferenceContent')).toContainText('Initial browser briefing');
  await expect(page.locator('#studentCaseReferenceContent')).toContainText('Optional browser evidence');
  await expect(page.locator('#studentCaseReference')).not.toContainText('Second browser briefing');
  await expect(page.locator('#studentCaseReference')).not.toContainText('Browser facilitation note');
  if (testInfo.project.name === 'chromium-mobile') {
    await expectNoBlockingA11yViolations(page);
  }
  expect(exerciseTokens).toContain(storedWaiting.studentSessionToken);
  expect(exerciseTokens.every(token => token === storedWaiting.studentSessionToken)).toBe(true);

  const alphaMarker = `${displayName} wrote in Team Alpha.`;
  const alphaSave = page.waitForResponse(response => (
    response.request().method() === 'PUT'
    && new URL(response.url()).pathname === '/api/workspaces/session'
    && response.ok()
  ));
  await page.locator('#oneLine').fill(alphaMarker);
  await page.locator('#oneLine').blur();
  await alphaSave;

  await expect(page.locator('#studentCaseReferenceReadiness')).toBeVisible();
  await expect(page.locator('#studentCaseReferenceReadinessStatus')).toHaveText('Working');
  const readyResponse = page.waitForResponse(response => (
    response.request().method() === 'PUT'
    && new URL(response.url()).pathname === '/api/classes/exercise/student/ready'
    && response.ok()
  ));
  await page.getByRole('button', { name: 'Mark Ready' }).click();
  const readyResult = await readyResponse;
  const readyBody = await readyResult.json();
  const capturedRevision = readyBody?.readiness?.readyWorkspaceRevision;
  expect(Number.isInteger(capturedRevision)).toBe(true);
  expect(capturedRevision).toBeGreaterThan(0);
  await expect(page.locator('#studentCaseReferenceReadinessStatus')).toHaveText(
    `Ready for debrief · Intake revision ${capturedRevision}`
  );
  await expect(page.getByRole('button', { name: 'Resume working' })).toHaveAttribute('aria-pressed', 'true');

  const resumeResponse = page.waitForResponse(response => (
    response.request().method() === 'PUT'
    && new URL(response.url()).pathname === '/api/classes/exercise/student/ready'
    && response.ok()
  ));
  await page.getByRole('button', { name: 'Resume working' }).click();
  await resumeResponse;
  await expect(page.locator('#studentCaseReferenceReadinessStatus')).toHaveText('Working');
  await expect(page.getByRole('button', { name: 'Mark Ready' })).toHaveAttribute('aria-pressed', 'false');
  expect(readinessTokens).toEqual([storedWaiting.studentSessionToken, storedWaiting.studentSessionToken]);
  expect(readinessBodies).toEqual([{ ready: true }, { ready: false }]);

  await page.reload();

  await expect(page.locator('#experienceRoleGate')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'unselected');
  await expect(page.locator('[data-startup-resume="student"]')).toContainText('Browser Student Live Classroom');
  await page.locator('[data-startup-resume="student"]').click();

  await expect(page.locator('#experienceRoleGate')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'student');
  await expect(page.locator('body')).toHaveAttribute('data-student-class-status', 'connected', { timeout: 10000 });
  await expect(page.locator('#studentClassWorkspace')).toHaveText('Team Alpha');
  await expect(page.locator('#oneLine')).toHaveValue(alphaMarker);
  await expect(page.locator('#instructorDebriefComparison')).toBeHidden();
  expect(debriefRequests).toEqual([]);
  await expect(page.locator('#studentCaseReference')).toBeVisible();
  await expect(page.locator('#studentCaseReferenceTitle')).toHaveText('Browser Staged Simulation');
  expect(workspaceTokens.length).toBeGreaterThanOrEqual(2);
  expect(exerciseTokens.every(token => token === storedWaiting.studentSessionToken)).toBe(true);
  const resumedAlphaToken = workspaceTokens.at(-1);

  await expect(page.locator('#studentClassWorkspace')).toHaveText('Team Beta', { timeout: 10000 });
  await expect(page.locator('#oneLine')).toHaveValue('Team Beta destination Intake.');
  expect(workspaceTokens.length).toBeGreaterThanOrEqual(3);

  const staleAlphaResponse = await page.request.get('/api/workspaces/session', {
    headers: { Authorization: `Bearer ${resumedAlphaToken}` }
  });
  expect(staleAlphaResponse.status()).toBe(404);

  const betaToken = workspaceTokens.at(-1);
  await expect(page.locator('body')).toHaveAttribute('data-student-class-status', 'waiting', { timeout: 10000 });
  await expect(page.locator('#studentClassWaitingPanel')).toBeVisible();
  await expect(page.locator('.wrap')).toBeHidden();
  await expect(page.locator('#studentCaseReference')).toBeHidden();

  const staleBetaResponse = await page.request.get('/api/workspaces/session', {
    headers: { Authorization: `Bearer ${betaToken}` }
  });
  expect(staleBetaResponse.status()).toBe(404);

  const storedAfterUnassign = await page.evaluate(key => JSON.parse(window.localStorage.getItem(key)), STUDENT_SESSION_STORAGE_KEY);
  expect(storedAfterUnassign.mode).toBe('live');
  expect(storedAfterUnassign.assignmentRevision).toBe(3);
  expect(storedAfterUnassign.assignment).toBeNull();
  expect(storedAfterUnassign.workspaceToken).toBeUndefined();

  await expectNoBlockingA11yViolations(page);
  expect(pageErrors).toEqual([]);
});
