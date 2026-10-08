/**
 * Real-browser coverage for Administration / Maintenance.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ADMIN = 'A'.repeat(43);
const INSTRUCTOR = 'R'.repeat(43);
const CLASS_ACTIVE = '11111111-1111-4111-8111-111111111111';
const CLASS_EXPIRED = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_STALE = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_CLASS = '44444444-4444-4444-8444-444444444444';
const ADMIN_SESSION_STORAGE_KEY = 'kt-admin-session-v1';

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

function fixtureInventory() {
  return {
    generatedAt: '2026-10-08T18:00:00.000Z',
    classes: [
      {
        id: CLASS_ACTIVE,
        title: 'Active Browser Class',
        status: 'active',
        joinsEnabled: true,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        expiresAt: '2099-12-31T23:59:59.000Z',
        revokedAt: null,
        lastActivityAt: '2026-10-08T17:59:00.000Z',
        idleDays: 0,
        participantCount: 2,
        workspaceCount: 1,
        presenceCount: 2,
        recentPresenceCount: 1,
        coachingCount: 1,
        exerciseCount: 1,
        checkpointCount: 1,
        releaseCount: 2,
        workspaces: [{ id: WORKSPACE_CLASS, label: 'Team A', kind: 'group' }],
        exercise: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'active',
          currentStageId: 'stage-1',
          stagePhase: 'work',
          updatedAt: '2026-10-08T17:58:00.000Z'
        }
      },
      {
        id: CLASS_EXPIRED,
        title: 'Expired Browser Class',
        status: 'expired',
        joinsEnabled: false,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
        expiresAt: '2026-08-01T00:00:00.000Z',
        revokedAt: null,
        lastActivityAt: '2026-07-20T00:00:00.000Z',
        idleDays: 80,
        participantCount: 1,
        workspaceCount: 0,
        presenceCount: 0,
        recentPresenceCount: 0,
        coachingCount: 0,
        exerciseCount: 0,
        checkpointCount: 0,
        releaseCount: 0,
        workspaces: [],
        exercise: null
      }
    ],
    workspaces: [
      {
        id: WORKSPACE_STALE,
        teamName: 'Old Browser Collaboration',
        status: 'active',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
        expiresAt: '2099-12-31T23:59:59.000Z',
        lastActivityAt: '2026-06-02T00:00:00.000Z',
        idleDays: 128,
        participantCount: 2,
        recentPresenceCount: 0,
        capabilityCount: 0,
        classOwned: false,
        classroom: null
      },
      {
        id: WORKSPACE_CLASS,
        teamName: 'Team A',
        status: 'active',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        expiresAt: '2099-12-31T23:59:59.000Z',
        lastActivityAt: '2026-10-08T17:59:00.000Z',
        idleDays: 0,
        participantCount: 2,
        recentPresenceCount: 1,
        capabilityCount: 2,
        classOwned: true,
        classroom: {
          id: CLASS_ACTIVE,
          title: 'Active Browser Class',
          workspaceId: WORKSPACE_CLASS,
          workspaceKind: 'group',
          workspaceLabel: 'Team A'
        }
      }
    ]
  };
}

async function installAdminFixture(page) {
  let inventory = fixtureInventory();
  const requests = [];

  await page.route('**/api/admin', async route => {
    const request = route.request();
    const headers = request.headers();
    const authorization = headers.authorization || '';
    let body = {};
    try {
      body = request.postDataJSON() || {};
    } catch {
      body = {};
    }
    requests.push({ method: request.method(), authorization, body });

    const fulfill = (status, payload) => route.fulfill({
      status,
      contentType: 'application/json',
      headers: {
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer'
      },
      body: JSON.stringify(payload)
    });

    if (authorization !== `Bearer ${ADMIN}`) {
      return fulfill(401, { error: 'Administration authorization required.' });
    }

    if (request.method() === 'GET') {
      return fulfill(200, inventory);
    }

    if (body.action === 'rotate-instructor' && body.classId === CLASS_ACTIVE) {
      return fulfill(200, {
        classroom: {
          id: CLASS_ACTIVE,
          title: 'Active Browser Class',
          joinsEnabled: true,
          expiresAt: '2099-12-31T23:59:59.000Z'
        },
        instructorToken: INSTRUCTOR
      });
    }

    if (body.action === 'revoke-class' && body.classId === CLASS_ACTIVE) {
      inventory = {
        ...inventory,
        classes: inventory.classes.map(item => item.id === CLASS_ACTIVE
          ? { ...item, status: 'revoked', joinsEnabled: false, revokedAt: '2026-10-08T18:00:00.000Z' }
          : item)
      };
      return fulfill(200, { revoked: true, classId: CLASS_ACTIVE });
    }

    if (body.action === 'preview-purge' && body.scope === 'classes') {
      const expired = inventory.classes.filter(item => item.id === CLASS_EXPIRED);
      return fulfill(200, expired.length
        ? {
            plan: {
              scope: 'classes',
              mode: body.mode,
              idleDays: body.idleDays ?? null,
              cutoffAt: body.idleDays ? '2026-09-08T18:00:00.000Z' : null,
              generatedAt: '2026-10-08T18:00:00.000Z',
              truncated: false,
              items: expired
            },
            previewToken: 'preview-classes',
            expiresAt: '2026-10-08T18:10:00.000Z'
          }
        : { plan: { scope: 'classes', mode: body.mode, items: [] }, previewToken: null, expiresAt: null });
    }

    if (body.action === 'preview-purge' && body.scope === 'workspaces') {
      const stale = inventory.workspaces.filter(item => item.id === WORKSPACE_STALE);
      return fulfill(200, stale.length
        ? {
            plan: {
              scope: 'workspaces',
              mode: body.mode,
              idleDays: body.idleDays,
              cutoffAt: '2026-09-08T18:00:00.000Z',
              generatedAt: '2026-10-08T18:00:00.000Z',
              truncated: false,
              items: stale
            },
            previewToken: 'preview-workspaces',
            expiresAt: '2026-10-08T18:10:00.000Z'
          }
        : { plan: { scope: 'workspaces', mode: body.mode, items: [] }, previewToken: null, expiresAt: null });
    }

    if (body.action === 'commit-purge' && body.previewToken === 'preview-classes') {
      inventory = {
        ...inventory,
        classes: inventory.classes.filter(item => item.id !== CLASS_EXPIRED)
      };
      return fulfill(200, { purged: true, scope: 'classes', ids: [CLASS_EXPIRED], workspaceCount: 0 });
    }

    if (body.action === 'commit-purge' && body.previewToken === 'preview-workspaces') {
      inventory = {
        ...inventory,
        workspaces: inventory.workspaces.filter(item => item.id !== WORKSPACE_STALE)
      };
      return fulfill(200, { purged: true, scope: 'workspaces', ids: [WORKSPACE_STALE] });
    }

    return fulfill(400, { error: 'Unexpected browser fixture request.' });
  });

  return { requests, getInventory: () => inventory };
}

async function openAndAuthenticate(page) {
  await page.getByRole('button', { name: 'Administration / Maintenance', exact: true }).click();
  await expect(page.locator('#adminMaintenanceGate')).toBeVisible();
  await page.getByLabel('Admin access key').fill(ADMIN);
  await page.getByRole('button', { name: 'Open maintenance console' }).click();
  await expect(page.locator('#adminMaintenanceConsole')).toBeVisible();
}

test('Administration authenticates in tab scope without becoming an Intake experience role', async ({ page }) => {
  const pageErrors = watchPageErrors(page);
  const fixture = await installAdminFixture(page);
  await startFresh(page);

  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'unselected');
  await openAndAuthenticate(page);

  await expect(page.getByText('Active Browser Class', { exact: true })).toBeVisible();
  await expect(page.getByText('Expired Browser Class', { exact: true })).toBeVisible();
  await expect(page.getByText('Old Browser Collaboration', { exact: true })).toBeVisible();
  await expect(page.getByText('Team A', { exact: true }).first()).toBeVisible();

  const storage = await page.evaluate(key => ({
    session: window.sessionStorage.getItem(key),
    localValues: Object.values(window.localStorage)
  }), ADMIN_SESSION_STORAGE_KEY);
  expect(JSON.parse(storage.session).token).toBe(ADMIN);
  expect(storage.localValues.some(value => value.includes(ADMIN))).toBe(false);
  await expect(page.locator('body')).toHaveAttribute('data-experience-role', 'unselected');

  await page.getByLabel('Search classes').fill('Expired');
  await expect(page.getByText('Expired Browser Class', { exact: true })).toBeVisible();
  await expect(page.getByText('Active Browser Class', { exact: true })).toBeHidden();
  await page.getByLabel('Search classes').fill('');

  await expectNoBlockingA11yViolations(page);
  expect(fixture.requests[0]).toMatchObject({
    method: 'GET',
    authorization: `Bearer ${ADMIN}`
  });
  expect(pageErrors).toEqual([]);

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('#adminMaintenanceGate')).toBeHidden();
  await expect(page.locator('#experienceRoleGate')).toBeVisible();
});

test('Administration previews exact stale records before purge and protects class-owned sessions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Destructive Admin workflow runs once on desktop; mobile accessibility is covered by the Admin entry test.');
  const pageErrors = watchPageErrors(page);
  const fixture = await installAdminFixture(page);
  await startFresh(page);
  await openAndAuthenticate(page);

  await page.getByRole('button', { name: 'Preview stale / expired classes' }).click();
  const classPreview = page.locator('#adminPurgePreview');
  await expect(classPreview).toBeVisible();
  await expect(classPreview).toContainText('Expired Browser Class');
  await expect(classPreview).not.toContainText('Active Browser Class');

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Purge 1 class' }).click();
  await expect(page.getByText('Expired Browser Class', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Active Browser Class', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Preview stale independent workspaces' }).click();
  const workspacePreview = page.locator('#adminPurgePreview');
  await expect(workspacePreview).toBeVisible();
  await expect(workspacePreview).toContainText('Old Browser Collaboration');
  await expect(workspacePreview).not.toContainText('Team A');

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Purge 1 workspace' }).click();
  await expect(page.getByText('Old Browser Collaboration', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Team A', { exact: true }).first()).toBeVisible();

  const commits = fixture.requests.filter(item => item.body.action === 'commit-purge');
  expect(commits.map(item => item.body.previewToken)).toEqual(['preview-classes', 'preview-workspaces']);
  expect(pageErrors).toEqual([]);
});

test('Administration can reissue Instructor authority without persisting the returned credential', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Credential recovery workflow runs once on desktop; mobile accessibility is covered separately.');
  const pageErrors = watchPageErrors(page);
  await installAdminFixture(page);
  await startFresh(page);
  await openAndAuthenticate(page);

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Reissue Instructor access' }).click();

  const recovery = page.locator('#adminRecoveryPanel');
  await expect(recovery).toBeVisible();
  await expect(page.locator('#adminRecoveryToken')).toHaveValue(INSTRUCTOR);

  const storage = await page.evaluate(({ adminKey, instructor }) => ({
    session: window.sessionStorage.getItem(adminKey),
    localContainsInstructor: Object.values(window.localStorage).some(value => value.includes(instructor)),
    sessionContainsInstructor: Object.entries(window.sessionStorage)
      .filter(([key]) => key !== adminKey)
      .some(([, value]) => value.includes(instructor))
  }), { adminKey: ADMIN_SESSION_STORAGE_KEY, instructor: INSTRUCTOR });

  expect(storage.localContainsInstructor).toBe(false);
  expect(storage.sessionContainsInstructor).toBe(false);
  expect(JSON.parse(storage.session).token).toBe(ADMIN);
  expect(pageErrors).toEqual([]);
});
