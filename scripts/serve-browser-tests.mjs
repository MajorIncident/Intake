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
import { PROTECTED_CASE_STUDY_MANIFEST } from '../api/protected-case-studies.manifest.js';

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
const LIVE_INSTRUCTOR_TOKEN = `${'i'.repeat(42)}s`;
const LIVE_JOIN_CODE = 'K7FM-P4Q2';
const LIVE_WORKSPACE_IDS = Object.freeze([
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888'
]);
const LIVE_PARTICIPANT_ID = '99999999-9999-4999-8999-999999999999';
const STUDENT_LIVE_JOIN_CODE = 'M7QR-T4P2';
const STUDENT_LIVE_CLASS = Object.freeze({
  id: 'browser-student-live-class',
  title: 'Browser Student Live Classroom',
  expiresAt: CLASSROOM_EXPIRY
});
let liveClassState = null;
let liveInstructorWorkspaces = [];
let liveInstructorParticipants = [];
const liveInstructorWorkspaceStates = new Map();
let studentLiveCounter = 0;
const studentLiveSessions = new Map();
const studentLiveAccessContexts = new Map();
const classroomWorkspaces = new Map();
const classroomCoachingFeedback = new Map();

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

function activeCapability(value, prefix) {
  return validCapability(value)
    && value.startsWith(prefix)
    && !value.endsWith('e')
    && !value.endsWith('r');
}

function activeInstructorCapability(value) {
  return activeCapability(value, 'i');
}

function activeClassJoinCapability(value) {
  return activeCapability(value, 'c');
}

function activeAssignmentCapability(value) {
  return activeCapability(value, 'a');
}

function bearerToken(request) {
  const header = String(request.headers.authorization || '');
  const match = /^Bearer\s+([A-Za-z0-9_-]{43})$/u.exec(header);
  return match ? match[1] : '';
}

function workspaceTokenForAssignment(assignmentToken) {
  return `w${assignmentToken.slice(1)}`;
}

function fixtureCapability(prefix, counter) {
  const suffix = counter.toString(36).padStart(6, '0');
  return `${prefix}${'x'.repeat(42 - suffix.length)}${suffix}`;
}

function studentLiveWorkspaceId(counter, teamNumber) {
  const tail = String(counter * 10 + teamNumber).padStart(12, '0');
  return `${teamNumber === 1 ? 'aaaaaaaa' : 'bbbbbbbb'}-${teamNumber === 1 ? 'aaaa' : 'bbbb'}-4${teamNumber === 1 ? 'aaa' : 'bbb'}-8${teamNumber === 1 ? 'aaa' : 'bbb'}-${tail}`;
}

function revokeStudentLiveAccess(session) {
  if (!session?.activeWorkspaceToken) return;
  classroomWorkspaces.delete(session.activeWorkspaceToken);
  studentLiveAccessContexts.delete(session.activeWorkspaceToken);
  session.activeWorkspaceToken = '';
}

function setStudentLiveAssignment(session, assignment, revision) {
  const previousId = session.assignment?.id || null;
  const nextId = assignment?.id || null;
  if (previousId !== nextId) revokeStudentLiveAccess(session);
  session.assignment = assignment;
  session.assignmentRevision = revision;
}

function studentLiveStatus(session) {
  session.statusReads += 1;
  if (!session.integrated) {
    if (session.assignmentRevision === 0 && session.statusReads >= 2) {
      setStudentLiveAssignment(session, session.teamA, 1);
    } else if (session.assignment?.id === session.teamA.id && session.accessCount >= 2) {
      setStudentLiveAssignment(session, session.teamB, 2);
    } else if (session.assignment?.id === session.teamB.id && session.accessCount >= 3) {
      setStudentLiveAssignment(session, null, 3);
    }
  }
  return {
    class: session.classContext || STUDENT_LIVE_CLASS,
    participant: {
      id: session.participantId,
      displayName: session.displayName,
      assignmentRevision: session.assignmentRevision
    },
    assignment: session.assignment ? structuredClone(session.assignment) : null
  };
}

function issueStudentLiveAccess(session) {
  revokeStudentLiveAccess(session);
  session.accessCount += 1;
  const workspaceToken = fixtureCapability('u', ++studentLiveCounter);
  const assignment = session.assignment;
  const workspaceState = session.workspaceStates.get(assignment.id);
  classroomWorkspaces.set(workspaceToken, workspaceState);
  studentLiveAccessContexts.set(workspaceToken, {
    class: session.classContext || STUDENT_LIVE_CLASS,
    workspace: {
      ...assignment,
      expiresAt: CLASSROOM_EXPIRY
    }
  });
  session.activeWorkspaceToken = workspaceToken;
  return workspaceToken;
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
      snapshot: instructorObservation(instructorWorkspaceIdForToken(workspaceToken))?.snapshot || freshClassroomSnapshot(),
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
    joinCode: 'K7FMP4Q2',
    expiresAt: CLASSROOM_EXPIRY
  };
}

function liveInstructorClass() {
  return liveClassState || {
    id: 'browser-live-class',
    title: 'Browser Live Classroom',
    joinCode: 'K7FMP4Q2',
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

function instructorParticipants() {
  return {
    class: instructorClass(),
    participants: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        displayName: 'Alex Student',
        assignmentRevision: 1,
        joinedAt: '2099-12-31T20:00:00.000Z',
        updatedAt: '2099-12-31T20:00:00.000Z',
        assignment: {
          id: INSTRUCTOR_WORKSPACE_IDS.INDIVIDUAL,
          kind: 'individual',
          label: 'Alex Student'
        }
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        displayName: 'Waiting Student',
        assignmentRevision: 0,
        joinedAt: '2099-12-31T20:01:00.000Z',
        updatedAt: '2099-12-31T20:01:00.000Z',
        assignment: null
      }
    ]
  };
}

function liveInstructorRoster() {
  return {
    class: liveInstructorClass(),
    workspaces: liveInstructorWorkspaces.map(workspace => ({
      ...workspace,
      participantCount: liveInstructorParticipants.filter(participant => participant.assignment?.id === workspace.id).length,
      activeParticipantCount: 0,
      editingParticipantCount: 0
    }))
  };
}

function liveInstructorParticipantRoster() {
  return {
    class: liveInstructorClass(),
    participants: structuredClone(liveInstructorParticipants)
  };
}

function liveInstructorObservation(workspaceId) {
  const workspace = liveInstructorWorkspaces.find(item => item.id === workspaceId);
  const state = liveInstructorWorkspaceStates.get(workspaceId);
  if (!workspace || !state) return null;
  return {
    class: liveInstructorClass(),
    workspace: {
      id: workspace.id,
      kind: workspace.kind,
      label: workspace.label,
      teamName: state.teamName,
      revision: state.revision,
      expiresAt: CLASSROOM_EXPIRY,
      updatedAt: '2099-12-31T23:00:00.000Z'
    },
    participants: liveInstructorParticipants
      .filter(participant => participant.assignment?.id === workspaceId)
      .map(participant => ({
        id: participant.id,
        displayName: participant.displayName,
        activityState: 'active'
      })),
    snapshot: structuredClone(state.snapshot)
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

function instructorWorkspaceIdForToken(workspaceToken) {
  return workspaceToken.endsWith('m')
    ? INSTRUCTOR_WORKSPACE_IDS.GROUP
    : INSTRUCTOR_WORKSPACE_IDS.INDIVIDUAL;
}

function classroomContext(workspaceToken) {
  const liveContext = studentLiveAccessContexts.get(workspaceToken);
  if (liveContext) return structuredClone(liveContext);
  const suffix = workspaceToken.slice(-8);
  return {
    class: {
      id: `class-${suffix}`,
      title: 'Browser Test Classroom',
      expiresAt: CLASSROOM_EXPIRY
    },
    workspace: {
      id: instructorWorkspaceIdForToken(workspaceToken),
      kind: workspaceToken.endsWith('m') ? 'group' : 'individual',
      label: 'Browser Test Workspace',
      expiresAt: CLASSROOM_EXPIRY
    }
  };
}

async function handleClassroomApi(request, response, url) {
  if (url.pathname === '/api/classes/admit') {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return true;
    }
    const body = await readJson(request).catch(() => null);
    const joinCode = typeof body?.joinCode === 'string'
      ? body.joinCode.trim().toUpperCase().replace(/[\s-]+/gu, '')
      : '';
    const isolatedCode = STUDENT_LIVE_JOIN_CODE.replace('-', '');
    const integratedCode = LIVE_JOIN_CODE.replace('-', '');
    const participantId = typeof body?.participantId === 'string' ? body.participantId : '';
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    if (![isolatedCode, integratedCode].includes(joinCode) || !participantId || !displayName) {
      sendJson(response, 404, { error: 'Class not available.' });
      return true;
    }

    const sequence = ++studentLiveCounter;
    const studentSessionToken = fixtureCapability('l', sequence);
    let session;

    if (joinCode === integratedCode && liveClassState) {
      session = {
        participantId,
        displayName,
        assignmentRevision: 0,
        assignment: null,
        workspaceStates: liveInstructorWorkspaceStates,
        classContext: liveInstructorClass(),
        integrated: true,
        statusReads: 0,
        accessCount: 0,
        activeWorkspaceToken: ''
      };
      liveInstructorParticipants.push({
        id: participantId,
        displayName,
        assignmentRevision: 0,
        joinedAt: '2099-12-31T20:05:00.000Z',
        updatedAt: '2099-12-31T20:05:00.000Z',
        assignment: null
      });
    } else if (joinCode === isolatedCode) {
      const teamA = {
        id: studentLiveWorkspaceId(sequence, 1),
        kind: 'group',
        label: 'Team Alpha'
      };
      const teamB = {
        id: studentLiveWorkspaceId(sequence, 2),
        kind: 'group',
        label: 'Team Beta'
      };
      const makeWorkspaceState = label => {
        const snapshot = freshClassroomSnapshot();
        if (!snapshot.pre || typeof snapshot.pre !== 'object') snapshot.pre = {};
        snapshot.pre.oneLine = `${label} destination Intake.`;
        return {
          snapshot,
          revision: 1,
          teamName: label,
          participants: new Map()
        };
      };
      session = {
        participantId,
        displayName,
        assignmentRevision: 0,
        assignment: null,
        teamA,
        teamB,
        workspaceStates: new Map([
          [teamA.id, makeWorkspaceState(teamA.label)],
          [teamB.id, makeWorkspaceState(teamB.label)]
        ]),
        statusReads: 0,
        accessCount: 0,
        activeWorkspaceToken: ''
      };
    } else {
      sendJson(response, 404, { error: 'Class not available.' });
      return true;
    }

    studentLiveSessions.set(studentSessionToken, session);
    sendJson(response, 200, {
      class: session.classContext || STUDENT_LIVE_CLASS,
      participant: {
        id: participantId,
        displayName,
        assignmentRevision: 0
      },
      assignment: null,
      studentSessionToken
    });
    return true;
  }

  if (url.pathname === '/api/classes/student') {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return true;
    }
    const studentSessionToken = bearerToken(request);
    const session = studentLiveSessions.get(studentSessionToken);
    if (!session) {
      sendJson(response, 404, { error: 'Student class session not found.' });
      return true;
    }
    sendJson(response, 200, studentLiveStatus(session));
    return true;
  }

  if (url.pathname === '/api/classes/student/access') {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return true;
    }
    const studentSessionToken = bearerToken(request);
    const session = studentLiveSessions.get(studentSessionToken);
    if (!session) {
      sendJson(response, 404, { error: 'Student class session not found.' });
      return true;
    }
    if (!session.assignment) {
      sendJson(response, 409, {
        status: 'waiting',
        class: session.classContext || STUDENT_LIVE_CLASS,
        participant: {
          id: session.participantId,
          displayName: session.displayName,
          assignmentRevision: session.assignmentRevision
        },
        assignment: null
      });
      return true;
    }
    const workspaceToken = issueStudentLiveAccess(session);
    sendJson(response, 200, {
      class: session.classContext || STUDENT_LIVE_CLASS,
      participant: {
        id: session.participantId,
        displayName: session.displayName,
        assignmentRevision: session.assignmentRevision
      },
      assignment: structuredClone(session.assignment),
      workspaceToken
    });
    return true;
  }

  if (url.pathname === '/api/classes') {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return true;
    }
    const body = await readJson(request).catch(() => null);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) {
      sendJson(response, 400, { error: 'Invalid class title.' });
      return true;
    }
    liveClassState = {
      id: 'browser-live-class',
      title,
      joinCode: 'K7FMP4Q2',
      expiresAt: CLASSROOM_EXPIRY
    };
    liveInstructorWorkspaces = [];
    liveInstructorWorkspaceStates.clear();
    liveInstructorParticipants = [{
      id: LIVE_PARTICIPANT_ID,
      displayName: 'Waiting Student',
      assignmentRevision: 0,
      joinedAt: '2099-12-31T20:00:00.000Z',
      updatedAt: '2099-12-31T20:00:00.000Z',
      assignment: null
    }];
    sendJson(response, 201, {
      class: liveInstructorClass(),
      instructorToken: LIVE_INSTRUCTOR_TOKEN,
      studentJoinToken: `${'c'.repeat(42)}s`,
      joinCode: LIVE_JOIN_CODE
    });
    return true;
  }

  if (url.pathname === '/api/classes/workspaces') {
    const instructorToken = bearerToken(request);
    if (!activeInstructorCapability(instructorToken)) {
      sendJson(response, 401, { error: 'Missing or invalid instructor authorization.' });
      return true;
    }

    if (request.method === 'GET') {
      sendJson(response, 200, instructorToken === LIVE_INSTRUCTOR_TOKEN
        ? liveInstructorRoster()
        : instructorRoster());
      return true;
    }

    if (request.method === 'POST' && instructorToken === LIVE_INSTRUCTOR_TOKEN) {
      const body = await readJson(request).catch(() => null);
      const kind = ['group', 'individual'].includes(body?.kind) ? body.kind : '';
      const label = typeof body?.label === 'string' ? body.label.trim() : '';
      if (!kind || !label || !body?.snapshot || typeof body.snapshot !== 'object') {
        sendJson(response, 400, { error: 'Invalid workspace request.' });
        return true;
      }
      const id = LIVE_WORKSPACE_IDS[liveInstructorWorkspaces.length];
      if (!id) {
        sendJson(response, 409, { error: 'Browser fixture workspace limit reached.' });
        return true;
      }
      const workspace = {
        id,
        kind,
        label,
        createdAt: '2099-12-31T21:00:00.000Z',
        participantCount: 0,
        activeParticipantCount: 0,
        editingParticipantCount: 0
      };
      liveInstructorWorkspaces.push(workspace);
      const snapshot = freshClassroomSnapshot();
      if (!snapshot.pre || typeof snapshot.pre !== 'object') snapshot.pre = {};
      snapshot.pre.oneLine = `${workspace.label} live-class Intake.`;
      liveInstructorWorkspaceStates.set(workspace.id, {
        snapshot,
        revision: 1,
        teamName: workspace.label,
        participants: new Map()
      });
      sendJson(response, 201, {
        workspace,
        assignmentToken: `${'a'.repeat(42)}${String(liveInstructorWorkspaces.length).slice(-1)}`
      });
      return true;
    }

    sendJson(response, 405, { error: 'Method not allowed.' });
    return true;
  }

  if (url.pathname === '/api/classes/participants') {
    const instructorToken = bearerToken(request);
    if (!activeInstructorCapability(instructorToken)) {
      sendJson(response, 401, { error: 'Missing or invalid instructor authorization.' });
      return true;
    }

    if (request.method === 'GET') {
      sendJson(response, 200, instructorToken === LIVE_INSTRUCTOR_TOKEN
        ? liveInstructorParticipantRoster()
        : instructorParticipants());
      return true;
    }

    if (request.method === 'PATCH' && instructorToken === LIVE_INSTRUCTOR_TOKEN) {
      const body = await readJson(request).catch(() => null);
      const participant = liveInstructorParticipants.find(item => item.id === body?.participantId);
      const workspace = body?.workspaceId === null
        ? null
        : liveInstructorWorkspaces.find(item => item.id === body?.workspaceId);
      if (!participant || (body?.workspaceId !== null && !workspace)) {
        sendJson(response, 404, { error: 'Participant or workspace not found.' });
        return true;
      }
      const unchanged = (participant.assignment?.id || null) === (workspace?.id || null);
      if (!unchanged) {
        participant.assignmentRevision += 1;
        participant.assignment = workspace
          ? { id: workspace.id, kind: workspace.kind, label: workspace.label }
          : null;
        participant.updatedAt = '2099-12-31T22:00:00.000Z';

        const liveSession = [...studentLiveSessions.values()].find(session => (
          session.integrated && session.participantId === participant.id
        ));
        if (liveSession) {
          setStudentLiveAssignment(
            liveSession,
            participant.assignment ? structuredClone(participant.assignment) : null,
            participant.assignmentRevision
          );
        }
      }
      sendJson(response, 200, {
        class: liveInstructorClass(),
        participant: structuredClone(participant),
        assignment: structuredClone(participant.assignment),
        changed: !unchanged
      });
      return true;
    }

    sendJson(response, 405, { error: 'Method not allowed.' });
    return true;
  }

  if (url.pathname === '/api/classes/observe') {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return true;
    }
    const instructorToken = bearerToken(request);
    if (!activeInstructorCapability(instructorToken)) {
      sendJson(response, 401, { error: 'Missing or invalid instructor authorization.' });
      return true;
    }
    const workspaceId = url.searchParams.get('workspaceId') || '';
    const observation = instructorToken === LIVE_INSTRUCTOR_TOKEN
      ? liveInstructorObservation(workspaceId)
      : instructorObservation(workspaceId);
    if (!observation) {
      sendJson(response, 404, { error: 'Workspace not found.' });
      return true;
    }
    sendJson(response, 200, observation);
    return true;
  }

  if (url.pathname === '/api/classes/coaching') {
    const instructorToken = bearerToken(request);
    if (!activeInstructorCapability(instructorToken)) {
      sendJson(response, 401, { error: 'Missing or invalid instructor authorization.' });
      return true;
    }
    const workspaceId = url.searchParams.get('workspaceId') || '';
    const legacyWorkspace = instructorRoster().workspaces.find(item => item.id === workspaceId) || null;
    const liveWorkspace = instructorToken === LIVE_INSTRUCTOR_TOKEN
      ? liveInstructorWorkspaces.find(item => item.id === workspaceId) || null
      : null;
    const workspace = liveWorkspace || legacyWorkspace;
    if (!workspace) {
      sendJson(response, 404, { error: 'Workspace not found.' });
      return true;
    }
    const workspaceFeedback = classroomCoachingFeedback.get(workspaceId) || new Map();

    if (request.method === 'GET') {
      sendJson(response, 200, {
        class: liveWorkspace ? liveInstructorClass() : instructorClass(),
        workspace,
        feedback: [...workspaceFeedback.values()]
      });
      return true;
    }

    if (request.method === 'PUT') {
      const body = await readJson(request).catch(() => null);
      if (!body || typeof body.targetId !== 'string' || !['meets-standard', 'needs-improvement'].includes(body.status)) {
        sendJson(response, 400, { error: 'Invalid coaching feedback.' });
        return true;
      }
      const previous = workspaceFeedback.get(body.targetId);
      const record = {
        targetId: body.targetId,
        status: body.status,
        note: typeof body.note === 'string' ? body.note : '',
        reviewedWorkspaceRevision: Number.isInteger(body.reviewedWorkspaceRevision)
          ? body.reviewedWorkspaceRevision
          : 1,
        reviewedFieldFingerprint: typeof body.reviewedFieldFingerprint === 'string'
          ? body.reviewedFieldFingerprint
          : '',
        feedbackRevision: (previous?.feedbackRevision || 0) + 1,
        createdAt: previous?.createdAt || '2099-12-31T22:00:00.000Z',
        updatedAt: '2099-12-31T22:30:00.000Z'
      };
      workspaceFeedback.set(record.targetId, record);
      classroomCoachingFeedback.set(workspaceId, workspaceFeedback);
      sendJson(response, 200, { feedback: record });
      return true;
    }

    if (request.method === 'DELETE') {
      const body = await readJson(request).catch(() => ({}));
      const cleared = typeof body?.targetId === 'string' && workspaceFeedback.delete(body.targetId);
      classroomCoachingFeedback.set(workspaceId, workspaceFeedback);
      sendJson(response, 200, { cleared });
      return true;
    }

    sendJson(response, 405, { error: 'Method not allowed.' });
    return true;
  }

  if (url.pathname === '/api/classes/coaching/student') {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return true;
    }
    const workspaceToken = bearerToken(request);
    if (!getWorkspace(workspaceToken)) {
      sendJson(response, 404, { error: 'Class feedback not found.' });
      return true;
    }
    const context = classroomContext(workspaceToken);
    const workspaceFeedback = classroomCoachingFeedback.get(context.workspace.id) || new Map();
    sendJson(response, 200, {
      ...context,
      feedback: [...workspaceFeedback.values()]
    });
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
    if (!activeClassJoinCapability(classToken)) {
      sendJson(response, 404, { error: 'Class assignment not found.' });
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
    if (!activeAssignmentCapability(assignmentToken)) {
      sendJson(response, 404, { error: 'Class assignment not found.' });
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

  if (url.pathname === '/api/classes/case-studies' || url.pathname === '/api/classes/case-studies/student') {
    const token = bearerToken(request);
    const isInstructorRequest = url.pathname === '/api/classes/case-studies';
    const authorized = isInstructorRequest
      ? activeInstructorCapability(token)
      : Boolean(getWorkspace(token));

    if (!authorized) {
      sendJson(response, 404, { error: 'Class resources not found.' });
      return true;
    }

    const caseStudies = PROTECTED_CASE_STUDY_MANIFEST.map(({ state: _state, ...metadata }) => structuredClone(metadata));

    if (request.method === 'GET') {
      const context = isInstructorRequest ? { class: instructorClass() } : classroomContext(token);
      sendJson(response, 200, { class: context.class, caseStudies });
      return true;
    }

    if (request.method === 'POST') {
      const body = await readJson(request).catch(() => null);
      const caseStudyId = typeof body?.caseStudyId === 'string' ? body.caseStudyId.trim() : '';
      const record = PROTECTED_CASE_STUDY_MANIFEST.find(item => item.id === caseStudyId);
      if (!record) {
        sendJson(response, 404, { error: 'Case Study not found.' });
        return true;
      }
      sendJson(response, 200, { caseStudy: structuredClone(record) });
      return true;
    }

    sendJson(response, 405, { error: 'Method not allowed.' });
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
