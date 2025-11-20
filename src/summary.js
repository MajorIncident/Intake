/**
 * @module summary
 * This module assembles human-readable incident summaries by collecting
 * structured state from the intake UI. It formats bridge logistics,
 * containment, impact, communications cadence, Kepner-Tregoe analysis, and
 * possible cause progress into a cohesive block of text that can be copied or
 * shared with AI assistants.
 */
import { CAUSE_FINDING_MODES, STEPS_PHASES } from './constants.js';

let stateProvider = () => ({ });

const CONTAINMENT_STATUS_LABELS = Object.freeze({
  assessing: 'Assessing',
  stoppingImpact: 'Stopping the impact',
  stabilized: 'Stabilized/Workaround Active',
  fixInProgress: 'Fix in progress',
  restoring: 'Restoring service',
  monitoring: 'Monitoring stability',
  closed: 'Closed'
});

const LEGACY_CONTAINMENT_STATUS_LABELS = Object.freeze({
  none: CONTAINMENT_STATUS_LABELS.assessing,
  mitigation: CONTAINMENT_STATUS_LABELS.stabilized,
  restore: CONTAINMENT_STATUS_LABELS.restoring
});

/**
 * Normalizes summary state access by preferring an explicit input before
 * falling back to the registered provider.
 * @param {object} [input] - Optional pre-resolved state object.
 * @returns {object} The resolved state snapshot used for summary generation.
 */
function resolveState(input){
  if(input && typeof input === 'object'){ return input; }
  try{
    return stateProvider ? stateProvider() : {};
  }catch(_){
    return {};
  }
}

/**
 * Registers a lazy state provider that returns the DOM-backed summary state.
 * @param {() => object} provider - Function that resolves the current summary
 *   state tree when invoked.
 * @returns {void}
 */
export function setSummaryStateProvider(provider){
  if(typeof provider === 'function'){
    stateProvider = provider;
  }
}

/**
 * Collapses multiline text into a single inline string separated by middle dots.
 * @param {string} value - Raw multiline text entered by users.
 * @returns {string} Display-safe inline text or an em dash placeholder.
 */
function inlineText(value){
  const v = (value || '').trim();
  if(!v) return '—';
  return v
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join(' · ');
}

/**
 * Converts multiline summary fields into inline text segments.
 * @param {string} value - Raw multiline summary text.
 * @returns {string} Flattened summary text or an empty string when blank.
 */
function inlineSummaryText(value){
  const lines = splitLines(value);
  if(!lines.length) return '';
  return lines.join(' · ');
}

/**
 * Produces a labeled single-line summary by flattening line breaks with a
 * middle dot separator.
 * @param {string} label - Field label rendered before the colon.
 * @param {string} value - User-provided multiline value to normalize.
 * @returns {string} The formatted "Label: value" text or an empty string when
 *   no content is available.
 */
export function summaryLine(label, value){
  const text = inlineSummaryText(value);
  if(!text) return '';
  return `${label}: ${text}`;
}

/**
 * Produces a labeled single-line summary without normalizing whitespace.
 * @param {string} label - Field label rendered before the colon.
 * @param {string} value - Raw value to append after the colon.
 * @returns {string} The formatted "Label: value" text or an empty string when
 *   no content is available.
 */
export function summaryLineRaw(label, value){
  const text = (value || '').trim();
  if(!text) return '';
  return `${label}: ${text}`;
}

/**
 * Formats a bullet line with flattened summary content.
 * @param {string} label - Bullet label displayed after the bullet.
 * @param {string} value - Multiline value to normalize.
 * @returns {string} Bullet line or an empty string when blank.
 */
function summaryBullet(label, value){
  const text = inlineSummaryText(value);
  if(!text) return '';
  return `• ${label}: ${text}`;
}

/**
 * Formats a bullet line with raw text content without normalization.
 * @param {string} label - Bullet label displayed after the bullet.
 * @param {string} value - Raw value to include.
 * @returns {string} Bullet line or an empty string when blank.
 */
function summaryBulletRaw(label, value){
  const text = (value || '').trim();
  if(!text) return '';
  return `• ${label}: ${text}`;
}

/**
 * Joins summary lines, skipping empty or whitespace-only entries.
 * @param {string[]} lines - Candidate lines to merge.
 * @returns {string} Joined lines separated by newlines.
 */
function joinSummaryLines(lines){
  return lines.filter(line => line && line.trim().length).join('\n');
}

/**
 * Splits text into trimmed non-empty lines.
 * @param {string} text - Value to split on newline boundaries.
 * @returns {string[]} Array of cleaned lines.
 */
function splitLines(text){
  const v = (text || '').trim();
  if(!v) return [];
  return v.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

/**
 * Formats paired distinction/change lines into readable comparisons.
 * @param {string[]} distLines - Lines describing what changed or stayed the same.
 * @param {string[]} changeLines - Lines describing contrasting values.
 * @returns {string} Joined distinction summary suitable for inline display.
 */
function formatDistinctionChanges(distLines, changeLines){
  const len = Math.max(distLines.length, changeLines.length);
  if(len === 0) return '';
  if(len === 1){
    const left = distLines[0] || '—';
    const right = changeLines[0] || '—';
    return `${left} → ${right}`;
  }
  const pairs = [];
  for(let i = 0; i < len; i++){
    const left = distLines[i] || '—';
    const right = changeLines[i] || '—';
    pairs.push(`${left} → ${right}`);
  }
  return pairs.join(' · ');
}

/**
 * Collects labels for checked chip inputs.
 * @param {{el: HTMLInputElement|{checked?: boolean}, label: string}[]} list -
 *   Input list describing chip controls and labels.
 * @returns {string} Comma-separated label list of selected chips.
 */
function formatChipsetSelections(list){
  const selected = list
    .filter(item => item.el?.checked)
    .map(item => item.label);
  return selected.length ? selected.join(', ') : '';
}

/**
 * Resolves the human-friendly containment status label from state helpers.
 * @param {object} state - Summary state exposing containment accessors.
 * @returns {string} Containment status label or an empty string when unknown.
 */
function containmentStatusText(state){
  if(!state || typeof state.getContainmentStatus !== 'function') return '';
  const status = state.getContainmentStatus();
  if(CONTAINMENT_STATUS_LABELS[status]) return CONTAINMENT_STATUS_LABELS[status];
  return LEGACY_CONTAINMENT_STATUS_LABELS[status] || '';
}

/**
 * Retrieves the latest communication log entry for the specified channel.
 * @param {object} state - State containing `commLog` entries.
 * @param {string} type - Entry type to filter (e.g., "internal" or "external").
 * @returns {object|undefined} Matching log entry with a timestamp.
 */
function latestCommEntry(state, type){
  const log = Array.isArray(state?.commLog) ? state.commLog : [];
  return log.find(entry => entry && entry.type === type && entry.ts);
}

/**
 * Converts a timestamp into ISO 8601 text when possible.
 * @param {string|number|Date} ts - Timestamp to normalize.
 * @returns {string} ISO formatted timestamp or the raw value when invalid.
 */
function formatCommTimestamp(ts){
  if(!ts) return '';
  const d = new Date(ts);
  if(Number.isNaN(d.valueOf())) return ts;
  return d.toISOString();
}

/**
 * Builds a communications summary line for the most recent update of a type.
 * @param {object} state - Summary state with communication history.
 * @param {string} type - Communication channel identifier.
 * @param {string} label - Label prefix for the summary line.
 * @returns {string} Formatted summary line or an empty string when absent.
 */
function formatCommSummaryLine(state, type, label){
  const entry = latestCommEntry(state, type);
  if(!entry) return '';
  const ts = formatCommTimestamp(entry.ts);
  return ts ? `${label}: ${ts}` : '';
}

/**
 * Determines the next scheduled update line using ISO timestamps or form input.
 * @param {object} state - Summary state that may provide next update values.
 * @returns {string} Summary line describing the next update commitment.
 */
function nextUpdateSummaryLine(state){
  const iso = typeof state?.commNextDueIso === 'string' ? state.commNextDueIso : '';
  if(iso){
    const d = new Date(iso);
    if(!Number.isNaN(d.valueOf())){
      return `Next Update: ${d.toISOString()}`;
    }
    return `Next Update: ${iso}`;
  }
  const nextInput = state?.commNextUpdateTime ?? document.getElementById('commNextUpdateTime');
  if(nextInput?.value){
    return `Next Update: ${nextInput.value}`;
  }
  return '';
}

const CAUSE_STATUS_LABELS = Object.freeze({
  not_tested: 'Not tested yet',
  in_progress: 'Testing',
  completed: 'Explains all evidence',
  failed: 'Failed testing'
});

/**
 * Provides fallback labels for KT evidence dimensions.
 * @param {string} dim - Dimension key (WHAT, WHERE, WHEN, EXTENT).
 * @returns {string} Friendly description associated with the dimension.
 */
function dimensionPhrase(dim){
  switch((dim || '').toUpperCase()){
    case 'WHAT':
      return 'Describe the object/deviation';
    case 'WHERE':
      return 'Describe where it occurs';
    case 'WHEN':
      return 'Describe when it was first seen';
    case 'EXTENT':
      return 'Describe size/scope/impact';
    default:
      return 'Evidence detail';
  }
}

/**
 * Builds aggregate evidence details for a possible cause, including progress
 * counts and rich bullet output sourced from KT evidence rows.
 * @param {object} state - Summary state accessor that exposes evidence lookup
 *   helpers (e.g., `evidencePairIndexes`, `peekCauseFinding`).
 * @param {object} cause - Possible cause record currently being summarized.
 * @returns {{total: number, complete: number, failedCount: number, evidenceBlock: string}}
 *   Breakdown of evidence completion and formatted walkthrough text.
 */
function collectCauseEvidenceDetails(state, cause){
  const evidenceIndexes = typeof state?.evidencePairIndexes === 'function'
    ? state.evidencePairIndexes()
    : [];
  const total = evidenceIndexes.length;
  const rows = Array.isArray(state?.rowsBuilt) ? state.rowsBuilt : [];
  const canInspectEntries = typeof state?.peekCauseFinding === 'function'
    && typeof state?.findingMode === 'function'
    && typeof state?.findingNote === 'function';
  const entries = [];

  if(canInspectEntries){
    evidenceIndexes.forEach(index => {
      const key = typeof state?.getRowKeyByIndex === 'function'
        ? state.getRowKeyByIndex(index)
        : `row-${index}`;
      const entry = state.peekCauseFinding(cause, key);
      if(!entry) return;
      const mode = state.findingMode(entry);
      const rawNote = typeof state.findingNote === 'function' ? state.findingNote(entry) : '';
      const note = typeof rawNote === 'string' ? rawNote.trim() : '';
      if(!mode) return;
      const row = rows[index];
      const rawHeader = row?.def?.q || row?.th?.textContent || '';
      let dimensionKey = '';
      let dimensionDetail = '';
      if(rawHeader){
        const parts = rawHeader.split('—');
        if(parts.length > 1){
          dimensionKey = parts[0].trim().toUpperCase();
          dimensionDetail = parts.slice(1).join('—').trim();
        }else{
          dimensionDetail = rawHeader.trim();
        }
      }
      const formattedNote = note ? inlineText(note) : '';
      entries.push({
        mode,
        note,
        formattedNote,
        dimensionKey,
        dimensionDetail
      });
    });
  }

  const completedRaw = typeof state?.countCompletedEvidence === 'function'
    ? state.countCompletedEvidence(cause, evidenceIndexes)
    : entries.filter(entry => entry.note).length;
  const complete = Math.max(0, Math.min(total, completedRaw || 0));

  const failedCount = entries.filter(entry => entry.mode === CAUSE_FINDING_MODES.FAIL).length
    || (typeof state?.causeHasFailure === 'function' && state.causeHasFailure(cause) ? 1 : 0);

  const evidenceLines = entries.map(entry => {
    const { mode, formattedNote, note, dimensionKey, dimensionDetail } = entry;
    const header = dimensionKey
      ? `${dimensionKey} — ${dimensionDetail || dimensionPhrase(dimensionKey)}`
      : (dimensionDetail || dimensionPhrase(''));
    let detail = '';
    if(mode === CAUSE_FINDING_MODES.FAIL){
      detail = formattedNote ? `Fails because: ${formattedNote}` : 'Fails';
    }else if(mode === CAUSE_FINDING_MODES.YES){
      detail = formattedNote ? `Pass: ${formattedNote}` : 'Pass';
    }else if(mode === CAUSE_FINDING_MODES.ASSUMPTION){
      detail = formattedNote ? `Needs assumption: ${formattedNote}` : 'Needs assumption';
    }else{
      detail = formattedNote || note || '';
    }
    return `  • ${header}\n    - ${detail}`;
  });

  const evidenceBlock = evidenceLines.length
    ? `Evidence walkthrough:\n${evidenceLines.join('\n')}`
    : '';

  return {
    total,
    complete,
    failedCount,
    evidenceBlock
  };
}

/**
 * Resolves a cause title, falling back to a numbered placeholder.
 * @param {object} cause - Cause entry that may contain a `title`.
 * @param {number} index - Zero-based cause index for placeholders.
 * @returns {string} Display title for the cause card.
 */
function resolveCauseTitle(cause, index){
  const explicit = typeof cause?.title === 'string' ? cause.title.trim() : '';
  if(explicit){
    return explicit;
  }
  return `Possible Cause ${index + 1}`;
}

/**
 * Derives a normalized cause status label by checking explicit and inferred values.
 * @param {object} state - Summary state exposing status helpers.
 * @param {object} cause - Cause entry to evaluate.
 * @param {{failedCount: number, total: number, complete: number}} details - Evidence metrics for the cause.
 * @returns {string} Human-friendly status string.
 */
function describeCauseStatus(state, cause, details){
  const statusRaw = typeof cause?.status === 'string' ? cause.status.trim().toLowerCase() : '';
  if(statusRaw && CAUSE_STATUS_LABELS[statusRaw]){
    return CAUSE_STATUS_LABELS[statusRaw];
  }

  if(typeof state?.causeStatusLabel === 'function'){
    const label = state.causeStatusLabel(cause) || '';
    const normalized = label.trim().toLowerCase();
    if(normalized.includes('failed')) return CAUSE_STATUS_LABELS.failed;
    if(normalized.includes('explains')) return CAUSE_STATUS_LABELS.completed;
    if(normalized.includes('testing')) return CAUSE_STATUS_LABELS.in_progress;
    if(normalized.includes('not tested') || normalized.includes('ready to test') || normalized.includes('waiting')){
      return CAUSE_STATUS_LABELS.not_tested;
    }
    if(normalized.includes('draft') || normalized.includes('editing')){
      return CAUSE_STATUS_LABELS.not_tested;
    }
  }

  if(details.failedCount > 0) return CAUSE_STATUS_LABELS.failed;
  if(details.total === 0){
    return details.complete > 0 ? CAUSE_STATUS_LABELS.in_progress : CAUSE_STATUS_LABELS.not_tested;
  }
  if(details.complete >= details.total && details.total > 0){
    return CAUSE_STATUS_LABELS.completed;
  }
  if(details.complete > 0){
    return CAUSE_STATUS_LABELS.in_progress;
  }
  return CAUSE_STATUS_LABELS.not_tested;
}

/**
 * Converts the possible cause workspace into formatted text sections that show
 * likely and remaining hypotheses with evidence progress.
 * @param {object} [stateInput] - Optional state override; defaults to the
 *   registered provider when omitted.
 * @returns {{likely: string, possible: string}} Structured text blocks for the
 *   likely cause and the list of other candidates.
 */
export function formatPossibleCausesSummary(stateInput){
  const state = resolveState(stateInput);
  const causes = Array.isArray(state?.possibleCauses) ? state.possibleCauses : [];
  if(!causes.length){
    return { likely: '', possible: 'No possible causes captured.' };
  }

  const buildHypothesisSentence = typeof state?.buildHypothesisSentence === 'function'
    ? state.buildHypothesisSentence
    : () => '';
  const likelyIdRaw = typeof state?.likelyCauseId === 'string' ? state.likelyCauseId.trim() : '';
  const likelyId = likelyIdRaw || null;

  const described = causes.map((cause, index) => {
    if(!cause) return null;
    const details = collectCauseEvidenceDetails(state, cause);
    const statusText = describeCauseStatus(state, cause, details);
    const failFlag = details.failedCount > 0 ? ' • Failed on at least one check' : '';
    const summaryText = buildHypothesisSentence(cause) || '—';
    const confidenceRaw = typeof cause?.confidence === 'string' ? cause.confidence.trim().toLowerCase() : '';
    const confidenceLabel = confidenceRaw && ['low', 'medium', 'high'].includes(confidenceRaw)
      ? confidenceRaw.charAt(0).toUpperCase() + confidenceRaw.slice(1)
      : '';
    const evidenceNote = typeof cause?.evidence === 'string' ? cause.evidence.trim() : '';

    const lines = [
      `• ${resolveCauseTitle(cause, index)}: ${summaryText}`,
      `  Status: ${statusText}`,
      `  Progress: ${details.complete}/${details.total} evidence checks${failFlag}`
    ];
    if(confidenceLabel){
      lines.push(`  Confidence: ${confidenceLabel}`);
    }
    if(evidenceNote){
      lines.push(`  Evidence: ${evidenceNote}`);
    }
    if(details.evidenceBlock){
      lines.push(details.evidenceBlock);
    }
    return {
      id: typeof cause?.id === 'string' ? cause.id : `cause-${index}`,
      text: lines.join('\n'),
      index
    };
  }).filter(Boolean);

  const likelyEntry = likelyId ? described.find(item => item.id === likelyId) : null;
  const likelyText = likelyEntry ? likelyEntry.text : '';

  const possibleEntries = described.filter(item => !likelyEntry || item.id !== likelyEntry.id);
  const possibleText = possibleEntries.length
    ? possibleEntries.map(item => item.text).join('\n\n')
    : '• None to show.';

  return {
    likely: likelyText,
    possible: possibleText
  };
}

/**
 * Normalizes a due date or ETA field into ISO text when valid.
 * @param {string|number|Date} value - Raw due date reference from an action.
 * @returns {string} ISO timestamp or the original string when parsing fails.
 */
function formatActionEta(value){
  if(!value) return '';
  const raw = value instanceof Date ? value.toISOString() : value;
  if(typeof raw !== 'string'){ return ''; }
  const trimmed = raw.trim();
  if(!trimmed){ return ''; }
  const parsed = new Date(trimmed);
  if(Number.isNaN(parsed.valueOf())){ return trimmed; }
  return parsed.toISOString();
}

/**
 * Converts the remediation actions list into readable bullet points.
 * @param {object} [stateInput] - Optional state override; defaults to the registered provider when omitted.
 * @returns {string} Bullet-formatted action summary with notes.
 */
export function formatActionsSummary(stateInput){
  const state = resolveState(stateInput);
  const actions = Array.isArray(state?.actions) ? state.actions : [];
  if(!actions.length){
    return '• No action items recorded.';
  }

  const lines = actions.map((action, index) => {
    if(!action) return null;
    const titleRaw = typeof action.summary === 'string' ? action.summary.trim() : '';
    const fallbackTitle = typeof action.title === 'string' ? action.title.trim() : '';
    const title = titleRaw || fallbackTitle || `Action ${index + 1}`;
    const status = typeof action.status === 'string' && action.status.trim()
      ? action.status.trim()
      : 'Status unknown';
    const priority = typeof action.priority === 'string' && action.priority.trim()
      ? action.priority.trim()
      : 'Priority unknown';
    const eta = formatActionEta(action.dueAt);
    const ownerName = typeof action?.owner?.name === 'string' && action.owner.name.trim()
      ? action.owner.name.trim()
      : 'Unassigned';
    const metaParts = [`Status: ${status}`, `Priority: ${priority}`, `Owner: ${ownerName}`];
    if(eta){ metaParts.push(`ETA: ${eta}`); }

    const actionNotes = inlineSummaryText(action.notes);
    const ownerNotes = inlineSummaryText(action?.owner?.notes);
    const notesParts = [];
    if(actionNotes){ notesParts.push(actionNotes); }
    if(ownerNotes){ notesParts.push(`Owner Notes: ${ownerNotes}`); }
    if(!notesParts.length){ notesParts.push('No notes provided.'); }
    const notesText = notesParts.join(' | ');

    return `• ${title} — ${metaParts.join(' | ')}. Notes: ${notesText}`;
  }).filter(Boolean);

  return lines.join('\n');
}

/**
 * Summarizes the task checklist, grouped by phase, to show overall completion
 * and outstanding categories.
 * @param {object} [stateInput] - Optional state override; defaults to the
 *   registered provider when omitted.
 * @returns {string} Multi-line summary describing completed and remaining
 *   phases, or an empty string when no steps are tracked.
 */
export function formatStepsSummary(stateInput){
  const state = resolveState(stateInput);
  const steps = Array.isArray(state?.stepsItems) ? state.stepsItems : [];
  if(!steps.length) return '';

  const counts = typeof state?.getStepsCounts === 'function'
    ? state.getStepsCounts()
    : { total: steps.length, completed: steps.filter(step => step.checked).length };

  const groupedByPhase = new Map();
  steps.forEach(step => {
    const phaseId = typeof step?.phase === 'string' && step.phase.trim()
      ? step.phase.trim()
      : '__unassigned__';
    if(!groupedByPhase.has(phaseId)){
      groupedByPhase.set(phaseId, []);
    }
    groupedByPhase.get(phaseId).push(step);
  });

  const phaseSummaries = [];
  STEPS_PHASES.forEach(phase => {
    const items = groupedByPhase.get(phase.id);
    if(!items || !items.length) return;
    const total = items.length;
    const completed = items.filter(item => item.checked).length;
    phaseSummaries.push({
      id: phase.id,
      label: phase.label,
      total,
      completed
    });
    groupedByPhase.delete(phase.id);
  });

  if(groupedByPhase.size){
    const extras = [];
    groupedByPhase.forEach((items, phaseId) => {
      if(!items || !items.length) return;
      const total = items.length;
      const completed = items.filter(item => item.checked).length;
      const label = phaseId && phaseId !== '__unassigned__'
        ? `Phase ${phaseId}`
        : 'Other';
      extras.push({
        id: phaseId,
        label,
        total,
        completed
      });
    });
    extras.sort((a, b) => a.label.localeCompare(b.label));
    phaseSummaries.push(...extras);
  }

  if(!phaseSummaries.length) return `Completed: ${counts.completed}/${counts.total}`;

  const completedPhases = phaseSummaries
    .filter(phase => phase.completed >= phase.total && phase.total > 0)
    .map(phase => `  • ${phase.label}`);

  const remainingPhases = phaseSummaries
    .filter(phase => phase.completed < phase.total)
    .map(phase => `  • ${phase.label} (${phase.completed}/${phase.total})`);

  const lines = [`Completed: ${counts.completed}/${counts.total}`];
  if(completedPhases.length){
    lines.push('Completed Categories:');
    lines.push(...completedPhases);
  }
  if(remainingPhases.length){
    lines.push('Remaining Categories:');
    lines.push(...remainingPhases);
  }

  return lines.join('\n');
}

/**
 * Extracts structured IS/IS NOT entries from the Kepner-Tregoe table markup
 * and renders them in a text-only format by band and section.
 * @param {object} [stateInput] - Optional state override; defaults to the
 *   registered provider when omitted.
 * @returns {string} The IS/IS NOT summary ready for inclusion in the master
 *   incident summary.
 */
export function formatKTTableSummary(stateInput){
  const state = resolveState(stateInput);
  const tbody = state?.tbody ?? document.getElementById('tbody');
  if(!tbody) return '';
  const bandLayouts = [
    {
      key: 'WHAT',
      heading: '🟦 WHAT — Define the Problem',
      sections: ['Object', 'Deviation']
    },
    {
      key: 'WHERE',
      heading: '🟩 WHERE — Location',
      sections: ['Topology / Geography', 'On the Object']
    },
    {
      key: 'WHEN',
      heading: '🟧 WHEN — Timing / Pattern',
      sections: ['First Observed', 'Pattern / Recurrence', 'Conditions / Context']
    },
    {
      key: 'EXTENT',
      heading: '🟪 EXTENT — Magnitude / Trend',
      sections: ['Population / Scope', 'Size Per Instance', 'Volume / Frequency']
    }
  ];

  const questionLayouts = [
    {
      band: 'WHAT',
      label: 'Object',
      match: text => text.startsWith('WHAT — Specific Object/Thing')
    },
    {
      band: 'WHAT',
      label: 'Deviation',
      match: text => text.startsWith('WHAT — Specific Deviation')
    },
    {
      band: 'WHERE',
      label: 'Topology / Geography',
      match: text => text.startsWith('WHERE — is the')
    },
    {
      band: 'WHERE',
      label: 'On the Object',
      match: text => text.startsWith('WHERE — On the')
    },
    {
      band: 'WHEN',
      label: 'First Observed',
      match: text => text.startsWith('WHEN — Was the')
    },
    {
      band: 'WHEN',
      label: 'Pattern / Recurrence',
      match: text => text.startsWith('WHEN — Since the first occurrence')
    },
    {
      band: 'WHEN',
      label: 'Conditions / Context',
      match: text => text.startsWith('WHEN — Describe')
    },
    {
      band: 'EXTENT',
      label: 'Population / Scope',
      match: text => text.startsWith('EXTENT — What is the population')
    },
    {
      band: 'EXTENT',
      label: 'Size Per Instance',
      match: text => text.startsWith('EXTENT — What is the size')
    },
    {
      band: 'EXTENT',
      label: 'Volume / Frequency',
      match: text => text.startsWith('EXTENT — How many')
    }
  ];

  const bandSections = new Map();
  bandLayouts.forEach(layout => {
    bandSections.set(layout.key, []);
  });

  let currentBand = '';
  const rows = [...tbody.querySelectorAll('tr')];
  rows.forEach(tr => {
    if(tr.classList.contains('band')){
      const bandText = tr.textContent?.trim() || '';
      const bandKey = bandText.split('—')[0]?.trim().toUpperCase() || '';
      currentBand = bandSections.has(bandKey) ? bandKey : '';
      return;
    }

    const th = tr.querySelector('th');
    const questionText = th?.textContent?.trim() || '';
    const textareas = tr.querySelectorAll('textarea');
    const isText = inlineSummaryText(textareas[0]?.value);
    const notText = inlineSummaryText(textareas[1]?.value);
    const distText = formatDistinctionChanges(
      splitLines(textareas[2]?.value),
      splitLines(textareas[3]?.value)
    );

    const layoutMatch = questionLayouts.find(entry => entry.match(questionText));
    const bandKey = layoutMatch?.band || currentBand;
    if(!bandKey || !bandSections.has(bandKey)) return;

    let sectionLabel = layoutMatch?.label;
    if(!sectionLabel){
      const layout = bandLayouts.find(entry => entry.key === bandKey);
      if(layout){
        const usedLabels = bandSections.get(bandKey).map(lines => lines[0]);
        sectionLabel = layout.sections.find(label => !usedLabels.includes(label))
          || layout.sections[usedLabels.length]
          || `Section ${usedLabels.length + 1}`;
      }
    }
    if(!sectionLabel){
      sectionLabel = questionText || 'Entry';
    }

    const hasContent = Boolean(isText || notText || distText);
    if(!hasContent){
      return;
    }

    const sectionLines = [sectionLabel];
    if(isText){ sectionLines.push('', `IS: ${isText}`); }
    if(notText){ sectionLines.push('', `IS NOT: ${notText}`); }
    if(distText){ sectionLines.push('', `Distinctions / Change: ${distText}`); }
    bandSections.get(bandKey).push(sectionLines);
  });

  const output = [];
  bandLayouts.forEach(layout => {
    const sections = bandSections.get(layout.key) || [];
    if(!sections.length) return;
    if(output.length) output.push('');
    output.push(layout.heading);
    sections.forEach(lines => {
      output.push('');
      output.push(...lines);
    });
  });

  return output.join('\n').trim();
}

/**
 * Builds the full incident narrative by stitching together bridge details,
 * preface bullets, containment, impact, communications, tasks, causes, and the
 * KT analysis.
 * @param {object} [stateInput] - Optional state override; defaults to the
 *   registered provider when omitted.
 * @param {object} [options] - Reserved feature flags that influence formatting.
 * @returns {string} Multi-section summary ready for clipboard or AI prompts.
 */
export function buildSummaryText(stateInput, options = {}){
  const state = resolveState(stateInput);
  const {
    docTitle,
    docSubtitle,
    oneLine,
    proof,
    objectPrefill,
    objectIS,
    healthy,
    now,
    detectMonitoring,
    detectUserReport,
    detectAutomation,
    detectOther,
    evScreenshot,
    evLogs,
    evMetrics,
    evRepro,
    evOther,
    impactNow,
    impactFuture,
    impactTime,
    containDesc,
    bridgeOpenedUtc,
    icName,
    bcName,
    semOpsName,
    severity,
    commNextUpdateTime
  } = state;
  const title = (docTitle?.textContent || '').trim();
  const subtitle = (docSubtitle?.textContent || '').trim();

  const detectionSummary = formatChipsetSelections([
    { el: detectMonitoring ?? document.getElementById('detectMonitoring'), label: 'Monitoring' },
    { el: detectUserReport ?? document.getElementById('detectUserReport'), label: 'User Report' },
    { el: detectAutomation ?? document.getElementById('detectAutomation'), label: 'Automation' },
    { el: detectOther ?? document.getElementById('detectOther'), label: 'Other' }
  ]);

  const evidenceSummary = formatChipsetSelections([
    { el: evScreenshot ?? document.getElementById('evScreenshot'), label: 'Screenshot' },
    { el: evLogs ?? document.getElementById('evLogs'), label: 'Logs' },
    { el: evMetrics ?? document.getElementById('evMetrics'), label: 'Metrics' },
    { el: evRepro ?? document.getElementById('evRepro'), label: 'Repro' },
    { el: evOther ?? document.getElementById('evOther'), label: 'Other' }
  ]);

  const prefaceLines = [
    summaryBullet('One-line', oneLine?.value ?? document.getElementById('oneLine')?.value),
    summaryBullet('Evidence/Proof', proof?.value ?? document.getElementById('proof')?.value),
    summaryBullet(
      'Specific Object',
      (objectPrefill?.value ?? document.getElementById('objectPrefill')?.value)
        || (objectIS?.value ?? '')
    ),
    summaryBullet('Healthy Baseline', healthy?.value ?? document.getElementById('healthy')?.value),
    summaryBullet('Current State (What is happening now?)', now?.value ?? document.getElementById('now')?.value),
    summaryBulletRaw('Detection Source', detectionSummary),
    summaryBulletRaw('Evidence Collected', evidenceSummary)
  ];
  const preface = joinSummaryLines(prefaceLines);

  const impactLines = [
    summaryLine('Current Impact', impactNow?.value ?? document.getElementById('impactNow')?.value),
    summaryLine('Future Impact', impactFuture?.value ?? document.getElementById('impactFuture')?.value),
    summaryLine('Timeframe', impactTime?.value ?? document.getElementById('impactTime')?.value)
  ];
  const imp = joinSummaryLines(impactLines);

  const containmentLines = [
    summaryLineRaw('Status', containmentStatusText(state)),
    summaryLine('Description', containDesc?.value ?? document.getElementById('containDesc')?.value)
  ];
  const containment = joinSummaryLines(containmentLines);

  const communications = joinSummaryLines([
    formatCommSummaryLine(state, 'internal', 'Last Internal Update'),
    formatCommSummaryLine(state, 'external', 'Last External Update'),
    nextUpdateSummaryLine({ ...state, commNextUpdateTime: commNextUpdateTime ?? state.commNextUpdateTime })
  ]);

  const bridgeLines = [
    summaryLineRaw('Bridge Opened (UTC)', bridgeOpenedUtc?.value ?? document.getElementById('bridgeOpenedUtc')?.value),
    summaryLineRaw('Incident Commander', icName?.value ?? document.getElementById('icName')?.value),
    summaryLineRaw('Broadscope Captain', bcName?.value ?? document.getElementById('bcName')?.value),
    summaryLineRaw('SEM/Ops Lead', semOpsName?.value ?? document.getElementById('semOpsName')?.value),
    summaryLineRaw('Severity', severity?.value ?? document.getElementById('severity')?.value)
  ];
  const bridge = joinSummaryLines(bridgeLines);

  const sectionsOut = [];
  if(title){ sectionsOut.push(title); }
  if(subtitle){ sectionsOut.push(subtitle); }

  /**
   * Adds a labeled section to the composed summary when body content exists.
   * @param {string} label - Section heading.
   * @param {string} body - Section body text.
   * @returns {void}
   */
  function pushSection(label, body){
    const content = (body || '').trim();
    if(!content) return;
    if(sectionsOut.length){ sectionsOut.push(''); }
    sectionsOut.push(label);
    sectionsOut.push(content);
  }

  pushSection('— Bridge Activation —', bridge);
  pushSection('— Preface —', preface);
  pushSection('— Containment —', containment);
  pushSection('— Impact —', imp);
  pushSection('— Communications —', communications);

  const stepsSummary = formatStepsSummary(state);
  if(stepsSummary.trim().length){
    pushSection('— Steps Checklist —', stepsSummary);
  }

  const causeSections = formatPossibleCausesSummary(state);
  const likelySummary = typeof causeSections?.likely === 'string' ? causeSections.likely.trim() : '';
  if(likelySummary){
    pushSection('— ⭐ Likely Cause —', likelySummary);
  }
  let possibleSummary = typeof causeSections?.possible === 'string' ? causeSections.possible : '';
  if(!possibleSummary.trim().length){
    possibleSummary = '• None to show.';
  }
  pushSection('— Possible Causes —', possibleSummary);

  const actionsSummary = formatActionsSummary(state);
  pushSection('— Action Items —', actionsSummary);

  const ktOut = formatKTTableSummary(state);
  if(ktOut.trim().length){
    pushSection('— KT IS / IS NOT —', ktOut);
  }

  void options?.prependAIPreface; // Reserved for future extension
  return sectionsOut.join('\n');
}

const PROMPT_PREAMBLE = `You are ChatGPT acting as an incident communications specialist.
Following NIST SP 800-61, ISO/IEC 27035, and ITIL major incident best practices, craft two communication log entries:
one for internal stakeholders and one for external customers.
Each entry should include recommended tone, key talking points, risk framing, and next steps.
Use the incident context below to tailor the guidance.`;

/**
 * Ensures the summary card exists in the DOM so generated text can be rendered.
 * @returns {HTMLElement|null} The summary card element if available.
 */
function ensureSummaryCard(){
  let card = document.getElementById('summaryCard');
  if(!card){
    const wrap = document.querySelector('.wrap');
    card = document.createElement('div');
    card.className = 'card';
    card.id = 'summaryCard';
    const h = document.createElement('h3');
    h.textContent = 'Copy & Paste Summary';
    const pre = document.createElement('pre');
    pre.id = 'summaryPre';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.font = '13px/1.6 monospace';
    pre.style.margin = '0';
    card.appendChild(h);
    card.appendChild(pre);
    wrap?.appendChild(card);
  }
  return card;
}

/**
 * Generates and optionally copies a summary for the requested output type,
 * augmenting the base text with AI prompt preambles when needed.
 * @param {string} [kind] - Summary category (reserved for future branching;
 *   currently ignored).
 * @param {string} [aiType] - AI augmentation mode (e.g., "ai summary" or
 *   "prompt preamble").
 * @param {object} [stateInput] - Optional state override; defaults to the
 *   registered provider when omitted.
 * @returns {Promise<string>} Resolved formatted summary text.
 */
export async function generateSummary(kind = 'summary', aiType = '', stateInput){
  void kind;
  const state = resolveState(stateInput);
  const baseText = buildSummaryText(state);
  let output = baseText;
  const normalizedType = typeof aiType === 'string' ? aiType.trim().toLowerCase() : '';
  if(normalizedType === 'ai summary'){
    const expertPrefix = `You are an expert in:

Incident Management (ITIL 4, ISO 20000-1, ISO 27001)

Major Incident communication (NIST SP 800-61 emergency comms best practices)

Kepner-Tregoe Situation Appraisal and IS / IS NOT problem analysis

Executive communication (clear, concise, jargon-free)

Your task is to take the information I paste after this prompt and produce two separate communication messages:

✅ Output #1 — INTERNAL COMMUNICATION UPDATE (for leadership & technical teams)

Audience: internal — executives, stakeholders, engineering teams
Goal: alignment and clarity on what is known / unknown / next steps

Format using these headings:

Incident Name / Reference ID:
Current Status: (e.g., Major Incident Active – Priority 1)
Situation Appraisal (KT format):

Concerns / issues identified

Priorities (what should be worked on first and why)

IS / IS NOT Analysis (KT format):

IS: (confirmed facts)

IS NOT: (ruled out variables)

What we know / What we don’t know yet:
Immediate actions taken:
Next steps / owners / ETAs:
Decision / ask for leadership: (if relevant)
Planned internal update cadence: (e.g., every 30 mins)

Keep the tone concise, factual, non-emotional. Avoid speculation and blame.

✅ Output #2 — EXTERNAL COMMUNICATION UPDATE (for customers / business users)

Audience: external — end users, customers, executives
Goal: confidence, clarity, and reduced anxiety — without technical noise

Format using these headings:

Status: (plain language, no acronyms)
Impact: (what users experience, scope of impact)
What we are doing: (reassurance + action)
What you need to do: (if anything)
Next update: (time commitment)

Follow these rules:

Do not include internal details or root cause speculation.

Be plain language. Example: instead of "database replication latency," say "our systems are not syncing data correctly."

Keep the update short, calm, and confident.

Tone guideline:

“Clear, factual, and reassuring.”

When generating both updates:

✔ Apply KT thinking (no assumptions — separate Known vs. Unknown)
✔ Apply ITIL/ISO/NIST best practices (clarity, ownership, cadence, impact)
✔ Prioritize accuracy > completeness

I will paste all the known information next. Analyze it and reply with the two formatted communications. Do not ask clarifying questions; make reasonable assumptions and proceed.`;
    output = `${expertPrefix}\n\n${baseText}`;
  }else if(normalizedType === 'prompt preamble'){
    output = `${PROMPT_PREAMBLE}\n\n${baseText}`;
  }

  const card = ensureSummaryCard();
  const pre = document.getElementById('summaryPre');
  if(pre){ pre.textContent = output; }
  if(card){ card.style.display = 'block'; }

  try{
    if(window.isSecureContext && navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(output);
      const toast = state?.showToast ?? window.showToast;
      if(typeof toast === 'function'){
        toast('Summary updated & copied. It’s also shown below.');
      }
    }else{
      const toast = state?.showToast ?? window.showToast;
      if(typeof toast === 'function'){
        toast('Summary updated. Clipboard blocked — copy it from the bottom.');
      }
    }
  }catch(_){
    const toast = state?.showToast ?? window.showToast;
    if(typeof toast === 'function'){
      toast('Summary updated. Clipboard blocked — copy it from the bottom.');
    }
  }
  return output;
}

export default {
  buildSummaryText,
  formatActionsSummary,
  formatPossibleCausesSummary,
  formatStepsSummary,
  formatKTTableSummary,
  generateSummary,
  setSummaryStateProvider,
  summaryLine,
  summaryLineRaw
};
