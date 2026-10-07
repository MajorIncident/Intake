/**
 * @fileoverview Guard the Vercel Hobby Serverless Function budget.
 *
 * Vercel treats JavaScript files under api/ as potential function entrypoints.
 * Server-only helper modules in this repository are prefixed with "_" and are
 * bundled into the public entrypoints instead. Count every other api/*.js file
 * conservatively so deployment cannot exceed the Hobby plan limit unnoticed.
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERCEL_HOBBY_FUNCTION_LIMIT = 12;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * List conservative Vercel function candidates below an API directory.
 *
 * @param {string} apiDirectory Absolute or relative api/ path.
 * @returns {Promise<string[]>} Sorted repo-relative candidate paths.
 */
export async function listVercelFunctionCandidates(apiDirectory = 'api') {
  const root = path.resolve(apiDirectory);
  const files = await walk(root);
  return files
    .filter(file => file.endsWith('.js'))
    .filter(file => !path.basename(file).startsWith('_'))
    .map(file => path.relative(process.cwd(), file).split(path.sep).join('/'))
    .sort();
}

/**
 * Verify the conservative Vercel function count stays within budget.
 *
 * @param {object} [options] Verification options.
 * @param {string} [options.apiDirectory] API directory.
 * @param {number} [options.limit] Maximum allowed functions.
 * @returns {Promise<string[]>} Candidate paths when valid.
 */
export async function verifyVercelFunctionBudget({
  apiDirectory = 'api',
  limit = VERCEL_HOBBY_FUNCTION_LIMIT
} = {}) {
  const candidates = await listVercelFunctionCandidates(apiDirectory);
  if (candidates.length > limit) {
    throw new Error(
      `Vercel function budget exceeded: ${candidates.length}/${limit}.\n`
      + candidates.map(item => `- ${item}`).join('\n')
    );
  }
  return candidates;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    const candidates = await verifyVercelFunctionBudget();
    console.log(
      `[verify:vercel-functions] ${candidates.length}/${VERCEL_HOBBY_FUNCTION_LIMIT} conservative function candidates.\n`
      + candidates.map(item => `- ${item}`).join('\n')
    );
  } catch (error) {
    console.error(`[verify:vercel-functions] ${error.message}`);
    process.exitCode = 1;
  }
}
