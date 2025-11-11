const projectRoot = new URL('..', import.meta.url);

const stubMap = new Map([
  [new URL('./src/actionsStore.js', projectRoot).href, 'actionsStore'],
  [new URL('./src/appState.js', projectRoot).href, 'appState'],
  [new URL('./src/kt.js', projectRoot).href, 'kt'],
  [new URL('./src/toast.js', projectRoot).href, 'toast']
]);

const conditionalStubMap = new Map([
  [new URL('./src/steps.js', projectRoot).href, 'steps'],
  [new URL('./src/commsDrawer.js', projectRoot).href, 'commsDrawer'],
  [new URL('./src/summary.js', projectRoot).href, 'summary'],
  [new URL('./src/preface.js', projectRoot).href, 'preface'],
  [new URL('./src/comms.js', projectRoot).href, 'comms'],
  [new URL('./src/fileTransfer.js', projectRoot).href, 'fileTransfer']
]);

function shouldUseConditionalStub(kind) {
  const envValue = typeof process !== 'undefined' ? process.env?.TEST_STUB_MODULES : '';
  if (typeof envValue === 'string' && envValue.trim()) {
    const trimmed = envValue.trim();
    if (trimmed === '*') {
      return true;
    }
    const envParts = trimmed.split(',').map(part => part.trim()).filter(Boolean);
    if (envParts.includes(kind)) {
      return true;
    }
  }
  const stubs = globalThis.__testStubModules;
  if (!stubs) {
    return false;
  }
  if (stubs === '*') {
    return true;
  }
  if (stubs instanceof Set) {
    return stubs.has(kind);
  }
  if (Array.isArray(stubs)) {
    return stubs.includes(kind);
  }
  if (typeof stubs === 'object') {
    return Boolean(stubs[kind]);
  }
  return false;
}

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
      export const ACTIONS_STORAGE_KEY = 'kt-actions-by-analysis-v1';
      export const PRIORITY_SEQUENCE = Object.freeze(['High', 'Med', 'Low']);
      const LEGACY_PRIORITY_ALIASES = { P1: 'High', P2: 'Med', P3: 'Low' };
      const SUPPORTED_PRIORITY_LABELS = new Set([...PRIORITY_SEQUENCE, 'Blocked', 'Deferred', 'Cancelled']);
      const baseNormalizePriorityLabel = (priority) => {
        if (typeof priority !== 'string') return 'Med';
        const trimmed = priority.trim();
        if (!trimmed) return 'Med';
        const alias = LEGACY_PRIORITY_ALIASES[trimmed];
        const normalized = alias || trimmed;
        if (SUPPORTED_PRIORITY_LABELS.has(normalized)) {
          return normalized;
        }
        return 'Med';
      };
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
      export const normalizePriorityLabel = (...args) => {
        const mocks = getMocks();
        if (typeof mocks.normalizePriorityLabel === 'function') {
          return mocks.normalizePriorityLabel(...args);
        }
        return baseNormalizePriorityLabel(...args);
      };
    `;
  }
  if (kind === 'appState') {
    return `
      const defaultMocks = {
        getAnalysisId: () => '',
        getLikelyCauseId: () => null,
        collectAppState: () => ({}),
        applyAppState: () => {},
        getSummaryState: () => ({}),
        resetAnalysisId: () => {}
      };
      function getMocks() {
        return globalThis.__appStateMocks ?? defaultMocks;
      }
      export const getAnalysisId = (...args) => getMocks().getAnalysisId(...args);
      export const getLikelyCauseId = (...args) => getMocks().getLikelyCauseId(...args);
      export const collectAppState = (...args) => getMocks().collectAppState?.(...args) ?? {};
      export const applyAppState = (...args) => getMocks().applyAppState?.(...args);
      export const getSummaryState = (...args) => getMocks().getSummaryState?.(...args) ?? {};
      export const resetAnalysisId = (...args) => getMocks().resetAnalysisId?.(...args);
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
      export const configureKT = (...args) => getMocks().configureKT?.(...args);
      export const initTable = (...args) => getMocks().initTable?.(...args);
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
      export const getRowKeyByIndex = (...args) => getMocks().getRowKeyByIndex?.(...args) ?? '';
      export const buildHypothesisSentence = (...args) => getMocks().buildHypothesisSentence?.(...args) ?? '';
      export const buildCauseDecisionSummary = (...args) => getMocks().buildCauseDecisionSummary?.(...args) ?? '';
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
  if (kind === 'fileTransfer') {
    return `
      function getMocks() {
        const mocks = globalThis.__fileTransferMocks;
        if (!mocks) {
          throw new Error('fileTransfer mocks not initialised');
        }
        return mocks;
      }
      export const exportAppStateToFile = (...args) => getMocks().exportAppStateToFile?.(...args);
      export const importAppStateFromFile = (...args) => getMocks().importAppStateFromFile?.(...args);
    `;
  }
  if (kind === 'steps') {
    return `
      function getMocks() {
        const mocks = globalThis.__stepsMocks;
        if (!mocks) {
          throw new Error('steps mocks not initialised');
        }
        return mocks;
      }
      export const initStepsFeature = (...args) => getMocks().initStepsFeature?.(...args);
      export const resetStepsState = (...args) => getMocks().resetStepsState?.(...args);
    `;
  }
  if (kind === 'commsDrawer') {
    return `
      function getMocks() {
        const mocks = globalThis.__commsDrawerMocks;
        if (!mocks) {
          throw new Error('commsDrawer mocks not initialised');
        }
        return mocks;
      }
      export const COMMS_DRAWER_STORAGE_KEY = 'comms.drawerOpen';
      export const initCommsDrawer = (...args) => getMocks().initCommsDrawer?.(...args);
      export const toggleCommsDrawer = (...args) => getMocks().toggleCommsDrawer?.(...args);
      export const closeCommsDrawer = (...args) => getMocks().closeCommsDrawer?.(...args);
    `;
  }
  if (kind === 'summary') {
    return `
      function getMocks() {
        const mocks = globalThis.__summaryMocks;
        if (!mocks) {
          throw new Error('summary mocks not initialised');
        }
        return mocks;
      }
      export const generateSummary = (...args) => getMocks().generateSummary?.(...args);
      export const setSummaryStateProvider = (...args) => getMocks().setSummaryStateProvider?.(...args);
    `;
  }
  if (kind === 'preface') {
    return `
      function getMocks() {
        const mocks = globalThis.__prefaceMocks;
        if (!mocks) {
          throw new Error('preface mocks not initialised');
        }
        return mocks;
      }
      export const initPreface = (...args) => getMocks().initPreface?.(...args);
      export const autoResize = (...args) => getMocks().autoResize?.(...args);
      export const updatePrefaceTitles = (...args) => getMocks().updatePrefaceTitles?.(...args);
      export const startMirrorSync = (...args) => getMocks().startMirrorSync?.(...args);
      export const setBridgeOpenedNow = (...args) => getMocks().setBridgeOpenedNow?.(...args);
      export const getPrefaceState = (...args) => getMocks().getPrefaceState?.(...args) ?? { ops: {} };
      export const getObjectFull = (...args) => getMocks().getObjectFull?.(...args) ?? '';
      export const getDeviationFull = (...args) => getMocks().getDeviationFull?.(...args) ?? '';
    `;
  }
  if (kind === 'comms') {
    return `
      function getMocks() {
        const mocks = globalThis.__commsMocks;
        if (!mocks) {
          throw new Error('comms mocks not initialised');
        }
        return mocks;
      }
      export const initializeCommunications = (...args) => getMocks().initializeCommunications?.(...args);
      export const logCommunication = (...args) => getMocks().logCommunication?.(...args);
      export const toggleLogVisibility = (...args) => getMocks().toggleLogVisibility?.(...args);
      export const setCadence = (...args) => getMocks().setCadence?.(...args);
      export const setManualNextUpdate = (...args) => getMocks().setManualNextUpdate?.(...args);
      export const getCommunicationElements = (...args) => getMocks().getCommunicationElements?.(...args) ?? ({
        internalBtn: null,
        externalBtn: null,
        logToggleBtn: null,
        nextUpdateInput: null,
        cadenceRadios: []
      });
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
  if (conditionalStubMap.has(resolution.url)) {
    const kind = conditionalStubMap.get(resolution.url);
    if (shouldUseConditionalStub(kind)) {
      return { url: `stub:${kind}` };
    }
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
