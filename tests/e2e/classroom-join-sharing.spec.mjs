/**
 * Browser acceptance for Classroom human-code join sharing.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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

test('Instructor share link opens normal Student admission with fragment-only human code', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Join-link contract is browser-independent; mobile share/QR presentation is covered in later #320 tranches.');

  const contextOptions = { baseURL: testInfo.project.use.baseURL };
  const instructorContext = await browser.newContext(contextOptions);
  const studentContext = await browser.newContext(contextOptions);
  const instructor = await instructorContext.newPage();
  const student = await studentContext.newPage();
  const instructorErrors = watchPageErrors(instructor);
  const studentErrors = watchPageErrors(student);

  try {
    await instructorContext.grantPermissions(['clipboard-read', 'clipboard-write']);

    await startFresh(instructor);
    await instructor.getByRole('button', { name: /Teach a class/ }).click();
    await instructor.getByLabel('Class title').fill('Join Link Browser Class');
    await instructor.getByRole('button', { name: 'Start class' }).click();
    await expect(instructor.locator('#instructorClassDashboard')).toBeVisible();

    const joinCode = (await instructor.locator('#instructorJoinCode').textContent())?.trim() || '';
    expect(joinCode).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/u);

    await instructor.getByRole('button', { name: 'Share class' }).click();
    const shareUrl = await instructor.evaluate(() => navigator.clipboard.readText());
    const parsedShareUrl = new URL(shareUrl);

    expect(parsedShareUrl.origin).toBe(new URL(testInfo.project.use.baseURL).origin);
    expect(parsedShareUrl.search).toBe('');
    expect(parsedShareUrl.hash).toBe(`#join=${joinCode.replace('-', '')}`);
    expect(shareUrl).not.toContain('workspace=');

    await student.goto(shareUrl);
    await expect(student.locator('body')).toHaveAttribute('data-experience-role', 'student');
    await expect(student.locator('#studentClassEntryShell')).toBeVisible();
    await expect(student.getByLabel('Class code')).toHaveValue(joinCode);
    expect(new URL(student.url()).hash).toBe('');

    await student.locator('#studentDisplayName').fill('Shared Link Student');
    await student.getByRole('button', { name: 'Join class' }).click();
    await expect(student.locator('body')).toHaveAttribute('data-student-class-status', 'waiting');
    await expect(student.locator('#studentClassWaitingIdentity')).toHaveText('Shared Link Student');

    await expectNoBlockingA11yViolations(instructor);
    await expectNoBlockingA11yViolations(student);
    expect(instructorErrors).toEqual([]);
    expect(studentErrors).toEqual([]);
  } finally {
    await instructorContext.close();
    await studentContext.close();
  }
});
