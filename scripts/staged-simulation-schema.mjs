/**
 * @module stagedSimulationSchema
 * @summary Validates and normalizes optional server-only staged Case Study definitions.
 * @description
 *   Staged simulation metadata is authored only on protected Case Studies and is
 *   emitted only to the server-only protected manifest. This module deliberately
 *   keeps Student-release content structurally separate from Instructor-only
 *   facilitation/model content and rejects ambiguous or orphan references.
 */

export const STAGED_SIMULATION_VERSION = 1;

export const STUDENT_CONTENT_KINDS = Object.freeze([
  'narrative',
  'prompt',
  'evidence',
  'image',
  'table',
  'document-page'
]);

export const INSTRUCTOR_CONTENT_KINDS = Object.freeze([
  'facilitation',
  'debrief',
  'exemplar'
]);

export const DEBRIEF_EDIT_POLICIES = Object.freeze(['open', 'frozen']);

const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const STUDENT_BLOCK_FIELDS = Object.freeze({
  narrative: Object.freeze(['id', 'kind', 'title', 'body']),
  prompt: Object.freeze(['id', 'kind', 'title', 'body']),
  evidence: Object.freeze(['id', 'kind', 'title', 'body']),
  image: Object.freeze(['id', 'kind', 'title', 'assetId', 'alt']),
  table: Object.freeze(['id', 'kind', 'title', 'headers', 'rows']),
  'document-page': Object.freeze(['id', 'kind', 'title', 'assetId', 'page', 'alt'])
});
const INSTRUCTOR_BLOCK_FIELDS = Object.freeze(['id', 'kind', 'title', 'body']);
const STAGE_FIELDS = Object.freeze([
  'id',
  'title',
  'studentObjective',
  'initialReleaseIds',
  'optionalReleaseIds',
  'intakeTargetIds',
  'suggestedMinutes',
  'instructorContentIds',
  'defaultDebriefEditPolicy'
]);
const ROOT_FIELDS = Object.freeze(['version', 'studentContent', 'instructorContent', 'stages']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function nonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function checkAllowedFields(value, allowed, ctx, errors) {
  for (const field of Object.keys(value)) {
    if (!allowed.includes(field)) errors.push(`${ctx}.${field} is not allowed in simulation version 1`);
  }
}

function checkStableId(value, ctx, errors) {
  if (!nonEmptyString(value) || !STABLE_ID_PATTERN.test(value)) {
    errors.push(`${ctx} must be a stable lowercase slug (letters, numbers, hyphens; max 64 characters)`);
    return false;
  }
  return true;
}

function checkStringArray(value, ctx, errors, { stableIds = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${ctx} must be an array`);
    return [];
  }
  const normalized = [];
  value.forEach((item, index) => {
    if (!nonEmptyString(item)) {
      errors.push(`${ctx}[${index}] must be a non-empty string`);
      return;
    }
    const trimmed = item.trim();
    if (stableIds && !STABLE_ID_PATTERN.test(trimmed)) {
      errors.push(`${ctx}[${index}] must be a stable lowercase slug`);
      return;
    }
    normalized.push(trimmed);
  });
  if (!unique(normalized)) errors.push(`${ctx} must not contain duplicate values`);
  return normalized;
}

function validateStudentContentBlock(block, index, errors) {
  const ctx = `simulation.studentContent[${index}]`;
  if (!isRecord(block)) {
    errors.push(`${ctx} must be an object`);
    return;
  }

  const kind = typeof block.kind === 'string' ? block.kind.trim() : '';
  if (!STUDENT_CONTENT_KINDS.includes(kind)) {
    errors.push(`${ctx}.kind must be one of: ${STUDENT_CONTENT_KINDS.join(', ')}`);
    return;
  }
  checkAllowedFields(block, STUDENT_BLOCK_FIELDS[kind], ctx, errors);
  checkStableId(block.id, `${ctx}.id`, errors);
  if (!nonEmptyString(block.title)) errors.push(`${ctx}.title must be a non-empty string`);

  if (['narrative', 'prompt', 'evidence'].includes(kind)) {
    if (!nonEmptyString(block.body)) errors.push(`${ctx}.body must be a non-empty string`);
    return;
  }

  if (kind === 'image') {
    checkStableId(block.assetId, `${ctx}.assetId`, errors);
    if (!nonEmptyString(block.alt)) errors.push(`${ctx}.alt must be a non-empty string`);
    return;
  }

  if (kind === 'document-page') {
    checkStableId(block.assetId, `${ctx}.assetId`, errors);
    if (!Number.isInteger(block.page) || block.page < 1) {
      errors.push(`${ctx}.page must be a positive integer`);
    }
    if (!nonEmptyString(block.alt)) errors.push(`${ctx}.alt must be a non-empty string`);
    return;
  }

  if (!Array.isArray(block.headers) || block.headers.length === 0) {
    errors.push(`${ctx}.headers must be a non-empty array`);
  } else if (block.headers.some(header => !nonEmptyString(header))) {
    errors.push(`${ctx}.headers must contain only non-empty strings`);
  }

  if (!Array.isArray(block.rows) || block.rows.length === 0) {
    errors.push(`${ctx}.rows must be a non-empty array`);
  } else {
    const width = Array.isArray(block.headers) ? block.headers.length : 0;
    block.rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row) || row.length !== width || row.some(cell => typeof cell !== 'string')) {
        errors.push(`${ctx}.rows[${rowIndex}] must contain exactly ${width} string cells`);
      }
    });
  }
}

function validateInstructorContentBlock(block, index, errors) {
  const ctx = `simulation.instructorContent[${index}]`;
  if (!isRecord(block)) {
    errors.push(`${ctx} must be an object`);
    return;
  }
  checkAllowedFields(block, INSTRUCTOR_BLOCK_FIELDS, ctx, errors);
  checkStableId(block.id, `${ctx}.id`, errors);
  if (!INSTRUCTOR_CONTENT_KINDS.includes(block.kind)) {
    errors.push(`${ctx}.kind must be one of: ${INSTRUCTOR_CONTENT_KINDS.join(', ')}`);
  }
  if (!nonEmptyString(block.title)) errors.push(`${ctx}.title must be a non-empty string`);
  if (!nonEmptyString(block.body)) errors.push(`${ctx}.body must be a non-empty string`);
}

function validateStage(stage, index, errors) {
  const ctx = `simulation.stages[${index}]`;
  if (!isRecord(stage)) {
    errors.push(`${ctx} must be an object`);
    return;
  }
  checkAllowedFields(stage, STAGE_FIELDS, ctx, errors);
  checkStableId(stage.id, `${ctx}.id`, errors);
  if (!nonEmptyString(stage.title)) errors.push(`${ctx}.title must be a non-empty string`);
  if (!nonEmptyString(stage.studentObjective)) {
    errors.push(`${ctx}.studentObjective must be a non-empty string`);
  }

  checkStringArray(stage.initialReleaseIds, `${ctx}.initialReleaseIds`, errors, { stableIds: true });
  checkStringArray(stage.optionalReleaseIds, `${ctx}.optionalReleaseIds`, errors, { stableIds: true });
  checkStringArray(stage.intakeTargetIds, `${ctx}.intakeTargetIds`, errors);
  checkStringArray(stage.instructorContentIds, `${ctx}.instructorContentIds`, errors, { stableIds: true });

  if (
    stage.suggestedMinutes !== null
    && stage.suggestedMinutes !== undefined
    && (!Number.isInteger(stage.suggestedMinutes) || stage.suggestedMinutes < 1 || stage.suggestedMinutes > 480)
  ) {
    errors.push(`${ctx}.suggestedMinutes must be null or an integer from 1 to 480`);
  }

  if (!DEBRIEF_EDIT_POLICIES.includes(stage.defaultDebriefEditPolicy)) {
    errors.push(`${ctx}.defaultDebriefEditPolicy must be one of: ${DEBRIEF_EDIT_POLICIES.join(', ')}`);
  }
}

/**
 * Validate an optional staged simulation definition.
 *
 * @param {unknown} simulation Candidate simulation definition.
 * @returns {string[]} Validation errors; empty when valid.
 */
export function validateStagedSimulation(simulation) {
  const errors = [];
  if (!isRecord(simulation)) return ['simulation must be an object'];

  checkAllowedFields(simulation, ROOT_FIELDS, 'simulation', errors);

  if (simulation.version !== STAGED_SIMULATION_VERSION) {
    errors.push(`simulation.version must equal ${STAGED_SIMULATION_VERSION}`);
  }

  if (!Array.isArray(simulation.studentContent)) {
    errors.push('simulation.studentContent must be an array');
  } else {
    simulation.studentContent.forEach((block, index) => validateStudentContentBlock(block, index, errors));
  }

  if (!Array.isArray(simulation.instructorContent)) {
    errors.push('simulation.instructorContent must be an array');
  } else {
    simulation.instructorContent.forEach((block, index) => validateInstructorContentBlock(block, index, errors));
  }

  if (!Array.isArray(simulation.stages) || simulation.stages.length === 0) {
    errors.push('simulation.stages must be a non-empty array');
  } else {
    simulation.stages.forEach((stage, index) => validateStage(stage, index, errors));
  }

  if (errors.length) return errors;

  const studentIds = simulation.studentContent.map(block => block.id.trim());
  const instructorIds = simulation.instructorContent.map(block => block.id.trim());
  const stageIds = simulation.stages.map(stage => stage.id.trim());
  const allContentIds = [...studentIds, ...instructorIds];

  if (!unique(studentIds)) errors.push('simulation.studentContent ids must be unique');
  if (!unique(instructorIds)) errors.push('simulation.instructorContent ids must be unique');
  if (!unique(allContentIds)) errors.push('Student and Instructor content ids must not collide');
  if (!unique(stageIds)) errors.push('simulation.stages ids must be unique');

  const studentSet = new Set(studentIds);
  const instructorSet = new Set(instructorIds);
  const usedStudentIds = new Set();
  const usedInstructorIds = new Set();

  simulation.stages.forEach((stage, index) => {
    const initial = stage.initialReleaseIds.map(value => value.trim());
    const optional = stage.optionalReleaseIds.map(value => value.trim());
    const overlap = initial.filter(id => optional.includes(id));
    if (overlap.length) {
      errors.push(`simulation.stages[${index}] must not list the same Student content as both initial and optional release: ${overlap.join(', ')}`);
    }

    [...initial, ...optional].forEach(id => {
      if (!studentSet.has(id)) {
        errors.push(`simulation.stages[${index}] references unknown Student content id: ${id}`);
      } else {
        usedStudentIds.add(id);
      }
    });

    stage.instructorContentIds.map(value => value.trim()).forEach(id => {
      if (!instructorSet.has(id)) {
        errors.push(`simulation.stages[${index}] references unknown Instructor content id: ${id}`);
      } else {
        usedInstructorIds.add(id);
      }
    });
  });

  studentIds.filter(id => !usedStudentIds.has(id)).forEach(id => {
    errors.push(`simulation.studentContent id is not referenced by any stage: ${id}`);
  });
  instructorIds.filter(id => !usedInstructorIds.has(id)).forEach(id => {
    errors.push(`simulation.instructorContent id is not referenced by any stage: ${id}`);
  });

  return errors;
}

function normalizeStudentBlock(block) {
  const common = {
    id: block.id.trim(),
    kind: block.kind.trim(),
    title: block.title.trim()
  };
  if (['narrative', 'prompt', 'evidence'].includes(common.kind)) {
    return { ...common, body: block.body.trim() };
  }
  if (common.kind === 'image') {
    return { ...common, assetId: block.assetId.trim(), alt: block.alt.trim() };
  }
  if (common.kind === 'document-page') {
    return {
      ...common,
      assetId: block.assetId.trim(),
      page: block.page,
      alt: block.alt.trim()
    };
  }
  return {
    ...common,
    headers: block.headers.map(value => value.trim()),
    rows: block.rows.map(row => row.map(value => value.trim()))
  };
}

/**
 * Normalize a simulation definition after validation.
 *
 * @param {object} simulation Valid simulation definition.
 * @returns {object} Canonical version-1 server manifest shape.
 */
export function normalizeStagedSimulation(simulation) {
  return {
    version: STAGED_SIMULATION_VERSION,
    studentContent: simulation.studentContent.map(normalizeStudentBlock),
    instructorContent: simulation.instructorContent.map(block => ({
      id: block.id.trim(),
      kind: block.kind.trim(),
      title: block.title.trim(),
      body: block.body.trim()
    })),
    stages: simulation.stages.map(stage => ({
      id: stage.id.trim(),
      title: stage.title.trim(),
      studentObjective: stage.studentObjective.trim(),
      initialReleaseIds: stage.initialReleaseIds.map(value => value.trim()),
      optionalReleaseIds: stage.optionalReleaseIds.map(value => value.trim()),
      intakeTargetIds: stage.intakeTargetIds.map(value => value.trim()),
      suggestedMinutes: stage.suggestedMinutes ?? null,
      instructorContentIds: stage.instructorContentIds.map(value => value.trim()),
      defaultDebriefEditPolicy: stage.defaultDebriefEditPolicy
    }))
  };
}

/**
 * Validate whether a resource may carry staged simulation metadata.
 *
 * @param {object} options Validation context.
 * @param {string} options.templateKind Resource kind.
 * @param {unknown} options.simulation Optional simulation definition.
 * @returns {string[]} Validation errors.
 */
export function validateSimulationForResource({ templateKind, simulation }) {
  if (simulation === undefined) return [];
  if (templateKind !== 'case-study') {
    return ['simulation is allowed only on protected case-study resources'];
  }
  return validateStagedSimulation(simulation);
}
