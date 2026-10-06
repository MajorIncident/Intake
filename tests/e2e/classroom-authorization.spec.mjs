/**
 * Real-browser negative authorization coverage for Classroom credentials.
 */

import { expect, test } from '@playwright/test';

const STUDENT_SESSION_STORAGE_KEY = 'kt-classroom-student-session-v1';

function capability(fill, suffix) {
  return fill.repeat(42) + suffix;
}

function workspaceTokenForAssignment(assignmentToken) {
  return `w${assignmentToken.slice(1)}`;
}

async function startFresh(page) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
}

test('Student workspace authority cannot enumerate the Instructor roster', async ({ page }, testInfo) => {
  const suffix = testInfo.project.name === 'chromium-mobile' ? 'u' : 'v';
  const classCode = capability('c', suffix);
  const assignmentCode = capability('a', suffix);

  await startFresh(page);
  await page.getByRole('button', { name: /Join a class/ }).click();
  await page.locator('#studentDisplayName').fill('Authorization Student');
  await page.getByLabel('Class code').fill(classCode);
  await page.locator('#studentLegacyJoin > summary').click();
  await page.getByLabel('Assignment code').fill(assignmentCode);
  await page.getByRole('button', { name: 'Join class' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-student-class-status', 'connected');

  const stored = await page.evaluate(key => JSON.parse(window.localStorage.getItem(key) || 'null'), STUDENT_SESSION_STORAGE_KEY);
  expect(stored?.workspaceToken).toBe(workspaceTokenForAssignment(assignmentCode));

  const rosterResponse = await page.request.get('/api/classes/workspaces', {
    headers: { Authorization: `Bearer ${stored.workspaceToken}` }
  });
  expect(rosterResponse.status()).toBe(401);
  const body = await rosterResponse.json();
  expect(body.workspaces).toBeUndefined();
});

test('well-formed non-Instructor authority cannot open an Instructor class', async ({ page }, testInfo) => {
  const suffix = testInfo.project.name === 'chromium-mobile' ? 'q' : 'z';
  const wrongAuthority = capability('w', suffix);

  await startFresh(page);
  await page.getByRole('button', { name: /Teach a class/ }).click();
  await page.locator('#instructorExistingClass > summary').click();
  await page.getByLabel('Instructor access code').fill(wrongAuthority);
  await page.getByRole('button', { name: 'Open class' }).click();

  await expect(page.locator('#instructorClassDashboard')).toBeHidden();
  await expect(page.locator('#instructorClassEntryCard')).toBeVisible();
  await expect(page.locator('#instructorClassError')).toContainText(/not accepted|expired/i);
});

test('expired saved Student access is discarded before stale workspace content can resume', async ({ page }, testInfo) => {
  const suffix = testInfo.project.name === 'chromium-mobile' ? 'h' : 'k';
  const expiredWorkspaceToken = capability('w', suffix);

  await startFresh(page);
  await page.getByRole('button', { name: /Join a class/ }).click();

  await page.evaluate(({ key, token }) => {
    window.localStorage.setItem(key, JSON.stringify({
      version: 1,
      class: {
        id: 'expired-browser-class',
        title: 'Expired Browser Classroom',
        expiresAt: '2000-01-01T00:00:00.000Z'
      },
      workspace: {
        id: '99999999-9999-4999-8999-999999999999',
        kind: 'group',
        label: 'Expired Team',
        expiresAt: '2000-01-01T00:00:00.000Z'
      },
      participant: {
        id: '88888888-8888-4888-8888-888888888888',
        displayName: 'Expired Student'
      },
      workspaceToken: token,
      joinedAt: '1999-12-31T23:59:00.000Z'
    }));
  }, { key: STUDENT_SESSION_STORAGE_KEY, token: expiredWorkspaceToken });

  await page.reload();

  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'student');
  await expect(page.locator('#studentClassEntryShell')).toBeVisible();
  await expect(page.locator('#studentClassJoinError')).toContainText(/expired/i);
  await expect(page.locator('body')).not.toHaveAttribute('data-student-class-status', 'connected');

  const storedAfterRecovery = await page.evaluate(key => window.localStorage.getItem(key), STUDENT_SESSION_STORAGE_KEY);
  expect(storedAfterRecovery).toBeNull();
  await expect(page.locator('#studentClassWorkspace')).not.toContainText('Expired Team');
});
