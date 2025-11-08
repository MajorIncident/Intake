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

function resolveState(input){
  if(input && typeof input === 'object'){ return input; }
  try{
    return stateProvider ? stateProvider() : {};
  }catch(_){
    return {};
  }
}

export function setSummaryStateProvider(provider){
  if(typeof provider === 'function'){
    stateProvider = provider;
  }
}

function inlineText(value){
  const v = (value || '').trim();
  if(!v) return '—';
  return v
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join(' · ');
}

function inlineSummaryText(value){
  const lines = splitLines(value);
  if(!lines.length) return '';
  return lines.join(' · ');
}

export function summaryLine(label, value){
  const text = inlineSummaryText(value);
  if(!text) return '';
  return `${label}: ${text}`;
}

export function summaryLineRaw(label, value){
  const text = (value || '').trim();
  if(!text) return '';
  return `${label}: ${text}`;
}

function summaryBullet(label, value){
  const text = inlineSummaryText(value);
  if(!text) return '';
  return `• ${label}: ${text}`;
}

function summaryBulletRaw(label, value){
  const text = (value || '').trim();
  if(!text) return '';
  return `• ${label}: ${text}`;
}

function joinSummaryLines(lines){
  return lines.filter(line => line && line.trim().length).join('\n');
}

function splitLines(text){
  const v = (text || '').trim();
  if(!v) return [];
  return v.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function formatLabeledList(label, lines){
  if(!lines.length) return '';
  if(lines.length === 1) return `${label}: ${lines[0]}`;
  const bullets = lines.map(line => `  • ${line}`).join('\n');
  return `${label}:\n${bullets}`;
}

function formatDistinctionChanges(distLines, changeLines){
  const len = Math.max(distLines.length, changeLines.length);
  if(len === 0) return '';
  if(len === 1){
    const left = distLines[0] || '—';
    const right = changeLines[0] || '—';
    return `Distinctions → Changes: ${left} → ${right}`;
  }
  const pairs = [];
  for(let i = 0; i < len; i++){
    const left = distLines[i] || '—';
    const right = changeLines[i] || '—';
    pairs.push(`  • ${left} → ${right}`);
  }
  return ['Distinctions → Changes:', ...pairs].join('\n');
}

function formatChipsetSelections(list){
  const selected = list
    .filter(item => item.el?.checked)
    .map(item => item.label);
  return selected.length ? selected.join(', ') : '';
}

function containmentStatusText(state){
  if(!state || typeof state.getContainmentStatus !== 'function') return '';
  const status = state.getContainmentStatus();
  if(CONTAINMENT_STATUS_LABELS[status]) return CONTAINMENT_STATUS_LABELS[status];
  return LEGACY_CONTAINMENT_STATUS_LABELS[status] || '';
}

function latestCommEntry(state, type){
  const log = Array.isArray(state?.commLog) ? state.commLog : [];
  return log.find(entry => entry && entry.type === type && entry.ts);
}

function formatCommTimestamp(ts){
  if(!ts) return '';
  const d = new Date(ts);
  if(Number.isNaN(d.valueOf())) return ts;
  return d.toISOString();
}

function formatCommSummaryLine(state, type, label){
  const entry = latestCommEntry(state, type);
  if(!entry) return '';
  const ts = formatCommTimestamp(entry.ts);
  return ts ? `${label}: ${ts}` : '';
}

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

function causeProgressSummary(state, cause){
  const evidenceIndexes = typeof state?.evidencePairIndexes === 'function'
    ? state.evidencePairIndexes()
    : [];
  const total = evidenceIndexes.length;
  if(total === 0) return 'No KT evidence pairs captured yet';
  const answered = typeof state?.countCompletedEvidence === 'function'
    ? state.countCompletedEvidence(cause, evidenceIndexes)
    : 0;
  const hasFailure = typeof state?.causeHasFailure === 'function'
    ? state.causeHasFailure(cause)
    : false;
  if(hasFailure){
    return `${answered}/${total} evidence checks • Failed on at least one check`;
  }
  return `${answered}/${total} evidence checks complete`;
}

function formatCauseFindingsSummary(state, cause){
  if(!cause || !cause.findings) return '';
  const evidenceIndexes = typeof state?.evidencePairIndexes === 'function'
    ? state.evidencePairIndexes()
    : [];
  if(!evidenceIndexes.length) return '';
  const rows = Array.isArray(state?.rowsBuilt) ? state.rowsBuilt : [];
  const sections = [];
  evidenceIndexes.forEach(index => {
    const row = rows[index];
    const key = typeof state?.getRowKeyByIndex === 'function'
      ? state.getRowKeyByIndex(index)
      : `row-${index}`;
    const entry = typeof state?.peekCauseFinding === 'function'
      ? state.peekCauseFinding(cause, key)
      : null;
    if(!entry) return;
    const mode = typeof state?.findingMode === 'function' ? state.findingMode(entry) : '';
    const note = typeof state?.findingNote === 'function' ? state.findingNote(entry) : '';
    if(!mode && !note.trim()) return;
    const fallbackLabel = row?.def?.q || `Row ${index + 1}`;
    const label = row?.th?.textContent?.trim()
      || (typeof state?.fillTokens === 'function' ? state.fillTokens(fallbackLabel) : fallbackLabel);
    const lines = [`  • ${label}`];
    if(mode === CAUSE_FINDING_MODES.ASSUMPTION){
      lines.push(`    - Assumptions needed: ${inlineText(note)}`);
    }else if(mode === CAUSE_FINDING_MODES.YES){
      lines.push(`    - Explains evidence: ${inlineText(note)}`);
    }else if(mode === CAUSE_FINDING_MODES.FAIL){
      lines.push(`    - Fails because: ${inlineText(note)}`);
    }else if(note.trim()){
      lines.push(`    - Notes: ${inlineText(note)}`);
    }
    sections.push(lines.join('\n'));
  });
  return sections.length ? ['Evidence walkthrough:', ...sections].join('\n') : '';
}

export function formatPossibleCausesSummary(stateInput){
  const state = resolveState(stateInput);
  const causes = Array.isArray(state?.possibleCauses) ? state.possibleCauses : [];
  if(!causes.length){
    return 'No possible causes captured.';
  }
  const blocks = causes.map((cause, index) => {
    const buildHypothesisSentence = typeof state?.buildHypothesisSentence === 'function'
      ? state.buildHypothesisSentence
      : () => '';
    const causeStatusLabel = typeof state?.causeStatusLabel === 'function'
      ? state.causeStatusLabel
      : () => '';
    const countCauseAssumptions = typeof state?.countCauseAssumptions === 'function'
      ? state.countCauseAssumptions
      : () => 0;
    const header = `• Possible Cause ${index + 1}: ${buildHypothesisSentence(cause)}`;
    const status = `  Status: ${causeStatusLabel(cause)}`;
    const progress = `  Progress: ${causeProgressSummary(state, cause)}`;
    const failureLine = typeof state?.causeHasFailure === 'function' && state.causeHasFailure(cause)
      ? '  Result: Failed testing on at least one evidence check'
      : '';
    const assumptionCount = countCauseAssumptions(cause);
    const assumptionLine = assumptionCount ? `  Assumptions noted: ${assumptionCount}` : '';
    const evidence = formatCauseFindingsSummary(state, cause);
    return [header, status, progress, failureLine, assumptionLine, evidence]
      .filter(Boolean)
      .join('\n');
  });
  return blocks.join('\n\n');
}

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

export function formatKTTableSummary(stateInput){
  const state = resolveState(stateInput);
  const tbody = state?.tbody ?? document.getElementById('tbody');
  if(!tbody) return '';
  const rowsOut = [];
  let pendingBand = '';
  [...tbody.querySelectorAll('tr')].forEach(tr => {
    if(tr.classList.contains('band')){
      pendingBand = `== ${tr.textContent.trim()} ==`;
      return;
    }
    const th = tr.querySelector('th');
    const q = th?.textContent?.trim() || '';
    const t = tr.querySelectorAll('textarea');
    const isLines = splitLines(t[0]?.value);
    const notLines = splitLines(t[1]?.value);
    const distLines = splitLines(t[2]?.value);
    const changeLines = splitLines(t[3]?.value);
    const sections = [
      formatLabeledList('IS', isLines),
      formatLabeledList('IS NOT', notLines),
      formatDistinctionChanges(distLines, changeLines)
    ].filter(Boolean);
    if(!sections.length) return;
    if(pendingBand){
      rowsOut.push(pendingBand);
      pendingBand = '';
    }
    rowsOut.push(`Q: ${q}`);
    sections.forEach(section => rowsOut.push(section));
  });
  return rowsOut.filter(line => line && line.trim().length).join('\n\n');
}

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
    summaryLineRaw('Bridge Coordinator', bcName?.value ?? document.getElementById('bcName')?.value),
    summaryLineRaw('SEM/Ops Lead', semOpsName?.value ?? document.getElementById('semOpsName')?.value),
    summaryLineRaw('Severity', severity?.value ?? document.getElementById('severity')?.value)
  ];
  const bridge = joinSummaryLines(bridgeLines);

  const sectionsOut = [];
  if(title){ sectionsOut.push(title); }
  if(subtitle){ sectionsOut.push(subtitle); }

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

  const causes = formatPossibleCausesSummary(state);
  if(causes.trim().length){
    pushSection('— Possible Causes —', causes);
  }

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
  formatPossibleCausesSummary,
  formatStepsSummary,
  formatKTTableSummary,
  generateSummary,
  setSummaryStateProvider,
  summaryLine,
  summaryLineRaw
};
