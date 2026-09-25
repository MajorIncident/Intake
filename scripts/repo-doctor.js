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

const docsToCheck = ['README.md', 'docs/AI-ONBOARDING.md'];
for (const path of docsToCheck) {
  const content = fs.readFileSync(path, 'utf8');
  if (/zero-backend|fully static|No server is required/i.test(content)) {
    failures.push(`${path} contains obsolete static/zero-backend architecture wording`);
  }
}

if (failures.length) {
  console.error('[repo:doctor] Repository contract violations:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`[repo:doctor] Healthy: Node ${nodeVersion}, required docs present, workflows pinned, architecture wording current.`);
