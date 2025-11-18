/**
 * @module templates
 * @summary Provides curated intake starter templates and mode-aware payload helpers.
 * @description
 *   Loads the generated manifest of curated templates and exposes metadata plus
 *   selectors for the drawer UI. Consumers can enumerate templates, query
 *   supported modes, and fetch {@link import('./storage.js').SerializedAppState}
 *   payloads that respect each mode's visibility rules.
 */

import { TEMPLATE_MANIFEST } from './templates.manifest.js';
import { MODE_RULES, TEMPLATE_MODE_IDS, TEMPLATE_MODES } from './templateModes.js';
import { TEMPLATE_KINDS, normalizeTemplateKind } from './templateKinds.js';

const MODE_INDEX = new Map(TEMPLATE_MODES.map(mode => [mode.id, mode]));

const BASE_OPS = Object.freeze({
  tableFocusMode: 'rapid'
});

const DEFAULT_STEPS_STATE = Object.freeze({
  items: [],
  drawerOpen: false
});

const DEFAULT_ACTIONS_STATE = Object.freeze({
  analysisId: '',
  items: []
});

/**
 * Deeply clones serializable values.
 * @template T
 * @param {T} value - Serializable value to clone.
 * @returns {T} Cloned value.
 */
function clone(value) {
  if (Array.isArray(value)) {
    return /** @type {T} */ (value.map(item => clone(item)));
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(key => {
      out[key] = clone(value[key]);
    });
    return /** @type {T} */ (out);
  }
  return value;
}

/**
 * Normalizes a steps payload into the exported storage shape.
 * @param {Partial<typeof DEFAULT_STEPS_STATE>} [steps] - Raw steps snapshot.
 * @returns {{ items: Array<{ id: string, label: string, checked: boolean }>, drawerOpen: boolean }} Normalized steps state.
 */
function normalizeSteps(steps) {
  if (!steps || typeof steps !== 'object') {
    return clone(DEFAULT_STEPS_STATE);
  }
  const items = Array.isArray(steps.items)
    ? steps.items
        .map(item => {
          if (!item || (typeof item.id !== 'string' && typeof item.id !== 'number')) {
            return null;
          }
          const label = typeof item.label === 'string' ? item.label : '';
          if (!label) {
            return null;
          }
          return {
            id: String(item.id),
            label,
            checked: !!item.checked
          };
        })
        .filter(Boolean)
    : [];
  return {
    items,
    drawerOpen: !!steps.drawerOpen
  };
}

/**
 * Normalizes an actions payload into the exported storage shape.
 * @param {Partial<typeof DEFAULT_ACTIONS_STATE>} [actions] - Raw actions snapshot.
 * @returns {{ analysisId: string, items: Array<Record<string, any>> }} Normalized actions state.
 */
function normalizeActions(actions) {
  if (!actions || typeof actions !== 'object') {
    return clone(DEFAULT_ACTIONS_STATE);
  }
  const items = Array.isArray(actions.items)
    ? actions.items
        .filter(item => item && typeof item === 'object')
        .map(item => clone(item))
    : [];
  return {
    analysisId: typeof actions.analysisId === 'string' ? actions.analysisId : '',
    items
  };
}

/**
 * Applies a mode's visibility rules to a full template state.
 * @param {import('./storage.js').SerializedAppState} fullState - Complete state definition.
 * @param {keyof typeof MODE_RULES} modeId - Mode identifier to project.
 * @returns {import('./storage.js').SerializedAppState|null} Mode-aware state payload.
 */
function projectState(fullState, modeId) {
  const rule = MODE_RULES[modeId];
  if (!rule) {
    return null;
  }
  const projected = {
    meta: clone(fullState.meta),
    pre: clone(fullState.pre),
    impact: clone(fullState.impact),
    ops: clone(fullState.ops),
    table: rule.includeTable ? clone(fullState.table) : [],
    causes: rule.includeCauses ? clone(fullState.causes) : [],
    likelyCauseId: rule.includeCauses ? fullState.likelyCauseId : null,
    steps: rule.includeSteps ? clone(fullState.steps) : clone(DEFAULT_STEPS_STATE),
    actions: rule.includeActions ? clone(fullState.actions) : clone(DEFAULT_ACTIONS_STATE)
  };
  if (!rule.includeTable) {
    projected.ops.tableFocusMode = BASE_OPS.tableFocusMode;
  }
  if (!rule.includeActions) {
    projected.actions.analysisId = '';
  }
  if (!rule.includeSteps) {
    projected.steps.drawerOpen = false;
  }
  return projected;
}

/** @type {Array<{ id: string, name: string, description: string, templateKind: keyof typeof TEMPLATE_KINDS, supportedModes: string[], state: import('./storage.js').SerializedAppState }>} */
let templates = [];
let templateIndex = new Map();

function hydrateManifest(entries) {
  templates = entries.map(entry => ({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    templateKind: normalizeTemplateKind(entry.templateKind),
    supportedModes: sanitizeSupportedModes(entry.supportedModes),
    state: normalizeManifestState(entry.state)
  }));
  templateIndex = new Map(templates.map(entry => [entry.id, entry]));
}

function sanitizeSupportedModes(modes) {
  const normalized = Array.isArray(modes) ? modes.filter(mode => MODE_INDEX.has(mode)) : [];
  if (normalized.length > 0) {
    return normalized;
  }
  return Array.from(MODE_INDEX.keys());
}

function normalizeManifestState(state) {
  if (!state || typeof state !== 'object') {
    throw new Error('Invalid template manifest state payload.');
  }
  return {
    meta: clone(state.meta),
    pre: clone(state.pre),
    impact: clone(state.impact),
    ops: clone(state.ops),
    table: Array.isArray(state.table) ? clone(state.table) : [],
    causes: Array.isArray(state.causes) ? clone(state.causes) : [],
    likelyCauseId: typeof state.likelyCauseId === 'string' ? state.likelyCauseId : null,
    steps: normalizeSteps(state.steps),
    actions: normalizeActions(state.actions)
  };
}

hydrateManifest(TEMPLATE_MANIFEST);

/**
 * Allows tests to inject a stub manifest for isolation.
 * @param {Array<{ id: string, name: string, description: string, templateKind: keyof typeof TEMPLATE_KINDS, supportedModes: string[], state: import('./storage.js').SerializedAppState }>} entries - Test manifest entries.
 */
export function __dangerousSetTemplateManifestForTests(entries) {
  hydrateManifest(entries);
}

/**
 * List available template definitions for the drawer UI.
 * @returns {Array<{ id: string, name: string, description: string, templateKind: keyof typeof TEMPLATE_KINDS }>} Human-friendly template metadata.
 */
export function listTemplates() {
  return templates.map(template => ({
    id: template.id,
    name: template.name,
    description: template.description,
    templateKind: template.templateKind
  }));
}

/**
 * Retrieve metadata for a specific template identifier.
 * @param {string} templateId - Unique template identifier.
 * @returns {{ id: string, name: string, description: string, templateKind: keyof typeof TEMPLATE_KINDS }|null} Metadata snapshot or null when missing.
 */
export function getTemplateMetadata(templateId) {
  if (typeof templateId !== 'string') {
    return null;
  }
  const template = templateIndex.get(templateId.trim());
  if (!template) {
    return null;
  }
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    templateKind: template.templateKind
  };
}

/**
 * List the fixed presentation modes for templates.
 * @returns {Array<{ id: string, name: string, description: string }>} Mode metadata for declarative UIs.
 */
export function listTemplateModes() {
  return TEMPLATE_MODES.map(mode => ({ ...mode }));
}

/**
 * Retrieve the serialized payload for a given template and mode.
 * @param {string} templateId - Template identifier from {@link listTemplates}.
 * @param {keyof typeof MODE_RULES} modeId - Mode identifier from {@link listTemplateModes}.
 * @returns {import('./storage.js').SerializedAppState|null} Mode-aware payload ready for applyAppState.
 */
export function getTemplatePayload(templateId, modeId) {
  if (typeof templateId !== 'string' || typeof modeId !== 'string') {
    return null;
  }
  const template = templateIndex.get(templateId.trim());
  if (!template) {
    return null;
  }
  const normalizedMode = MODE_INDEX.has(modeId.trim()) ? modeId.trim() : null;
  if (!normalizedMode || !template.supportedModes.includes(normalizedMode)) {
    return null;
  }
  return projectState(template.state, /** @type {keyof typeof MODE_RULES} */ (normalizedMode));
}

export { TEMPLATE_MODE_IDS, TEMPLATE_KINDS };
