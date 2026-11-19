/**
 * Security regression coverage for the public/protected template build boundary.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

import { PROTECTED_CASE_STUDY_MANIFEST } from '../api/protected-case-studies.manifest.js';
import { TEMPLATE_MANIFEST } from '../src/templates.manifest.js';
import { TEMPLATE_KINDS } from '../src/templateKinds.js';
import { validateStagedSimulation } from '../scripts/staged-simulation-schema.mjs';
import { STANDALONE_PUBLIC_CASE_STUDY_IDS } from '../scripts/standalone-public-case-studies.mjs';

const PUBLIC_CASE_IDS = new Set(STANDALONE_PUBLIC_CASE_STUDY_IDS);

test('public manifest contains Standard Templates plus only the temporary Standalone Case Study allowlist', async () => {
  assert.ok(TEMPLATE_MANIFEST.length > 0, 'at least one public Standard Template should exist');
  assert.ok(PROTECTED_CASE_STUDY_MANIFEST.length > 0, 'protected Case Studies should exist server-side');

  assert.ok(
    TEMPLATE_MANIFEST.every(entry => (
      entry.templateKind === TEMPLATE_KINDS.STANDARD
      || (entry.templateKind === TEMPLATE_KINDS.CASE_STUDY && PUBLIC_CASE_IDS.has(entry.id))
    )),
    'public manifest may contain Standard Templates and allowlisted Standalone Case Studies only'
  );
  assert.deepEqual(
    TEMPLATE_MANIFEST.filter(entry => entry.templateKind === TEMPLATE_KINDS.CASE_STUDY).map(entry => entry.id),
    [...STANDALONE_PUBLIC_CASE_STUDY_IDS],
    'every allowlisted Case Study is published, in allowlist order'
  );
  for (const required of ['microcomputer-cabinets', 'paytrix']) {
    assert.ok(PUBLIC_CASE_IDS.has(required), `${required} must stay available in Work independently`);
  }
  assert.ok(
    PROTECTED_CASE_STUDY_MANIFEST.every(entry => entry.templateKind === TEMPLATE_KINDS.CASE_STUDY),
    'server-only manifest must contain only Case Studies'
  );

  assert.ok(
    TEMPLATE_MANIFEST.every(entry => !Object.hasOwn(entry, 'simulation')),
    'public manifest must never contain staged simulation definitions'
  );

  const publicIds = new Set(TEMPLATE_MANIFEST.map(entry => entry.id));
  for (const caseStudy of PROTECTED_CASE_STUDY_MANIFEST) {
    if (caseStudy.simulation !== undefined) {
      assert.deepEqual(
        validateStagedSimulation(caseStudy.simulation),
        [],
        `${caseStudy.id} staged simulation should remain valid in the server-only manifest`
      );
    }
    if (PUBLIC_CASE_IDS.has(caseStudy.id)) {
      assert.equal(caseStudy.simulation, undefined, `${caseStudy.id} is staged and must not be public`);
      const publicCopy = TEMPLATE_MANIFEST.find(entry => entry.id === caseStudy.id);
      assert.deepEqual(publicCopy.state, caseStudy.state, `${caseStudy.id} public copy matches the server copy`);
    } else {
      assert.equal(publicIds.has(caseStudy.id), false, `${caseStudy.id} must not be public`);
    }
  }

  const publicSource = await readFile(new URL('../src/templates.manifest.js', import.meta.url), 'utf8');
  for (const caseStudy of PROTECTED_CASE_STUDY_MANIFEST.filter(entry => !PUBLIC_CASE_IDS.has(entry.id))) {
    assert.equal(publicSource.includes(caseStudy.id), false, `${caseStudy.id} must not occur in the public generated module`);
    assert.equal(publicSource.includes(caseStudy.name), false, `${caseStudy.name} must not occur in the public generated module`);
  }
});

test('every authored JSON resource is emitted to its boundary (allowlisted Case Studies to both)', async () => {
  const templatesDir = new URL('../templates/', import.meta.url);
  const names = (await readdir(templatesDir)).filter(name => name.endsWith('.json')).sort();
  const authored = [];
  for (const name of names) {
    authored.push(JSON.parse(await readFile(new URL(name, templatesDir), 'utf8')));
  }

  const generated = [
    ...TEMPLATE_MANIFEST
      .filter(entry => entry.templateKind === TEMPLATE_KINDS.STANDARD)
      .map(entry => ({ id: entry.id, templateKind: entry.templateKind })),
    ...PROTECTED_CASE_STUDY_MANIFEST.map(entry => ({ id: entry.id, templateKind: entry.templateKind }))
  ].sort((a, b) => a.id.localeCompare(b.id));

  const expected = authored
    .map(entry => ({ id: entry.id.trim(), templateKind: entry.templateKind }))
    .sort((a, b) => a.id.localeCompare(b.id));

  assert.deepEqual(generated, expected);
});
