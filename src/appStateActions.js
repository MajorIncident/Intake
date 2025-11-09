/**
 * @module appStateActions
 * @summary Utility helpers for determining how persisted actions should be imported.
 */

/**
 * Resolve the actions import strategy for a persisted snapshot.
 * @param {boolean} hasSnapshot - Indicates whether the original payload included an actions field.
 * @param {unknown} snapshot - Sanitized actions payload or legacy value.
 * @param {string} currentAnalysisId - Fallback identifier when snapshots omit analysis metadata.
 * @returns {{shouldImport: boolean, analysisId: string, items: Array<unknown>}} Resolution details for actions import.
 */
export function resolveActionsImport(hasSnapshot, snapshot, currentAnalysisId) {
  if (!hasSnapshot) {
    return {
      shouldImport: false,
      analysisId: currentAnalysisId,
      items: []
    };
  }
  const payload = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? snapshot
    : {};
  const trimmedId = typeof payload.analysisId === 'string' ? payload.analysisId.trim() : '';
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    shouldImport: true,
    analysisId: trimmedId || currentAnalysisId,
    items
  };
}
