/**
 * Real-browser coverage for Classroom team sharing and workspace isolation.
 */

import { expect, test } from '@playwright/test';

function capability(fill, suffix) {
  return fill.repeat(42) + suffix;
}

async function startFresh(page) {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
}

async function joinStudent(page, { name, classCode, assignmentCode }) {
  await startFresh(page);
  await page.getByRole('button', { name: /Join a class/ }).click();
  await page.locator('#studentDisplayName').fill(name);
  await page.getByLabel('Class code').fill(classCode);
  await page.locator('#studentLegacyJoin > summary').click();
  await page.getByLabel('Assignment code').fill(assignmentCode);
  await page.getByRole('button', { name: 'Join class' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-student-class-status', 'connected');
}

test('Students in one team share one Intake while another workspace remains isolated', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Multi-browser collaboration contract is covered once on desktop; mobile Student entry already has dedicated smoke coverage.');

  const classCode = capability('c', 't');
  // Use assignment capabilities unique to this spec so fully-parallel browser
  // projects cannot mutate the Student workspaces used by coaching/resume tests.
  const retryMarker = String(testInfo.retry);
  const teamAssignment = `a${'g'.repeat(40)}${retryMarker}m`;
  const individualAssignment = `a${'n'.repeat(40)}${retryMarker}d`;

  const contextOptions = { baseURL: testInfo.project.use.baseURL };
  const firstContext = await browser.newContext(contextOptions);
  const secondContext = await browser.newContext(contextOptions);
  const isolatedContext = await browser.newContext(contextOptions);

  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  const isolated = await isolatedContext.newPage();

  try {
    await joinStudent(first, {
      name: 'Team Member One',
      classCode,
      assignmentCode: teamAssignment
    });
    await joinStudent(second, {
      name: 'Team Member Two',
      classCode,
      assignmentCode: teamAssignment
    });
    await joinStudent(isolated, {
      name: 'Individual Student',
      classCode,
      assignmentCode: individualAssignment
    });

    await expect(first.locator('#oneLine')).toHaveValue('Team Beta observed browser-test Intake.');
    await expect(second.locator('#oneLine')).toHaveValue('Team Beta observed browser-test Intake.');
    await expect(isolated.locator('#oneLine')).toHaveValue('Alex Student observed browser-test Intake.');

    const teamUpdate = 'Team members converged on one shared classroom Intake.';
    const firstSave = first.waitForResponse(response => (
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname === '/api/workspaces/session'
      && response.ok()
    ));

    await first.locator('#oneLine').fill(teamUpdate);
    await first.locator('#oneLine').blur();
    await firstSave;

    await expect(second.locator('#oneLine')).toHaveValue(teamUpdate, { timeout: 10000 });
    await expect(isolated.locator('#oneLine')).toHaveValue('Alex Student observed browser-test Intake.');

    const secondUpdate = 'Second teammate continued the same shared Intake.';
    const secondSave = second.waitForResponse(response => (
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname === '/api/workspaces/session'
      && response.ok()
    ));

    await second.locator('#oneLine').fill(secondUpdate);
    await second.locator('#oneLine').blur();
    await secondSave;

    await expect(first.locator('#oneLine')).toHaveValue(secondUpdate, { timeout: 10000 });
    await expect(isolated.locator('#oneLine')).toHaveValue('Alex Student observed browser-test Intake.');
  } finally {
    await firstContext.close();
    await secondContext.close();
    await isolatedContext.close();
  }
});
