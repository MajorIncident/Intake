/**
 * Vercel Classroom routing and function-budget regression coverage.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

import {
  VERCEL_HOBBY_FUNCTION_LIMIT,
  listVercelFunctionCandidates
} from '../scripts/verify-vercel-function-budget.mjs';

const EXPECTED_CLASSROOM_REWRITES = Object.freeze({
  '/api/classes': 'root',
  '/api/classes/admit': 'admit',
  '/api/classes/join': 'join',
  '/api/classes/participants': 'participants',
  '/api/classes/student': 'student',
  '/api/classes/student/access': 'student-access',
  '/api/classes/workspaces': 'workspaces',
  '/api/classes/observe': 'observe',
  '/api/classes/debrief': 'debrief',
  '/api/classes/coaching': 'coaching',
  '/api/classes/coaching/student': 'coaching-student',
  '/api/classes/case-studies': 'case-studies',
  '/api/classes/case-studies/student': 'case-studies-student',
  '/api/classes/exercise': 'exercise',
  '/api/classes/exercise/checkpoint': 'exercise-checkpoint',
  '/api/classes/exercise/student': 'exercise-student',
  '/api/classes/exercise/student/ready': 'exercise-student-ready'
});

test('Vercel preserves every Classroom public URL through the consolidated function', async () => {
  const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
  const actual = Object.fromEntries(
    vercel.rewrites
      .filter(item => item.source.startsWith('/api/classes'))
      .map(item => {
        const destination = new URL(item.destination, 'https://intake.test');
        return [item.source, destination.searchParams.get('__classroomRoute')];
      })
  );

  assert.deepEqual(actual, EXPECTED_CLASSROOM_REWRITES);
  for (const rewrite of vercel.rewrites.filter(item => item.source.startsWith('/api/classes'))) {
    assert.equal(rewrite.destination.startsWith('/api/classroom?'), true);
  }
});

test('legacy Classroom wrapper directory has no deployable JavaScript entrypoints', async () => {
  async function jsFiles(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    const found = [];
    for (const entry of entries) {
      const fullPath = `${directory}/${entry.name}`;
      if (entry.isDirectory()) found.push(...await jsFiles(fullPath));
      else if (entry.isFile() && entry.name.endsWith('.js')) found.push(fullPath);
    }
    return found;
  }

  assert.deepEqual(await jsFiles('api/classes'), []);
});

test('repository stays below the conservative Vercel Hobby function budget', async () => {
  const candidates = await listVercelFunctionCandidates('api');
  assert.equal(candidates.length <= VERCEL_HOBBY_FUNCTION_LIMIT, true);
  assert.deepEqual(candidates, [
    'api/classroom.js',
    'api/protected-case-studies.manifest.js',
    'api/workspaces/index.js',
    'api/workspaces/presence.js',
    'api/workspaces/session.js'
  ]);
});
