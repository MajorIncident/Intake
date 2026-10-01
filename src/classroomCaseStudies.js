/**
 * @module classroomCaseStudies
 * @summary Owns authorized in-memory Classroom Case Study catalog and payload access.
 * @description
 *   Credentials remain owned by the Student/Instructor classroom controllers.
 *   This module receives the active capability only while that classroom role is
 *   connected, fetches protected resources with Authorization headers, and never
 *   persists capabilities, catalog content, or payloads to Intake state/storage.
 */

export const INSTRUCTOR_CASE_STUDIES_ENDPOINT = '/api/classes/case-studies';
export const STUDENT_CASE_STUDIES_ENDPOINT = '/api/classes/case-studies/student';

const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function validCapability(value) {
  return typeof value === 'string' && CAPABILITY_PATTERN.test(value.trim());
}

function sanitizeCatalog(records) {
  if (!Array.isArray(records)) return [];
  return records
    .filter(record => (
      record
      && typeof record.id === 'string'
      && typeof record.name === 'string'
      && typeof record.description === 'string'
      && record.templateKind === 'case-study'
      && Array.isArray(record.supportedModes)
    ))
    .map(record => ({
      id: record.id,
      name: record.name,
      description: record.description,
      templateKind: 'case-study',
      supportedModes: record.supportedModes.filter(mode => typeof mode === 'string')
    }));
}

/**
 * Create the protected Classroom Case Study controller.
 *
 * @param {object} [options] Dependency overrides.
 * @returns {object} In-memory resource controller.
 */
export function createClassroomCaseStudiesController({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  windowRef = globalThis.window
} = {}) {
  let context = null;
  let catalog = [];
  let loading = false;
  let lastError = '';
  let epoch = 0;
  let destroyed = false;

  const emit = () => {
    try {
      if (typeof windowRef?.dispatchEvent !== 'function' || typeof windowRef?.CustomEvent !== 'function') return;
      windowRef.dispatchEvent(new windowRef.CustomEvent('intake:protected-case-studies-changed'));
    } catch {}
  };

  const endpointFor = role => role === 'instructor'
    ? INSTRUCTOR_CASE_STUDIES_ENDPOINT
    : STUDENT_CASE_STUDIES_ENDPOINT;

  const clear = () => {
    epoch += 1;
    context = null;
    catalog = [];
    loading = false;
    lastError = '';
    emit();
  };

  const connect = async (role, capability) => {
    const token = typeof capability === 'string' ? capability.trim() : '';
    if (destroyed || !['student', 'instructor'].includes(role) || !validCapability(token) || typeof fetchImpl !== 'function') {
      clear();
      return false;
    }

    const localEpoch = ++epoch;
    context = { role, capability: token };
    catalog = [];
    loading = true;
    lastError = '';
    emit();

    try {
      const response = await fetchImpl(endpointFor(role), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json().catch(() => ({}));
      if (destroyed || localEpoch !== epoch || context?.capability !== token || context?.role !== role) return false;
      if (!response.ok || !Array.isArray(body.caseStudies)) {
        catalog = [];
        lastError = response.status === 401 || response.status === 404
          ? 'Class resources are no longer available.'
          : 'Could not load class resources.';
        return false;
      }
      catalog = sanitizeCatalog(body.caseStudies);
      return true;
    } catch {
      if (destroyed || localEpoch !== epoch) return false;
      catalog = [];
      lastError = 'Could not load class resources.';
      return false;
    } finally {
      if (!destroyed && localEpoch === epoch) {
        loading = false;
        emit();
      }
    }
  };

  const getPayload = async caseStudyId => {
    if (
      destroyed
      || !context
      || typeof caseStudyId !== 'string'
      || !caseStudyId.trim()
      || typeof fetchImpl !== 'function'
    ) return null;

    const requestedId = caseStudyId.trim();
    const localContext = { ...context };
    const localEpoch = epoch;
    try {
      const response = await fetchImpl(endpointFor(localContext.role), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localContext.capability}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ caseStudyId: requestedId })
      });
      const body = await response.json().catch(() => ({}));
      if (
        destroyed
        || localEpoch !== epoch
        || context?.capability !== localContext.capability
        || context?.role !== localContext.role
      ) return null;
      const record = body.caseStudy;
      if (
        !response.ok
        || !record
        || record.id !== requestedId
        || record.templateKind !== 'case-study'
        || !record.state
        || typeof record.state !== 'object'
        || !Array.isArray(record.supportedModes)
      ) {
        lastError = 'Could not load this Case Study.';
        emit();
        return null;
      }
      lastError = '';
      return clone(record);
    } catch {
      if (!destroyed && localEpoch === epoch) {
        lastError = 'Could not load this Case Study.';
        emit();
      }
      return null;
    }
  };

  return {
    connectStudent: capability => connect('student', capability),
    connectInstructor: capability => connect('instructor', capability),
    disconnect: clear,
    destroy: () => {
      destroyed = true;
      clear();
    },
    getCatalog: () => catalog.map(record => ({ ...record, supportedModes: [...record.supportedModes] })),
    getPayload,
    getState: () => ({
      role: context?.role || null,
      connected: Boolean(context),
      loading,
      lastError,
      catalogCount: catalog.length
    })
  };
}

/**
 * Initialize the protected Case Study controller.
 *
 * @param {Parameters<typeof createClassroomCaseStudiesController>[0]} options Dependencies.
 * @returns {ReturnType<typeof createClassroomCaseStudiesController>} Controller.
 */
export function initClassroomCaseStudies(options) {
  return createClassroomCaseStudiesController(options);
}
