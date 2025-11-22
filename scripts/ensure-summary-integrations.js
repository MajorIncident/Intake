#!/usr/bin/env node
/**
 * @fileoverview CLI guard invoked via `npm run verify:summary`.
 * Ensures newly added UI controls stay wired into the Copy & Paste Summary
 * output and receive styling updates. The script inspects diffs for added
 * form fields/options under core interface files. When it finds new
 * controls, it verifies that summary logic, summary-focused tests, or
 * supporting documentation were touched, and that styling updates (or
 * notes) accompany the change.
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
  runGit(`git rev-parse --verify ${diffTarget}`, { quiet: true });
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
        console.warn('[verify:summary] Falling back to working tree changes because the base branch was unavailable.');
      }
    } catch (statusError) {
      console.error('[verify:summary] Unable to compute the diff against the base branch.');
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
  const targets = ['index.html', 'styles.css', 'src', 'components'];
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
const newControlLines = addedInterfaceLines.filter((line) => {
  return /<(input|textarea|select|option)\b/i.test(line) || /class="[^"]*(field|select|picker|dropdown)[^"]*"/i.test(line);
});

if (newControlLines.length === 0) {
  process.exit(0);
}

const summaryTouched = changedFiles.some((filePath) => {
  return (
    filePath === 'src/summary.js' ||
    (filePath.startsWith('tests/') && filePath.includes('summary')) ||
    filePath === 'docs/summary-style-checklist.md'
  );
});

const stylingTouched = changedFiles.some((filePath) => {
  return filePath === 'styles.css' || filePath === 'docs/summary-style-checklist.md';
});

const failures = [];

if (!summaryTouched) {
  failures.push('Add summary wiring, tests, or documentation so the new fields contribute to the Copy & Paste Summary output.');
}

if (!stylingTouched) {
  failures.push('Update styles.css or document the visual approach to keep new controls Apple-like and readable.');
}

if (failures.length === 0) {
  process.exit(0);
}

console.error('[verify:summary] New form controls or options detected without required follow-up.');
console.error('Lines that triggered this check:');
newControlLines.slice(0, 20).forEach((line) => console.error(`  ${line}`));
if (newControlLines.length > 20) {
  console.error(`  ...and ${newControlLines.length - 20} more`);
}
console.error('\nRemediation steps:');
failures.forEach((message) => console.error(`- ${message}`));
console.error('- See docs/summary-style-checklist.md for the full checklist.');
process.exit(1);
