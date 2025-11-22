#!/usr/bin/env node
/**
 * @fileoverview Guard invoked via `npm run verify:persistence`.
 * Ensures newly added form controls or captions are paired with
 * persistence wiring so user input continues to save and load.
 * The script scans diffs for new controls within core interface files
 * and fails the build when collectors, serializers, or template states
 * are untouched. Use it alongside `update:storage-docs` to keep schema
 * documentation accurate.
 */
import { execSync } from 'node:child_process';

/**
 * Run a Git command and return trimmed stdout.
 * @param {string} command - Git command to execute.
 * @param {{quiet?: boolean}} [options] - Optional execution settings.
 * @returns {string} Command stdout without leading/trailing whitespace.
 */
function runGit(command, options = {}) {
  const stdio = options.quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'inherit'];
  return execSync(command, { stdio }).toString().trim();
}

const baseRef = process.env.GITHUB_BASE_REF || 'main';
let diffTarget = `origin/${baseRef}`;

try {
  runGit(`git rev-parse --verify ${diffTarget}`);
} catch (error) {
  diffTarget = baseRef;
}

/**
 * Compute the list of changed files against the diff target.
 * @returns {string[]} Array of changed file paths.
 */
function getChangedFiles() {
  let output = '';
  try {
    output = runGit(`git diff --name-only ${diffTarget}...HEAD`, { quiet: true });
  } catch (error) {
    try {
      output = runGit('git status --porcelain');
      if (output) {
        output = output
          .split('\n')
          .map((line) => line.slice(3))
          .map((segment) => segment.split(' -> ').pop())
          .filter(Boolean)
          .join('\n');
        console.warn('[verify:persistence] Falling back to working tree changes because the base branch was unavailable.');
      }
    } catch (statusError) {
      console.error('[verify:persistence] Unable to compute the diff against the base branch.');
      console.error('Ensure the target branch exists locally (e.g. fetch it) and rerun the guard.');
      process.exit(1);
    }
  }
  return output === '' ? [] : output.split('\n');
}

const changedFiles = getChangedFiles();

/**
 * Collect added lines from interface-related files.
 * @returns {string[]} Added diff lines that may contain new controls.
 */
function getInterfaceAdditions() {
  const targets = ['index.html', 'src', 'components'];
  const diffCommand = `git diff ${diffTarget}...HEAD --unified=0 -- ${targets.join(' ')}`;
  let diff = '';
  try {
    diff = runGit(diffCommand, { quiet: true });
  } catch (error) {
    try {
      diff = runGit(`git diff --unified=0 -- ${targets.join(' ')}`, { quiet: true });
    } catch (statusError) {
      return [];
    }
  }
  return diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'));
}

const addedInterfaceLines = getInterfaceAdditions();
const triggerLines = addedInterfaceLines.filter((line) => {
  return (
    /<(input|textarea|select|option|button|label)\b/i.test(line) ||
    /class="[^"]*(field|select|picker|dropdown|control)[^"]*"/i.test(line) ||
    /createElement\(['"](?:input|textarea|select|option|button|label)['"]\)/i.test(line) ||
    /class(Name)?\s*=\s*['"][^'"\n]*caption[^'"\n]*['"]/i.test(line) ||
    /classList\.add\(['"][^'"]*caption[^'"]*['"]\)/i.test(line)
  );
});

if (triggerLines.length === 0) {
  process.exit(0);
}

const appStateTouched = changedFiles.includes('src/appState.js');
const storageTouched = changedFiles.includes('src/storage.js');
const templatesTouched = changedFiles.some((filePath) => filePath.startsWith('templates/'));

const failures = [];
const reminders = [];

if (!appStateTouched) {
  failures.push('Extend collect/apply logic in src/appState.js so new inputs read/write state.');
}

if (!storageTouched) {
  failures.push('Update serialization in src/storage.js (and storage docs) to persist the new fields.');
}

if (!templatesTouched) {
  reminders.push('Refresh any prefilled template JSON under templates/ so saved payloads include the new data.');
}

if (failures.length === 0) {
  if (reminders.length > 0) {
    console.warn('[verify:persistence] Detected new controls. Update templates/ defaults if they should ship prefilled.');
  }
  process.exit(0);
}

console.error('[verify:persistence] New controls or captions detected without matching persistence updates.');
console.error('Lines that triggered this check:');
triggerLines.slice(0, 20).forEach((line) => console.error(`  ${line}`));
if (triggerLines.length > 20) {
  console.error(`  ...and ${triggerLines.length - 20} more`);
}
console.error('\nRemediation steps:');
failures.forEach((message) => console.error(`- ${message}`));
reminders.forEach((message) => console.error(`- ${message}`));
console.error('- Run npm run update:storage-docs after updating storage to keep docs/storage-schema.md in sync.');
process.exit(1);
