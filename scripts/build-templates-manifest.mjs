#!/usr/bin/env node
/**
 * @fileoverview Compiles JSON template snapshots into a frozen runtime manifest.
 */

import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TEMPLATE_MODE_IDS } from '../src/templateModes.js';
import { TEMPLATE_KINDS } from '../src/templateKinds.js';
import { validateIntakeTargetCoverage } from '../src/intakeTargets.js';
import {
  normalizeStagedSimulation,
  validateSimulationForResource
} from './staged-simulation-schema.mjs';
import { STANDALONE_PUBLIC_CASE_STUDY_IDS } from './standalone-public-case-studies.mjs';
import {
  validateProtectedAssetBytes,
  validateProtectedAssetRegistry,
  validateSimulationAssetReferences
} from './protected-assets-schema.mjs';

const templatesDir = new URL('../templates/', import.meta.url);
const assetsDir = new URL('../templates/assets/', import.meta.url);
const publicManifestPath = new URL('../src/templates.manifest.js', import.meta.url);
const protectedManifestPath = new URL('../api/protected-case-studies.manifest.js', import.meta.url);
const protectedAssetManifestPath = new URL('../api/_protected-assets.manifest.js', import.meta.url);

const MODE_VALUES = Object.freeze(Object.values(TEMPLATE_MODE_IDS));
const KIND_VALUES = Object.freeze(Object.values(TEMPLATE_KINDS));
const LIBRARY_GROUPS = Object.freeze(['psdm', 'ats', 'legacy', 'mim']);

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

function validateParticipantCase(value, errors) {
  if (value === undefined) return;
  if (!isRecord(value) || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 160) {
    errors.push('participantCase.title must be a non-empty string (max 160 characters)');
    return;
  }
  if (!Array.isArray(value.sections) || value.sections.length === 0 || value.sections.length > 20) {
    errors.push('participantCase.sections must contain 1–20 readable sections');
    return;
  }
  value.sections.forEach((section, index) => {
    if (!isRecord(section)
      || typeof section.heading !== 'string'
      || !section.heading.trim()
      || section.heading.length > 160
      || typeof section.body !== 'string'
      || !section.body.trim()
      || section.body.length > 6000) {
      errors.push(`participantCase.sections[${index}] needs heading and body plain text within limits`);
    }
    // A self-study reveal is a presentation cue, not Classroom access control.
    // Classroom Students receive stage-filtered content from authenticated endpoints.
    if (isRecord(section) && section.reveal !== undefined && typeof section.reveal !== 'boolean') {
      errors.push(`participantCase.sections[${index}].reveal must be a boolean`);
    }
    // Original author-drawn flow maps are accessible HTML text, never stored
    // as copied workbook figure bytes or remote URLs. Bound the structure to
    // prevent unexpected rich content in public and Classroom catalogs.
    if (isRecord(section) && section.diagram !== undefined) {
      const diagram = section.diagram;
      if (!isRecord(diagram)
        || diagram.kind !== 'flow'
        || typeof diagram.caption !== 'string'
        || !diagram.caption.trim()
        || diagram.caption.length > 250
        || !Array.isArray(diagram.lanes)
        || diagram.lanes.length < 1
        || diagram.lanes.length > 4) {
        errors.push(`participantCase.sections[${index}].diagram must be a flow with caption and 1-4 lanes`);
      } else {
        // The public Standalone manifest embeds authored reader metadata. Reject
        // unknown keys at build time, not only at the protected API projection,
        // so accidental URLs, source-file paths or HTML cannot be shipped.
        if (Object.keys(diagram).some(key => !['kind', 'caption', 'lanes'].includes(key))) {
          errors.push(`participantCase.sections[${index}].diagram contains unsupported fields`);
        }
        diagram.lanes.forEach((lane, laneIndex) => {
          if (!isRecord(lane)
            || typeof lane.label !== 'string'
            || !lane.label.trim()
            || lane.label.length > 120
            || !Array.isArray(lane.steps)
            || lane.steps.length < 2
            || lane.steps.length > 7
            || lane.steps.some(step => typeof step !== 'string' || !step.trim() || step.length > 120)) {
            errors.push(`participantCase.sections[${index}].diagram.lanes[${laneIndex}] needs a label and 2-7 short text steps`);
          } else if (Object.keys(lane).some(key => !['label', 'steps'].includes(key))) {
            errors.push(`participantCase.sections[${index}].diagram.lanes[${laneIndex}] contains unsupported fields`);
          }
        });
      }
    }
  });
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
  const { id, name, description, supportedModes, templateKind, state, simulation, libraryGroup, participantCase } = data;
  if (typeof id !== 'string' || !id.trim()) {
    errors.push('id must be a non-empty string');
  }
  if (typeof name !== 'string' || !name.trim()) {
    errors.push('name must be a non-empty string');
  }
  if (typeof description !== 'string' || !description.trim()) {
    errors.push('description must be a non-empty string');
  }
  if (!KIND_VALUES.includes(templateKind)) {
    errors.push(`templateKind must be one of: ${KIND_VALUES.join(', ')}`);
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

  if (templateKind === TEMPLATE_KINDS.STANDARD && isRecord(state)) {
    const targetCoverageErrors = validateIntakeTargetCoverage(state);
    errors.push(...targetCoverageErrors.map(message => `state target coverage invalid: ${message}`));
  }

  if (templateKind === TEMPLATE_KINDS.CASE_STUDY && libraryGroup !== undefined && !LIBRARY_GROUPS.includes(libraryGroup)) {
    errors.push(`libraryGroup must be one of: ${LIBRARY_GROUPS.join(', ')}`);
  }
  if (templateKind === TEMPLATE_KINDS.STANDARD && (libraryGroup !== undefined || participantCase !== undefined)) {
    errors.push('Standard Templates cannot carry Case Library group or participant brief');
  }
  validateParticipantCase(participantCase, errors);

  const simulationErrors = validateSimulationForResource({ templateKind, simulation });
  errors.push(...simulationErrors.map(message => `simulation invalid: ${message}`));

  if (errors.length) {
    throw new Error(`${fileName} failed validation:\n- ${errors.join('\n- ')}`);
  }
  return {
    id: id.trim(),
    name: name.trim(),
    description: description.trim(),
    supportedModes: supportedModes.map(mode => mode.trim()),
    templateKind,
    ...(libraryGroup === undefined ? {} : { libraryGroup }),
    ...(participantCase === undefined ? {} : { participantCase }),
    state,
    ...(simulation === undefined ? {} : { simulation: normalizeStagedSimulation(simulation) })
  };
}

function createManifestSource(manifest, { exportName, boundary }) {
  const banner = `/**\n * AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.\n * Generated by scripts/build-templates-manifest.mjs\n * ${boundary}\n */`;
  const serialized = JSON.stringify(manifest, null, 2);
  return `${banner}\n\nfunction deepFreeze(value) {\n  if (Array.isArray(value)) {\n    value.forEach(deepFreeze);\n  } else if (value && typeof value === 'object') {\n    Object.values(value).forEach(deepFreeze);\n  }\n  return Object.freeze(value);\n}\n\nconst manifest = ${serialized};\n\nexport const ${exportName} = deepFreeze(manifest);\n`;
}

/**
 * Selects the Case Studies temporarily published for Standalone, without the
 * server-only `simulation` field, and refuses unknown or staged cases.
 * @param {Array<object>} caseStudies - Validated protected Case Study records.
 * @returns {Array<object>} Public copies in allowlist order.
 */
function selectStandalonePublicCaseStudies(caseStudies) {
  const byId = new Map(caseStudies.map(caseStudy => [caseStudy.id, caseStudy]));
  return STANDALONE_PUBLIC_CASE_STUDY_IDS.map(id => {
    const caseStudy = byId.get(id);
    if (!caseStudy) {
      throw new Error(`Standalone public Case Study allowlist names an unknown Case Study: ${id}`);
    }
    if (caseStudy.simulation) {
      throw new Error(`Staged Case Study ${id} cannot be published to Standalone; it would bypass staged release.`);
    }
    const { simulation: _serverOnly, ...publicCopy } = caseStudy;
    return publicCopy;
  });
}

/**
 * Reads, validates, and embeds the protected staged-asset registry (#316).
 * @param {Array<object>} caseStudies - Validated protected Case Studies (for reference checks).
 * @returns {Promise<Array<object>>} Server-only asset manifest entries with base64 bytes.
 */
async function buildProtectedAssets(caseStudies) {
  let registry;
  try {
    registry = JSON.parse(await fs.readFile(new URL('registry.json', assetsDir), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Failed to read templates/assets/registry.json: ${error.message}`);
  }
  const { errors, assets } = validateProtectedAssetRegistry(registry);
  const embed = async (file, ctx) => {
    let bytes;
    try {
      bytes = await fs.readFile(new URL(file, assetsDir));
    } catch {
      errors.push(`${ctx} file templates/assets/${file} is missing`);
      return null;
    }
    const mediaType = validateProtectedAssetBytes(bytes, `${ctx} (${file})`, errors);
    return mediaType ? { mediaType, data: bytes.toString('base64') } : null;
  };
  const manifest = [];
  for (const asset of assets) {
    if (asset.kind === 'image') {
      const embedded = await embed(asset.file, asset.id);
      if (embedded) manifest.push({ id: asset.id, kind: 'image', ...embedded });
      continue;
    }
    const pages = [];
    for (const page of asset.pages) {
      const embedded = await embed(page.file, `${asset.id} page ${page.page}`);
      if (embedded) pages.push({ page: page.page, ...embedded });
    }
    manifest.push({ id: asset.id, kind: 'document', pages });
  }
  errors.push(...validateSimulationAssetReferences(caseStudies, assets));
  if (errors.length) {
    throw new Error(`templates/assets/registry.json failed validation:\n- ${errors.join('\n- ')}`);
  }
  return manifest;
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
  const templates = [];
  for (const fileName of entries) {
    const template = await readTemplateFile(fileName);
    templates.push(template);
  }

  const protectedCaseStudies = templates.filter(template => template.templateKind === TEMPLATE_KINDS.CASE_STUDY);
  const publicCaseStudies = selectStandalonePublicCaseStudies(protectedCaseStudies);
  const publicTemplates = templates
    .filter(template => template.templateKind === TEMPLATE_KINDS.STANDARD)
    .concat(publicCaseStudies);

  const publicOutput = createManifestSource(publicTemplates, {
    exportName: 'TEMPLATE_MANIFEST',
    boundary: publicCaseStudies.length
      ? 'PUBLIC CLIENT MANIFEST: Standard Templates plus the TEMPORARY Standalone Case Study allowlist in scripts/standalone-public-case-studies.mjs. Anything here is publicly downloadable.'
      : 'PUBLIC CLIENT MANIFEST: Standard Templates only. Protected Case Studies must never be added here.'
  });
  const protectedOutput = createManifestSource(protectedCaseStudies, {
    exportName: 'PROTECTED_CASE_STUDY_MANIFEST',
    boundary: 'SERVER-ONLY MANIFEST: protected Case Study metadata and payloads. Never import from browser runtime modules.'
  });
  const protectedAssets = await buildProtectedAssets(protectedCaseStudies);
  const protectedAssetOutput = createManifestSource(protectedAssets, {
    exportName: 'PROTECTED_ASSET_MANIFEST',
    boundary: 'SERVER-ONLY MANIFEST: protected staged Case Study images and document pages (#316), served only through authorized Classroom routes. Never import from browser runtime modules.'
  });

  await Promise.all([
    fs.writeFile(publicManifestPath, publicOutput, 'utf8'),
    fs.writeFile(protectedManifestPath, protectedOutput, 'utf8'),
    fs.writeFile(protectedAssetManifestPath, protectedAssetOutput, 'utf8')
  ]);

  console.log(
    `Wrote ${publicTemplates.length} public template(s) (${publicCaseStudies.length} temporary Standalone Case Studies) to ${fileURLToPath(publicManifestPath)} `
    + `and ${protectedCaseStudies.length} protected Case Study record(s) to ${fileURLToPath(protectedManifestPath)}, `
    + `and ${protectedAssets.length} protected asset(s) to ${fileURLToPath(protectedAssetManifestPath)}.`
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
