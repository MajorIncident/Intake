/**
 * Real-browser negative authorization coverage for Classroom credentials.
 */

import { expect, test } from '@playwright/test';

const STUDENT_SESSION_STORAGE_KEY = 'kt-classroom-student-session-v1';

async function startFresh(page) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
}

test('Student workspace authority cannot enumerate the Instructor roster', async ({ page }) => {
  let workspaceToken = '';
  page.on('request', request => {
    if (new URL(request.url()).pathname !== '/api/workspaces/session') return;
    const match = /^Bearer\s+(.+)$/u.exec(request.headers().authorization || '');
    if (match) workspaceToken = match[1];
  });

  await startFresh(page);
  await page.getByRole('button', { name: /Join a class/ }).click();
  await page.locator('#studentDisplayName').fill('Authorization Student');
  await page.getByLabel('Class code').fill('M7QR-T4P2');
  await page.getByRole('button', { name: 'Join class' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-student-class-status', 'connected', { timeout: 10000 });
  expect(workspaceToken).toBeTruthy();

  const rosterResponse = await page.request.get('/api/classes/workspaces', {
    headers: { Authorization: `Bearer ${workspaceToken}` }
  });
  expect(rosterResponse.status()).toBe(401);
  const body = await rosterResponse.json();
  expect(body.workspaces).toBeUndefined();
});

test('well-formed non-Instructor authority cannot read an Instructor class', async ({ page }) => {
  await startFresh(page);
  const wrongAuthority = 'w'.repeat(43);

  const result = await page.request.get('/api/classes/workspaces', {
    headers: { Authorization: `Bearer ${wrongAuthority}` }
  });
  expect(result.status()).toBe(401);
  const body = await result.json();
  expect(body.workspaces).toBeUndefined();
});

test('expired saved Student access is discarded before stale workspace content can resume', async ({ page }, testInfo) => {
  await startFresh(page);
  await page.getByRole('button', { name: /Join a class/ }).click();

  await page.evaluate(key => {
    window.localStorage.setItem(key, JSON.stringify({
      version: 2,
      mode: 'live',
      class: {
        id: 'expired-browser-class',
        title: 'Expired Browser Classroom',
        expiresAt: '2000-01-01T00:00:00.000Z'
      },
      participant: {
        id: '88888888-8888-4888-8888-888888888888',
        displayName: 'Expired Student'
      },
      studentSessionToken: 'l'.repeat(43),
      assignmentRevision: 1,
      assignment: {
        id: '99999999-9999-4999-8999-999999999999',
        kind: 'group',
        label: 'Expired Team'
      },
      joinedAt: '1999-12-31T23:59:00.000Z'
    }));
  }, STUDENT_SESSION_STORAGE_KEY);

  await page.reload();

  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'student');
  await expect(page.locator('#studentClassEntryShell')).toBeVisible();
  await expect(page.locator('#studentClassJoinError')).toContainText(/expired/i);
  await expect(page.locator('body')).not.toHaveAttribute('data-student-class-status', 'connected');

  const storedAfterRecovery = await page.evaluate(key => window.localStorage.getItem(key), STUDENT_SESSION_STORAGE_KEY);
  expect(storedAfterRecovery).toBeNull();
  await expect(page.locator('#studentClassWorkspace')).not.toContainText('Expired Team');
});
