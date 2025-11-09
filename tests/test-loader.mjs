const projectRoot = new URL('..', import.meta.url);

const stubMap = new Map([
  [new URL('./src/actionsStore.js', projectRoot).href, 'actionsStore'],
  [new URL('./src/appState.js', projectRoot).href, 'appState'],
  [new URL('./src/kt.js', projectRoot).href, 'kt'],
  [new URL('./src/toast.js', projectRoot).href, 'toast']
]);

function createSource(kind) {
  if (kind === 'actionsStore') {
    return `
      const mocks = globalThis.__actionsStoreMocks;
      if (!mocks) {
        throw new Error('actionsStore mocks not initialised');
      }
      export const listActions = (...args) => mocks.listActions(...args);
      export const createAction = (...args) => mocks.createAction(...args);
      export const patchAction = (...args) => mocks.patchAction(...args);
      export const removeAction = (...args) => mocks.removeAction(...args);
      export const sortActions = (...args) => mocks.sortActions(...args);
      export const exportActionsState = (...args) => mocks.exportActionsState?.(...args) ?? [];
      export const importActionsState = (...args) => mocks.importActionsState?.(...args) ?? [];
      export const normalizeActionSnapshot = (...args) => (
        mocks.normalizeActionSnapshot?.(...args) ?? ({ ...(args[0] && typeof args[0] === 'object' ? args[0] : {}) })
      );
    `;
  }
  if (kind === 'appState') {
    return `
      const defaultMocks = {
        getAnalysisId: () => '',
        getLikelyCauseId: () => null,
        collectAppState: () => ({}),
        applyAppState: () => {}
      };
      const mocks = globalThis.__appStateMocks ?? defaultMocks;
      export const getAnalysisId = (...args) => mocks.getAnalysisId(...args);
      export const getLikelyCauseId = (...args) => mocks.getLikelyCauseId(...args);
      export const collectAppState = (...args) => mocks.collectAppState?.(...args) ?? {};
      export const applyAppState = (...args) => mocks.applyAppState?.(...args);
    `;
  }
  if (kind === 'kt') {
    return `
      const mocks = globalThis.__ktMocks;
      if (!mocks) {
        throw new Error('kt mocks not initialised');
      }
      export const getPossibleCauses = (...args) => mocks.getPossibleCauses?.(...args) ?? [];
      export const causeHasFailure = (...args) => mocks.causeHasFailure?.(...args) ?? false;
      export const buildHypothesisSentence = (...args) => mocks.buildHypothesisSentence?.(...args) ?? '';
      export const getObjectISField = (...args) => mocks.getObjectISField?.(...args) ?? null;
      export const getDeviationISField = (...args) => mocks.getDeviationISField?.(...args) ?? null;
      export const isObjectISDirty = (...args) => mocks.isObjectISDirty?.(...args) ?? false;
      export const isDeviationISDirty = (...args) => mocks.isDeviationISDirty?.(...args) ?? false;
      export const refreshAllTokenizedText = (...args) => mocks.refreshAllTokenizedText?.(...args);
    `;
  }
  if (kind === 'toast') {
    return `
      const mocks = globalThis.__toastMocks;
      if (!mocks) {
        throw new Error('toast mocks not initialised');
      }
      export const showToast = (...args) => mocks.showToast(...args);
    `;
  }
  return '';
}

export async function resolve(specifier, context, defaultResolve) {
  const resolution = await defaultResolve(specifier, context, defaultResolve);
  if (stubMap.has(resolution.url)) {
    const kind = stubMap.get(resolution.url);
    return { url: `stub:${kind}` };
  }
  return resolution;
}

export async function load(url, context, defaultLoad) {
  if (url.startsWith('stub:')) {
    const kind = url.slice(5);
    return {
      format: 'module',
      source: createSource(kind),
      shortCircuit: true
    };
  }
  return defaultLoad(url, context, defaultLoad);
}
