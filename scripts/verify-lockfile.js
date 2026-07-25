#!/usr/bin/env node
/**
 * @fileoverview Offline guard ensuring every root dependency has a complete package-lock entry.
 * Run before tests so dependency declarations cannot be committed with only the lockfile root edited.
 */
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lockfile = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const declared = { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
const lockedRoot = lockfile.packages?.[''] || {};
const failures = [];

for (const [name, requested] of Object.entries(declared)) {
  const section = Object.hasOwn(manifest.dependencies || {}, name) ? 'dependencies' : 'devDependencies';
  if (lockedRoot[section]?.[name] !== requested) failures.push(`${name}: root declaration is out of sync`);
  const entry = lockfile.packages?.[`node_modules/${name}`];
  if (!entry?.version || !entry?.resolved) failures.push(`${name}: resolved package entry is missing`);
  if (/^\d+\.\d+\.\d+$/.test(requested) && entry?.version !== requested) failures.push(`${name}: expected ${requested}, locked ${entry?.version || 'nothing'}`);
}

if (failures.length) {
  console.error('[verify:lockfile] package.json and package-lock.json are incomplete or out of sync:');
  failures.forEach(failure => console.error(`- ${failure}`));
  console.error('Run npm install using the normal npm registry, then commit the generated package-lock.json.');
  process.exit(1);
}

console.log(`[verify:lockfile] Verified ${Object.keys(declared).length} root dependency entries.`);
