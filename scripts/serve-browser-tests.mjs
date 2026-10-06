#!/usr/bin/env node
/**
 * @fileoverview Deterministic local HTTP target for Playwright browser tests.
 *
 * The server intentionally mirrors Intake's public deployment boundary instead
 * of exposing the repository root. Browser assets are served; authored template
 * JSON, API source, tests, scripts, and repository documentation are not.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TEMPLATE_MANIFEST } from '../src/templates.manifest.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HOST = process.env.BROWSER_TEST_HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.BROWSER_TEST_PORT || '4173', 10);
const ROOT_FILES = new Set(['index.html', 'main.js', 'styles.css']);
const PUBLIC_DIRECTORIES = new Set(['src', 'components']);
const PUBLIC_DOCS = new Set(['docs/eula.md']);
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CLASSROOM_EXPIRY = '2099-12-31T23:59:59.000Z';
const INSTRUCTOR_WORKSPACE_IDS = Object.freeze({
  INDIVIDUAL: '11111111-1111-4111-8111-111111111111',
  GROUP: '22222222-2222-4222-8222-222222222222'
});
const classroomWorkspaces = new Map();

const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml'
});


function validCapability(value) {
  return typeof value === 'string' && CAPABILITY_PATTERN.test(value);
}

function bearerToken(request) {
  const header = String(request.headers.authorization || '');
  const match = /^Bearer\s+([A-Za-z0-9_-]{43})$/u.exec(header);
  return match ? match[1] : '';
}

function workspaceTokenForAssignment(assignmentToken) {
  return `w${assignmentToken.slice(1)}`;
}

function freshClassroomSnapshot() {
  const template = TEMPLATE_MANIFEST.find(entry => entry.id === 'checkout-latency');
  return structuredClone(template?.state || {});
}

function getWorkspace(workspaceToken) {
  return classroomWorkspaces.get(workspaceToken) || null;
}

function ensureWorkspace(workspaceToken) {
  let workspace = getWorkspace(workspaceToken);
  if (!workspace) {
    workspace = {
      snapshot: freshClassroomSnapshot(),
      revision: 1,
      teamName: 'Browser Test Workspace',
      participants: new Map()
    };
    classroomWorkspaces.set(workspaceToken, workspace);
  }
  return workspace;
}

function instructorClass() {
  return {
    id: 'browser-test-class',
    title: 'Browser Test Classroom',
    expiresAt: CLASSROOM_EXPIRY
  };
}

function instructorRoster() {
  return {
    class: instructorClass(),
    workspaces: [
      {
        id: INSTRUCTOR_WORKSPACE_IDS.INDIVIDUAL,
        kind: 'individual',
        label: 'Alex Student',
        participantCount: 1,
        activeParticipantCount: 1,
        editingParticipantCount: 1
      },
      {
        id: INSTRUCTOR_WORKSPACE_IDS.GROUP,
        kind: 'group',
        label: 'Team Beta',
        participantCount: 3,
        activeParticipantCount: 2,
        editingParticipantCount: 0
      }
    ]
  };
}

function instructorObservation(workspaceId) {
  const roster = instructorRoster().workspaces;
  const workspaceMeta = roster.find(item => item.id === workspaceId);
  if (!workspaceMeta) return null;
  const snapshot = freshClassroomSnapshot();
  if (!snapshot.pre || typeof snapshot.pre !== 'object') snapshot.pre = {};
  snapshot.pre.oneLine = workspaceId === INSTRUCTOR_WORKSPACE_IDS.INDIVIDUAL
    ? 'Alex Student observed browser-test Intake.'
    : 'Team Beta observed browser-test Intake.';
  return {
    class: instructorClass(),
    workspace: {
      id: workspaceMeta.id,
      kind: workspaceMeta.kind,
      label: workspaceMeta.label,
      teamName: workspaceMeta.label,
      revision: workspaceId === INSTRUCTOR_WORKSPACE_IDS.INDIVIDUAL ? 7 : 11,
      expiresAt: CLASSROOM_EXPIRY,
      updatedAt: '2099-12-31T23:00:00.000Z'
    },
    participants: workspaceId === INSTRUCTOR_WORKSPACE_IDS.INDIVIDUAL
      ? [{
          id: '33333333-3333-4333-8333-333333333333',
          displayName: 'Alex Student',
          activityState: 'editing'
        }]
      : [
          {
            id: '44444444-4444-4444-8444-444444444444',
            displayName: 'Team Member One',
            activityState: 'focused'
          },
          {
            id: '55555555-5555-4555-8555-555555555555',
            displayName: 'Team Member Two',
            activityState: 'active'
          }
        ],
    snapshot
  };
}

async function readJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > 1_000_000) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(status === 204 ? undefined : JSON.stringify(body));
}

function classroomContext(workspaceToken) {
  const suffix = workspaceToken.slice(-8);
  return {
    class: {
      id: `class-${suffix}`,
      title: 'Browser Test Classroom',
      expiresAt: CLASSROOM_EXPIRY
    },
    workspace: {
      id: `workspace-${suffix}`,
      kind: 'individual',
      label: 'Browser Test Workspace',
      expiresAt: CLASSROOM_EXPIRY
    }
  };
}

async function handleClassroomApi(request, response, url) {
  if (url.pathname === '/api/classes/workspaces') {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return true;
    }
    const instructorToken = bearerToken(request);
    if (!validCapability(instructorToken)) {
      sendJson(response, 401, { error: 'Missing or invalid instructor authorization.' });
      return true;
    }
    sendJson(response, 200, instructorRoster());
    return true;
  }

  if (url.pathname === '/api/classes/observe') {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return true;
    }
    const instructorToken = bearerToken(request);
    if (!validCapability(instructorToken)) {
      sendJson(response, 401, { error: 'Missing or invalid instructor authorization.' });
      return true;
    }
    const observation = instructorObservation(url.searchParams.get('workspaceId') || '');
    if (!observation) {
      sendJson(response, 404, { error: 'Workspace not found.' });
      return true;
    }
    sendJson(response, 200, observation);
    return true;
  }

  if (url.pathname === '/api/classes/join') {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return true;
    }
    const classToken = bearerToken(request);
    if (!validCapability(classToken)) {
      sendJson(response, 401, { error: 'Missing or invalid authorization.' });
      return true;
    }
    let body;
    try {
      body = await readJson(request);
    } catch {
      sendJson(response, 400, { error: 'Invalid request body.' });
      return true;
    }
    const assignmentToken = body?.assignmentToken;
    const participantId = typeof body?.participantId === 'string' ? body.participantId : '';
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    if (!validCapability(assignmentToken) || !participantId || !displayName) {
      sendJson(response, 400, { error: 'Invalid classroom admission.' });
      return true;
    }

    const workspaceToken = workspaceTokenForAssignment(assignmentToken);
    ensureWorkspace(workspaceToken);
    const context = classroomContext(workspaceToken);
    sendJson(response, 200, {
      ...context,
      self: { id: participantId, displayName },
      workspaceToken
    });
    return true;
  }

  if (url.pathname === '/api/workspaces/session') {
    const workspaceToken = bearerToken(request);
    const workspace = getWorkspace(workspaceToken);
    if (!workspace) {
      sendJson(response, 404, { error: 'Workspace not found.' });
      return true;
    }

    if (request.method === 'GET') {
      const afterRevision = Number.parseInt(url.searchParams.get('afterRevision') || '0', 10);
      if (Number.isFinite(afterRevision) && afterRevision >= workspace.revision) {
        response.writeHead(204, { 'Cache-Control': 'no-store' });
        response.end();
        return true;
      }
      sendJson(response, 200, {
        snapshot: structuredClone(workspace.snapshot),
        revision: workspace.revision,
        teamName: workspace.teamName
      });
      return true;
    }

    if (request.method === 'PUT') {
      let body;
      try {
        body = await readJson(request);
      } catch {
        sendJson(response, 400, { error: 'Invalid request body.' });
        return true;
      }
      if (!body?.snapshot || body.revision !== workspace.revision) {
        sendJson(response, 409, {
          snapshot: structuredClone(workspace.snapshot),
          revision: workspace.revision,
          teamName: workspace.teamName
        });
        return true;
      }
      workspace.snapshot = structuredClone(body.snapshot);
      workspace.revision += 1;
      sendJson(response, 200, { revision: workspace.revision });
      return true;
    }

    sendJson(response, 405, { error: 'Method not allowed.' });
    return true;
  }

  if (url.pathname === '/api/workspaces/presence') {
    const workspaceToken = bearerToken(request);
    const workspace = getWorkspace(workspaceToken);
    if (!workspace) {
      sendJson(response, 404, { error: 'Workspace not found.' });
      return true;
    }

    if (request.method === 'DELETE') {
      const body = await readJson(request).catch(() => ({}));
      if (body?.participantId) workspace.participants.delete(body.participantId);
      response.writeHead(204, { 'Cache-Control': 'no-store' });
      response.end();
      return true;
    }

    if (request.method === 'PATCH') {
      const body = await readJson(request).catch(() => ({}));
      workspace.teamName = typeof body?.teamName === 'string' && body.teamName.trim()
        ? body.teamName.trim()
        : 'Browser Test Workspace';
    } else if (request.method === 'PUT') {
      const body = await readJson(request).catch(() => ({}));
      const id = typeof body?.participantId === 'string' ? body.participantId : '';
      if (!id) {
        sendJson(response, 400, { error: 'Invalid participant.' });
        return true;
      }
      const participant = {
        id,
        displayName: typeof body?.displayName === 'string' && body.displayName.trim()
          ? body.displayName.trim()
          : 'Student',
        editingField: typeof body?.editingField === 'string' ? body.editingField : '',
        editingRevision: Number.isInteger(body?.editingRevision) ? body.editingRevision : workspace.revision,
        activityState: typeof body?.activityState === 'string' ? body.activityState : 'active',
        activitySequence: Number.isInteger(body?.activitySequence) ? body.activitySequence : 0,
        lastSeenAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString()
      };
      workspace.participants.set(id, participant);
    } else {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return true;
    }

    const participants = [...workspace.participants.values()];
    const requestBody = request.method === 'PUT' ? participants.at(-1) : null;
    sendJson(response, 200, {
      teamName: workspace.teamName,
      self: requestBody,
      participants
    });
    return true;
  }

  if (url.pathname === '/api/classes/coaching/student' && request.method === 'GET') {
    const workspaceToken = bearerToken(request);
    if (!getWorkspace(workspaceToken)) {
      sendJson(response, 404, { error: 'Class feedback not found.' });
      return true;
    }
    const context = classroomContext(workspaceToken);
    sendJson(response, 200, { ...context, feedback: [] });
    return true;
  }

  if (url.pathname === '/api/classes/case-studies/student' && request.method === 'GET') {
    const workspaceToken = bearerToken(request);
    if (!getWorkspace(workspaceToken)) {
      sendJson(response, 404, { error: 'Class resources not found.' });
      return true;
    }
    const context = classroomContext(workspaceToken);
    sendJson(response, 200, { class: context.class, caseStudies: [] });
    return true;
  }

  return false;
}

/**
 * Resolve one request path against the intentional public test surface.
 *
 * @param {string} pathname URL pathname.
 * @returns {string|null} Absolute public file path or null when blocked.
 */
function publicFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  if (!relative || relative.includes('\0')) return null;

  const normalized = relative.replaceAll('\\', '/');
  const firstSegment = normalized.split('/')[0];
  const allowed = ROOT_FILES.has(normalized)
    || PUBLIC_DOCS.has(normalized)
    || PUBLIC_DIRECTORIES.has(firstSegment);
  if (!allowed) return null;

  const absolute = resolve(ROOT, normalized);
  const rootPrefix = ROOT.endsWith(sep) ? ROOT : ROOT + sep;
  return absolute === ROOT || absolute.startsWith(rootPrefix) ? absolute : null;
}

/**
 * Send a small text response.
 *
 * @param {import('node:http').ServerResponse} response HTTP response.
 * @param {number} status Status code.
 * @param {string} body Response body.
 * @returns {void}
 */
function sendText(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8'
  });
  response.end(body);
}

/**
 * Handle one browser-test HTTP request.
 *
 * @param {import('node:http').IncomingMessage} request HTTP request.
 * @param {import('node:http').ServerResponse} response HTTP response.
 * @returns {Promise<void>} Resolves after the response is sent.
 */
async function handleRequest(request, response) {
  const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
  if (url.pathname === '/healthz') {
    sendText(response, 200, 'ok');
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (await handleClassroomApi(request, response, url)) return;
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }

  if (!['GET', 'HEAD'].includes(request.method || '')) {
    sendText(response, 405, 'Method not allowed');
    return;
  }

  const filePath = publicFile(url.pathname);
  if (!filePath) {
    sendText(response, 404, 'Not found');
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': CONTENT_TYPES[extname(filePath)] || 'application/octet-stream'
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') {
      sendText(response, 404, 'Not found');
      return;
    }
    console.error('[browser-test-server] request failed', error);
    sendText(response, 500, 'Internal server error');
  }
}

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`[browser-test-server] http://${HOST}:${PORT}`);
});
