#!/usr/bin/env node
/**
 * @fileoverview Enforces the protected Case Study public/deployment boundary.
 */

import { promises as fs } from 'node:fs';

import { PROTECTED_CASE_STUDY_MANIFEST } from '../api/protected-case-studies.manifest.js';

const root = new URL('../', import.meta.url);
const publicManifestUrl = new URL('../src/templates.manifest.js', import.meta.url);
const vercelIgnoreUrl = new URL('../.vercelignore', import.meta.url);
const vercelConfigUrl = new URL('../vercel.json', import.meta.url);
const templatesDirUrl = new URL('../templates/', import.meta.url);

async function read(url) {
  return fs.readFile(url, 'utf8');
}

async function collectJavaScriptFiles(directoryUrl) {
  const output = [];
  const entries = await fs.readdir(directoryUrl, { withFileTypes: true });
  for (const entry of entries) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directoryUrl);
    if (entry.isDirectory()) {
      output.push(...await collectJavaScriptFiles(child));
    } else if (entry.name.endsWith('.js')) {
      output.push(child);
    }
  }
  return output;
}

async function main() {
  const [publicManifest, vercelIgnore, vercelConfigRaw] = await Promise.all([
    read(publicManifestUrl),
    read(vercelIgnoreUrl),
    read(vercelConfigUrl)
  ]);

  const ignoredPatterns = vercelIgnore
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  if (!ignoredPatterns.includes('templates/*.json')) {
    throw new Error('Protected boundary requires .vercelignore to exclude templates/*.json from deployment.');
  }

  const vercelConfig = JSON.parse(vercelConfigRaw);
  const expectedBuildCommand = 'npm run verify:vercel-functions && npm run verify:protected-cases && npm run build:vercel-public';
  if (vercelConfig.buildCommand !== expectedBuildCommand) {
    throw new Error(
      'Vercel buildCommand must verify the function budget, verify protected cases, and then build the minimal public dist/ bundle.'
    );
  }
  if (vercelConfig.outputDirectory !== 'dist') {
    throw new Error('Vercel outputDirectory must be dist; serving the repository root exposes internal files.');
  }

  const deploymentEnabled = vercelConfig.git?.deploymentEnabled;
  if (
    !deploymentEnabled
    || deploymentEnabled['**'] !== false
    || deploymentEnabled.main !== true
    || deploymentEnabled['verify/**'] !== true
  ) {
    throw new Error(
      'Vercel Git deployments must be disabled by default, enabled for main, and enabled explicitly for verify/** branches.'
    );
  }

  const expectedIgnoreCommand = 'case "$VERCEL_GIT_COMMIT_REF" in main|verify/*) exit 1 ;; *) exit 0 ;; esac';
  if (vercelConfig.ignoreCommand !== expectedIgnoreCommand) {
    throw new Error(
      'Vercel ignoreCommand must allow only main and verify/** branches to continue when the build step is evaluated.'
    );
  }

  if (process.env.VERCEL === '1') {
    const deployedTemplateEntries = await fs.readdir(templatesDirUrl).catch(error => {
      if (error?.code === 'ENOENT') return [];
      throw error;
    });
    const deployedAuthoredJson = deployedTemplateEntries.filter(name => name.endsWith('.json'));
    if (deployedAuthoredJson.length) {
      throw new Error(
        `Vercel deployment source still contains authored template JSON: ${deployedAuthoredJson.join(', ')}`
      );
    }
    console.log('[verify:protected-cases] Vercel upload contains no authored templates/*.json files.');
  }

  const browserFiles = [
    new URL('../main.js', import.meta.url),
    new URL('../index.html', import.meta.url),
    ...await collectJavaScriptFiles(new URL('../src/', import.meta.url)),
    ...await collectJavaScriptFiles(new URL('../components/', import.meta.url))
  ];
  const browserSources = await Promise.all(browserFiles.map(async url => ({
    path: url.pathname,
    content: await read(url)
  })));

  for (const caseStudy of PROTECTED_CASE_STUDY_MANIFEST) {
    for (const protectedText of [caseStudy.id, caseStudy.name]) {
      if (publicManifest.includes(protectedText)) {
        throw new Error(`Protected Case Study text leaked into public manifest: ${protectedText}`);
      }
      const runtimeLeak = browserSources.find(file => file.content.includes(protectedText));
      if (runtimeLeak) {
        throw new Error(`Protected Case Study text leaked into browser runtime ${runtimeLeak.path}: ${protectedText}`);
      }
    }
  }

  for (const file of browserSources) {
    if (
      file.content.includes('protected-case-studies.manifest')
      || file.content.includes('PROTECTED_CASE_STUDY_MANIFEST')
    ) {
      throw new Error(`Browser runtime must not import the server-only protected manifest: ${file.path}`);
    }
  }

  console.log(
    `[verify:protected-cases] Protected ${PROTECTED_CASE_STUDY_MANIFEST.length} Case Study payload(s); `
    + 'public manifest/runtime and Vercel deployment boundary verified.'
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
