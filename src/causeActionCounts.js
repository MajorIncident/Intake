/**
 * @fileoverview Aggregates action items by their linked causes so downstream
 * summary and reporting modules can quickly look up how many actions exist for
 * each hypothesis within the active analysis.
 */

import { listActions } from './actionsStore.js';
import { getAnalysisId } from './appState.js';

/**
 * Builds a map of hypothesis IDs to the total number of actions associated
 * with each cause in the currently selected analysis.
 *
 * @returns {Map<string, number>} Map keyed by hypothesis ID with the number of
 * actions recorded for that cause.
 */
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
