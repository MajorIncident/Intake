#!/usr/bin/env node
/**
 * @fileoverview Compiles JSON template snapshots into a frozen runtime manifest.
 */

import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TEMPLATE_MODE_IDS } from '../src/templateModes.js';

const templatesDir = new URL('../templates/', import.meta.url);
const manifestPath = new URL('../src/templates.manifest.js', import.meta.url);

const MODE_VALUES = Object.freeze(Object.values(TEMPLATE_MODE_IDS));

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function expectStringFields(target, fields, ctx, errors) {
  for (const field of fields) {
    if (typeof target[field] !== 'string') {
      errors.push(`${ctx}.${field} must be a string`);
    }
  }
}

function expectBooleanFields(target, fields, ctx, errors) {
  for (const field of fields) {
    if (typeof target[field] !== 'boolean') {
      errors.push(`${ctx}.${field} must be a boolean`);
    }
  }
}

function validateSerializedAppState(state) {
  const errors = [];
  if (!isRecord(state)) {
    errors.push('state must be an object');
    return errors;
  }

  if (!isRecord(state.meta)) {
    errors.push('state.meta must be an object');
  } else {
    if (typeof state.meta.version !== 'number') {
      errors.push('state.meta.version must be a number');
    }
    if (!(typeof state.meta.savedAt === 'string' || state.meta.savedAt === null)) {
      errors.push('state.meta.savedAt must be a string or null');
    }
  }

  if (!isRecord(state.pre)) {
    errors.push('state.pre must be an object');
  } else {
    expectStringFields(state.pre, ['oneLine', 'proof', 'objectPrefill', 'healthy', 'now'], 'state.pre', errors);
  }

  if (!isRecord(state.impact)) {
    errors.push('state.impact must be an object');
  } else {
    expectStringFields(state.impact, ['now', 'future', 'time'], 'state.impact', errors);
  }

  if (!isRecord(state.ops)) {
    errors.push('state.ops must be an object');
  } else {
    expectStringFields(
      state.ops,
      [
        'bridgeOpenedUtc',
        'icName',
        'bcName',
        'semOpsName',
        'severity',
        'containStatus',
        'containDesc',
        'commCadence',
        'commNextDueIso',
        'commNextUpdateTime',
        'tableFocusMode'
      ],
      'state.ops',
      errors
    );
    expectBooleanFields(
      state.ops,
      [
        'detectMonitoring',
        'detectUserReport',
        'detectAutomation',
        'detectOther',
        'evScreenshot',
        'evLogs',
        'evMetrics',
        'evRepro',
        'evOther'
      ],
      'state.ops',
      errors
    );
    if (!Array.isArray(state.ops.commLog)) {
      errors.push('state.ops.commLog must be an array');
    }
  }

  if (!Array.isArray(state.table)) {
    errors.push('state.table must be an array');
  }
  if (!Array.isArray(state.causes)) {
    errors.push('state.causes must be an array');
  }
  if (!(typeof state.likelyCauseId === 'string' || state.likelyCauseId === null)) {
    errors.push('state.likelyCauseId must be a string or null');
  }

  if (!isRecord(state.steps)) {
    errors.push('state.steps must be an object');
  } else {
    if (!Array.isArray(state.steps.items)) {
      errors.push('state.steps.items must be an array');
    }
    if (typeof state.steps.drawerOpen !== 'boolean') {
      errors.push('state.steps.drawerOpen must be a boolean');
    }
  }

  if (!isRecord(state.actions)) {
    errors.push('state.actions must be an object');
  } else {
    if (typeof state.actions.analysisId !== 'string') {
      errors.push('state.actions.analysisId must be a string');
    }
    if (!Array.isArray(state.actions.items)) {
      errors.push('state.actions.items must be an array');
    }
  }

  return errors;
}

async function readTemplateFile(fileName) {
  const filePath = new URL(fileName, templatesDir);
  const raw = await fs.readFile(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse ${fileName}: ${error.message}`);
  }
  const errors = [];
  if (!isRecord(data)) {
    throw new Error(`${fileName} must contain a JSON object`);
  }
  const { id, name, description, supportedModes, state } = data;
  if (typeof id !== 'string' || !id.trim()) {
    errors.push('id must be a non-empty string');
  }
  if (typeof name !== 'string' || !name.trim()) {
    errors.push('name must be a non-empty string');
  }
  if (typeof description !== 'string' || !description.trim()) {
    errors.push('description must be a non-empty string');
  }
  if (!Array.isArray(supportedModes) || supportedModes.length === 0) {
    errors.push('supportedModes must be a non-empty array');
  } else {
    const invalid = supportedModes.filter(mode => !MODE_VALUES.includes(mode));
    if (invalid.length) {
      errors.push(`supportedModes contains invalid entries: ${invalid.join(', ')}`);
    }
  }
  const stateErrors = validateSerializedAppState(state);
  errors.push(...stateErrors.map(message => `state invalid: ${message}`));
  if (errors.length) {
    throw new Error(`${fileName} failed validation:\n- ${errors.join('\n- ')}`);
  }
  return {
    id: id.trim(),
    name: name.trim(),
    description: description.trim(),
    supportedModes: supportedModes.map(mode => mode.trim()),
    state
  };
}

function createManifestSource(manifest) {
  const banner = `/**\n * AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.\n * Generated by scripts/build-templates-manifest.mjs\n */`;
  const serialized = JSON.stringify(manifest, null, 2);
  return `${banner}\n\nfunction deepFreeze(value) {\n  if (Array.isArray(value)) {\n    value.forEach(deepFreeze);\n  } else if (value && typeof value === 'object') {\n    Object.values(value).forEach(deepFreeze);\n  }\n  return Object.freeze(value);\n}\n\nconst manifest = ${serialized};\n\nexport const TEMPLATE_MANIFEST = deepFreeze(manifest);\n`;
}

async function main() {
  let entries = [];
  try {
    const files = await fs.readdir(templatesDir);
    entries = files.filter(name => name.endsWith('.json')).sort();
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Missing templates directory: ${fileURLToPath(templatesDir)}`);
    }
    throw error;
  }
  if (entries.length === 0) {
    throw new Error('No JSON templates found in templates/');
  }
  const manifest = [];
  for (const fileName of entries) {
    const template = await readTemplateFile(fileName);
    manifest.push(template);
  }
  const output = createManifestSource(manifest);
  await fs.writeFile(manifestPath, output, 'utf8');
  console.log(`Wrote ${manifest.length} template(s) to ${fileURLToPath(manifestPath)}.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
