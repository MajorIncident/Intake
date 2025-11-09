#!/usr/bin/env node
/**
 * Guard script that verifies feature changes include matching test updates.
 *
 * When runtime code under `src/` or `components/` is modified without touching
 * any test files beneath `tests/` (matching the `*.test.mjs` convention), this script will scaffold placeholders based
 * on `tests/template.feature.test.mjs` so contributors have a starting point.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Execute a Git command and return the trimmed stdout.
 * @param {string} command Git command string to run against the current repository.
 * @returns {string} The command's stdout with surrounding whitespace removed.
 */
function runGit(command) {
  return execSync(command, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
}

const baseRef = process.env.GITHUB_BASE_REF || 'main';
let diffTarget = `origin/${baseRef}`;

try {
  runGit(`git rev-parse --verify ${diffTarget}`);
} catch (error) {
  diffTarget = baseRef;
}

const diffCommand = `git diff --name-only ${diffTarget}...HEAD`;
let diffOutput = '';

try {
  diffOutput = runGit(diffCommand);
} catch (error) {
  try {
    diffOutput = runGit('git status --porcelain');
    if (diffOutput) {
      diffOutput = diffOutput
        .split('\n')
        .map((line) => line.slice(3))
        .map((segment) => segment.split(' -> ').pop())
        .filter(Boolean)
        .join('\n');
      console.warn('[verify:tests] Falling back to working tree changes because the base branch was unavailable.');
    }
  } catch (statusError) {
    console.error('[verify:tests] Unable to compute the diff against the base branch.');
    console.error('Ensure the target branch exists locally (e.g. fetch it) and rerun the guard.');
    process.exit(1);
  }
}
const changedFiles = diffOutput === '' ? [] : diffOutput.split('\n');

const runtimeChanges = changedFiles.filter((filePath) => {
  return filePath.startsWith('src/') || filePath.startsWith('components/');
});

if (runtimeChanges.length === 0) {
  process.exit(0);
}

const changedTests = changedFiles.filter((filePath) => {
  return filePath.startsWith('tests/') && filePath.endsWith('.test.mjs');
});

if (changedTests.length > 0) {
  process.exit(0);
}

const ci = String(process.env.CI).toLowerCase() === 'true';
const templatePath = path.resolve('tests/template.feature.test.mjs');
let template = '';

try {
  template = readFileSync(templatePath, 'utf8');
} catch (error) {
  console.error(`[verify:tests] Missing template at ${templatePath}.`);
  console.error('Restore `tests/template.feature.test.mjs` before running the guard.');
  process.exit(1);
}
const outputDir = path.resolve('tests/auto-generated');
mkdirSync(outputDir, { recursive: true });

const created = [];

runtimeChanges.forEach((runtimePath) => {
  const fileName = runtimePath
    .replace(/^src\//, '')
    .replace(/^components\//, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/]+/g, '-');
  const targetPath = path.join(outputDir, `${fileName}.feature.test.mjs`);

  if (!existsSync(targetPath) && !ci) {
    const stubBanner = `/**\n * Auto-generated stub for ${runtimePath}.\n * Replace the skipped test with assertions that cover the change.\n */\n`;
    writeFileSync(targetPath, `${stubBanner}\n${template}`);
    created.push(path.relative(process.cwd(), targetPath));
  } else if (!existsSync(targetPath)) {
    created.push(path.relative(process.cwd(), targetPath));
  }
});

if (ci) {
  if (created.length === 0) {
    console.error('Runtime files changed but no tests were updated.');
  } else {
    console.error('Runtime files changed but no tests were updated.');
    console.error('Expected new test stubs at:');
    created.forEach((filePath) => console.error(`  - ${filePath}`));
    console.error('Run "npm run verify:tests" locally to generate the placeholders and commit them with real assertions.');
  }
  process.exit(1);
}

if (created.length === 0) {
  console.error('Runtime files changed but tests were not updated.');
  console.error('Create coverage by copying tests/template.feature.test.mjs or rerun this script after staging your changes.');
  process.exit(1);
}

console.log('Generated the following test stubs. Replace the skipped test with real coverage:');
created.forEach((filePath) => console.log(`  - ${filePath}`));
console.log('Re-run "npm run verify:tests" once the tests assert the behaviour to ensure the guard passes.');
process.exit(1);
