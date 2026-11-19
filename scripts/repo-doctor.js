#!/usr/bin/env node
/**
 * Repository health guard for conventions that should remain true across human
 * and AI-authored changes. Keep this deterministic: it validates repository
 * contracts but never modifies files.
 */
import fs from 'node:fs';

const failures = [];
const requiredFiles = [
  '.nvmrc',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'docs/AI-ONBOARDING.md',
  'docs/architecture-overview.md',
  'docs/REPOSITORY-OPERATIONS.md',
  'docs/classroom-architecture.md',
  'docs/classroom-api.md',
  'docs/classroom-roadmap.md',
  'docs/classroom-workstream.md',
  'STATUS.md',
  'docs/playbooks/README.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/dependabot.yml'
];

for (const path of requiredFiles) {
  if (!fs.existsSync(path)) failures.push(`missing required repository file: ${path}`);
}

const nodeVersion = fs.readFileSync('.nvmrc', 'utf8').trim();
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (nodeVersion !== '24') failures.push(`.nvmrc must contain 24, found "${nodeVersion}"`);
if (pkg.engines?.node !== '24.x') failures.push('package.json engines.node must be 24.x');
if (!pkg.scripts?.quality) failures.push('package.json must define npm run quality');

const workflowDir = '.github/workflows';
for (const name of fs.readdirSync(workflowDir).filter((entry) => /\.ya?ml$/.test(entry))) {
  const path = `${workflowDir}/${name}`;
  const content = fs.readFileSync(path, 'utf8');
  const mutableActionRefs = [...content.matchAll(/uses:\s+[^\s#]+@(v\d+|main|master)\b/g)].map((match) => match[0]);
  if (mutableActionRefs.length) {
    failures.push(`${path} contains mutable action refs: ${mutableActionRefs.join(', ')}`);
  }
  if (/node-version:\s*['"]?20/.test(content)) {
    failures.push(`${path} still selects Node 20`);
  }
}

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'test-results', 'playwright-report']);

/**
 * Lists Markdown files that describe the current repository (archive excluded).
 * @param {string} dir - Directory to scan.
 * @returns {string[]} Repository-relative Markdown paths.
 */
function currentMarkdownFiles(dir = '.') {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const path = dir === '.' ? entry.name : `${dir}/${entry.name}`;
    if (path === 'docs/archive') continue;
    if (entry.isDirectory()) found.push(...currentMarkdownFiles(path));
    else if (entry.name.endsWith('.md')) found.push(path);
  }
  return found;
}

// Only STATUS.md may state what is active/pending; contracts describe behaviour.
const STATUS_CLAIM_PATTERNS = [
  /\bactive (?:implementation |next )?slice\b/i,
  /\*\*Active implementation\*\*/i,
  /\bpending PR #\d+ merge\b/i,
  /^Active branch:/m,
  /^Current tranche:/m
];
const REPO_PATH_PATTERN = /`((?:src|api|components|scripts|tests|docs|templates|\.github)\/[A-Za-z0-9_. /-]+\.(?:js|mjs|md|json|yml))`/g;

for (const path of currentMarkdownFiles()) {
  const content = fs.readFileSync(path, 'utf8');
  if (/zero-backend|fully static|No server is required/i.test(content)) {
    failures.push(`${path} contains obsolete static/zero-backend architecture wording`);
  }
  if (path !== 'STATUS.md') {
    for (const pattern of STATUS_CLAIM_PATTERNS) {
      const match = content.match(pattern);
      if (match) failures.push(`${path} contains a status claim ("${match[0]}"); status belongs only in STATUS.md`);
    }
  }
  for (const [, referenced] of content.matchAll(REPO_PATH_PATTERN)) {
    if (!fs.existsSync(referenced)) failures.push(`${path} references missing file \`${referenced}\``);
  }
}

const status = fs.existsSync('STATUS.md') ? fs.readFileSync('STATUS.md', 'utf8') : '';
for (const heading of ['## Current phase', '## Open issues', '## Open pull requests', '## Pending human / environment actions']) {
  if (status && !status.includes(heading)) failures.push(`STATUS.md is missing the "${heading}" section`);
}

if (failures.length) {
  console.error('[repo:doctor] Repository contract violations:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`[repo:doctor] Healthy: Node ${nodeVersion}, required docs present, workflows pinned, architecture wording current, status single-sourced, doc file references resolve.`);
