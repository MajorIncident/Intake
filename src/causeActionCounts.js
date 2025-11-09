import { listActions } from './actionsStore.js';
import { getAnalysisId } from './appState.js';

export function buildCauseActionCounts() {
  const analysisId = getAnalysisId();
  const items = Array.isArray(listActions(analysisId)) ? listActions(analysisId) : [];
  const counts = new Map();
  items.forEach(action => {
    const causeId = typeof action?.links?.hypothesisId === 'string'
      ? action.links.hypothesisId.trim()
      : '';
    if (!causeId) return;
    counts.set(causeId, (counts.get(causeId) || 0) + 1);
  });
  return counts;
}
