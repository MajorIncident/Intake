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
      function getMocks() {
        const mocks = globalThis.__actionsStoreMocks;
        if (!mocks) {
          throw new Error('actionsStore mocks not initialised');
        }
        return mocks;
      }
      export const listActions = (...args) => getMocks().listActions(...args);
      export const createAction = (...args) => getMocks().createAction(...args);
      export const patchAction = (...args) => getMocks().patchAction(...args);
      export const removeAction = (...args) => getMocks().removeAction(...args);
      export const sortActions = (...args) => getMocks().sortActions(...args);
      export const exportActionsState = (...args) => getMocks().exportActionsState?.(...args) ?? [];
      export const importActionsState = (...args) => getMocks().importActionsState?.(...args) ?? [];
      export const normalizeActionSnapshot = (...args) => (
        getMocks().normalizeActionSnapshot?.(...args) ?? ({ ...(args[0] && typeof args[0] === 'object' ? args[0] : {}) })
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
      function getMocks() {
        return globalThis.__appStateMocks ?? defaultMocks;
      }
      export const getAnalysisId = (...args) => getMocks().getAnalysisId(...args);
      export const getLikelyCauseId = (...args) => getMocks().getLikelyCauseId(...args);
      export const collectAppState = (...args) => getMocks().collectAppState?.(...args) ?? {};
      export const applyAppState = (...args) => getMocks().applyAppState?.(...args);
    `;
  }
  if (kind === 'kt') {
    return `
      function getMocks() {
        const mocks = globalThis.__ktMocks;
        if (!mocks) {
          throw new Error('kt mocks not initialised');
        }
        return mocks;
      }
      export const getPossibleCauses = (...args) => getMocks().getPossibleCauses?.(...args) ?? [];
      export const setPossibleCauses = (...args) => getMocks().setPossibleCauses?.(...args);
      export const ensurePossibleCausesUI = (...args) => getMocks().ensurePossibleCausesUI?.(...args);
      export const renderCauses = (...args) => getMocks().renderCauses?.(...args);
      export const focusFirstEditableCause = (...args) => getMocks().focusFirstEditableCause?.(...args);
      export const updateCauseEvidencePreviews = (...args) => getMocks().updateCauseEvidencePreviews?.(...args);
      export const exportKTTableState = (...args) => getMocks().exportKTTableState?.(...args) ?? [];
      export const importKTTableState = (...args) => getMocks().importKTTableState?.(...args) ?? [];
      export const getRowsBuilt = (...args) => getMocks().getRowsBuilt?.(...args) ?? [];
      export const causeHasFailure = (...args) => getMocks().causeHasFailure?.(...args) ?? false;
      export const causeStatusLabel = (...args) => getMocks().causeStatusLabel?.(...args) ?? '';
      export const getLikelyCauseId = (...args) => getMocks().getLikelyCauseId?.(...args) ?? null;
      export const setLikelyCauseId = (...args) => getMocks().setLikelyCauseId?.(...args);
      export const countCauseAssumptions = (...args) => getMocks().countCauseAssumptions?.(...args) ?? 0;
      export const evidencePairIndexes = (...args) => getMocks().evidencePairIndexes?.(...args) ?? [];
      export const countCompletedEvidence = (...args) => getMocks().countCompletedEvidence?.(...args) ?? 0;
      export const getRowKeyByIndex = (...args) => getMocks().getRowKeyByIndex?.(...args) ?? '';
      export const peekCauseFinding = (...args) => getMocks().peekCauseFinding?.(...args) ?? null;
      export const findingMode = (...args) => getMocks().findingMode?.(...args) ?? '';
      export const findingNote = (...args) => getMocks().findingNote?.(...args) ?? '';
      export const buildHypothesisSentence = (...args) => getMocks().buildHypothesisSentence?.(...args) ?? '';
      export const fillTokens = (...args) => getMocks().fillTokens?.(...args) ?? '';
      export const getTableElement = (...args) => getMocks().getTableElement?.(...args) ?? null;
      export const getTableFocusMode = (...args) => getMocks().getTableFocusMode?.(...args) ?? '';
      export const setTableFocusMode = (...args) => getMocks().setTableFocusMode?.(...args);
      export const getObjectISField = (...args) => getMocks().getObjectISField?.(...args) ?? null;
      export const getDeviationISField = (...args) => getMocks().getDeviationISField?.(...args) ?? null;
      export const isObjectISDirty = (...args) => getMocks().isObjectISDirty?.(...args) ?? false;
      export const isDeviationISDirty = (...args) => getMocks().isDeviationISDirty?.(...args) ?? false;
      export const refreshAllTokenizedText = (...args) => getMocks().refreshAllTokenizedText?.(...args);
    `;
  }
  if (kind === 'toast') {
    return `
      function getMocks() {
        const mocks = globalThis.__toastMocks;
        if (!mocks) {
          throw new Error('toast mocks not initialised');
        }
        return mocks;
      }
      export const showToast = (...args) => getMocks().showToast(...args);
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
