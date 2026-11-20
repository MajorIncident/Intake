/**
 * Pilot blocker 6 load budget: measures the real request rate of one connected,
 * idle Student browser (collaboration poll + presence + status + coaching +
 * staged-exercise polls) and fails if it regresses past the budget recorded in
 * docs/operations-capacity.md. One project is enough; the cadence is the same.
 */

import { expect, test } from '@playwright/test';

/** Requests per second an idle connected Student may make (expected ≈ 1.13). */
const IDLE_STUDENT_BUDGET_RPS = 1.3;
/** Fast collaboration polling lasts this long after joining or any activity (src/collaboration.js ACTIVE_WINDOW_MS). */
const ACTIVE_WINDOW_MS = 15_000;
const MEASURE_MS = 20_000;

test('an idle connected Student stays within the pilot request budget', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Polling cadence is identical on mobile.');
  test.setTimeout(90_000);

  const requests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) requests.push({ at: Date.now(), key: `${request.method()} ${url.pathname}` });
  });

  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
  await page.getByRole('button', { name: /Join a class/ }).click();
  await page.locator('#studentDisplayName').fill('Load Budget Student');
  await page.getByLabel('Class code').fill('M7QR-T4P2');
  await page.getByRole('button', { name: 'Join class' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-student-class-status', 'connected', { timeout: 15_000 });
  await expect(page.locator('#studentCaseReference')).toBeVisible();

  // Leave the page untouched until the post-join fast window has passed, then measure.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(ACTIVE_WINDOW_MS + 1_000);
  const start = Date.now();
  await page.waitForTimeout(MEASURE_MS);
  const end = Date.now();

  const measured = requests.filter(request => request.at >= start && request.at < end);
  const seconds = (end - start) / 1000;
  const breakdown = Object.fromEntries(
    [...new Set(measured.map(request => request.key))].sort()
      .map(key => [key, Number((measured.filter(request => request.key === key).length / seconds).toFixed(2))])
  );
  const rate = measured.length / seconds;
  await testInfo.attach('idle-student-requests-per-second.json', {
    body: JSON.stringify({ total: Number(rate.toFixed(2)), breakdown }, null, 2),
    contentType: 'application/json'
  });
  console.log(`[load-budget] idle Student ${rate.toFixed(2)} requests/s ${JSON.stringify(breakdown)}`);

  expect(rate, JSON.stringify(breakdown)).toBeLessThanOrEqual(IDLE_STUDENT_BUDGET_RPS);
  expect(breakdown['GET /api/workspaces/session'] ?? 0, 'idle collaboration poll').toBeLessThanOrEqual(0.4);
});
