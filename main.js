// Main JavaScript for KT Intake – extracted from inline script in ktintake.html

/* [rows] start */
/* =================== Core data & prompts (KT Problem Analysis) =================== */
/* Use {OBJECT} / {DEVIATION} tokens anywhere you want auto-fill. These are protected
   datasets—see README.md and AGENTS.md for change control expectations. */
import {
  ROWS,
  CAUSE_FINDING_MODES,
  CAUSE_FINDING_MODE_VALUES
} from './src/constants.js';
import {
  generateSummary,
  setSummaryStateProvider
} from './src/summary.js';
import {
  saveToStorage as persistStateToStorage,
  restoreFromStorage as loadStateFromStorage,
  serializeCauses,
  deserializeCauses
} from './src/storage.js';
import {
  initStepsFeature,
  getStepsCounts,
  exportStepsState,
  importStepsState,
  getStepsItems
} from './src/steps.js';

/* ROWS, CAUSE_FINDING_MODES, and step definitions are deep-frozen in src/constants.js. */

/* [rows] end */

/* [script:table-build] start */
/* =================== Build table & dynamic tokens =================== */
/* Table rendering & hypothesis helpers: builds the KT grid, synchronises
   possible-cause cards, and keeps UI state aligned with ROWS definitions. */
const tbody = document.getElementById('tbody');
const rowsBuilt = [];
let possibleCauses = [];
/* ===== Possible causes (hypotheses) ===== */
/**
 * Possible-cause finding modes represent how evidence supports a hypothesis.
 * Treat as an enum—update in tandem with UI chips and summary formatting.
 */
function isValidFindingMode(mode){
  return typeof mode === 'string' && CAUSE_FINDING_MODE_VALUES.includes(mode);
}
function normalizeFindingEntry(entry){
  const normalized = { mode:'', note:'' };
  if(entry && typeof entry === 'object'){
    if(typeof entry.mode === 'string'){
      const mode = entry.mode.trim().toLowerCase();
      if(isValidFindingMode(mode)){ normalized.mode = mode; }
    }
    if(typeof entry.note === 'string'){
      normalized.note = entry.note;
    }else if(typeof entry.note === 'number'){
      normalized.note = String(entry.note);
    }
    const explainIs = typeof entry.explainIs === 'string' ? entry.explainIs.trim() : '';
    const explainNot = typeof entry.explainNot === 'string' ? entry.explainNot.trim() : '';
    if(!normalized.mode && (explainIs || explainNot)){
      normalized.mode = CAUSE_FINDING_MODES.YES;
      normalized.note = [explainIs, explainNot].filter(Boolean).join('\n');
    }else if(normalized.mode && !normalized.note && (explainIs || explainNot)){
      normalized.note = [explainIs, explainNot].filter(Boolean).join('\n');
    }
  }else if(typeof entry === 'string'){
    normalized.mode = CAUSE_FINDING_MODES.YES;
    normalized.note = entry;
  }
  return normalized;
}
function findingMode(entry){
  if(!entry || typeof entry !== 'object') return '';
  const mode = typeof entry.mode === 'string' ? entry.mode : '';
  return isValidFindingMode(mode) ? mode : '';
}
function findingNote(entry){
  if(!entry || typeof entry !== 'object') return '';
  return typeof entry.note === 'string' ? entry.note : '';
}
function findingIsComplete(entry){
  const mode = findingMode(entry);
  if(!mode) return false;
  const note = findingNote(entry).trim();
  if(!note) return false;
  return true;
}
function peekCauseFinding(cause, key){
  if(!cause || !cause.findings || typeof cause.findings !== 'object') return null;
  const existing = cause.findings[key];
  if(!existing) return null;
  const normalized = normalizeFindingEntry(existing);
  cause.findings[key] = normalized;
  return normalized;
}
function causeHasFailure(cause){
  if(!cause) return false;
  const indexes = evidencePairIndexes();
  if(!indexes.length) return false;
  for(let i=0;i<indexes.length;i++){
    const entry = peekCauseFinding(cause, getRowKeyByIndex(indexes[i]));
    if(entry && findingMode(entry) === CAUSE_FINDING_MODES.FAIL){
      return true;
    }
  }
  return false;
}
function countCauseAssumptions(cause){
  if(!cause) return 0;
  const indexes = evidencePairIndexes();
  let total = 0;
  indexes.forEach(idx=>{
    const entry = peekCauseFinding(cause, getRowKeyByIndex(idx));
    if(entry && findingMode(entry) === CAUSE_FINDING_MODES.ASSUMPTION){ total++; }
  });
  return total;
}
function substituteEvidenceTokens(template, isText, notText){
  if(typeof template !== 'string') return '';
  const safeIs = (isText || '').trim() || 'IS column';
  const safeNot = (notText || '').trim() || 'IS NOT column';
  return template
    .replace(/<is\s+not>/gi, safeNot)
    .replace(/<is>/gi, safeIs);
}
function generateCauseId(){
  return 'cause-' + Math.random().toString(36).slice(2,8) + '-' + Date.now().toString(36);
}
function createEmptyCause(){
  return {
    id: generateCauseId(),
    suspect: '',
    accusation: '',
    impact: '',
    findings: {},
    editing: true,
    testingOpen: false
  };
}
function hasCompleteHypothesis(cause){
  if(!cause) return false;
  return ['suspect','accusation','impact'].every(key=>typeof cause[key]==='string' && cause[key].trim().length);
}
function buildHypothesisSentence(cause){
  if(!cause) return '';
  const suspect = (cause.suspect||'').trim();
  const accusation = (cause.accusation||'').trim();
  const impact = (cause.impact||'').trim();
  if(!suspect && !accusation && !impact){
    return 'Add suspect, accusation, and impact to craft a strong hypothesis.';
  }
  const fallback = text=> (text && text.trim()) ? text.trim() : '…';
  return `We suspect ${fallback(suspect)} because ${fallback(accusation)}, which results in ${fallback(impact)}.`;
}
function getRowKeyByIndex(index){
  const row = rowsBuilt[index];
  if(row && row.def && row.def.q){
    return row.def.q;
  }
  return `row-${index}`;
}
function ensureCauseFindings(cause){
  if(!cause.findings || typeof cause.findings !== 'object'){
    cause.findings = {};
  }
  return cause.findings;
}
function getCauseFinding(cause, key){
  const map = ensureCauseFindings(cause);
  map[key] = normalizeFindingEntry(map[key]);
  return map[key];
}
function setCauseFindingValue(cause, key, prop, value){
  const entry = getCauseFinding(cause, key);
  if(prop === 'mode'){
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    entry.mode = isValidFindingMode(normalized) ? normalized : '';
    if(!entry.mode){ entry.note = ''; }
  }else if(prop === 'note'){
    entry.note = typeof value === 'string' ? value : '';
  }else{
    entry[prop] = value;
  }
}
function rowHasEvidencePair(row){
  if(!row) return false;
  const isText = typeof row?.isTA?.value === 'string' ? row.isTA.value.trim() : '';
  const notText = typeof row?.notTA?.value === 'string' ? row.notTA.value.trim() : '';
  return Boolean(isText && notText);
}
function evidencePairIndexes(){
  const indexes = [];
  rowsBuilt.forEach((row, index)=>{
    if(rowHasEvidencePair(row)){
      indexes.push(index);
    }
  });
  return indexes;
}
function countCompletedEvidence(cause, eligibleIndexes){
  let count = 0;
  const indexes = Array.isArray(eligibleIndexes) ? eligibleIndexes : evidencePairIndexes();
  indexes.forEach(index=>{
    const key = getRowKeyByIndex(index);
    const entry = peekCauseFinding(cause, key);
    if(entry && findingIsComplete(entry)){ count++; }
  });
  return count;
}
function causeStatusState(cause, answered, total){
  if(!hasCompleteHypothesis(cause)) return 'draft';
  if(total === 0) return 'no-evidence';
  if(causeHasFailure(cause)) return 'failed';
  if(answered === 0) return 'not-tested';
  if(answered < total) return 'testing';
  return 'explained';
}
function causeStatusLabel(cause){
  const eligibleIndexes = evidencePairIndexes();
  const total = eligibleIndexes.length;
  const answered = countCompletedEvidence(cause, eligibleIndexes);
  if(cause?.editing) return 'Editing hypothesis';
  if(!hasCompleteHypothesis(cause)) return 'Draft hypothesis';
  if(total === 0) return rowsBuilt.length ? 'Waiting for KT evidence pairs' : 'Ready to test';
  if(causeHasFailure(cause)) return 'Failed testing';
  if(answered === 0) return 'Not tested yet';
  if(answered < total) return 'Testing in progress';
  return 'Explains all evidence';
}
function updateCauseProgressChip(chip, cause){
  if(!chip || !cause) return;
  const eligibleIndexes = evidencePairIndexes();
  const total = eligibleIndexes.length;
  const answered = countCompletedEvidence(cause, eligibleIndexes);
  chip.textContent = total ? `${answered}/${total} evidence checks` : 'No KT evidence pairs yet';
  const status = causeStatusState(cause, answered, total);
  chip.dataset.status = status;
}
function updateCauseStatusLabel(el, cause){
  if(!el) return;
  el.textContent = causeStatusLabel(cause);
}
function updateCauseCardIndicators(card, cause){
  if(!card || !cause) return;
  const failureEl = card.querySelector('.cause-card__failure');
  const assumptionEl = card.querySelector('.cause-card__assumptions');
  const failed = causeHasFailure(cause);
  if(failureEl){ failureEl.hidden = !failed; }
  if(failed){
    card.dataset.failed = 'true';
  }else{
    delete card.dataset.failed;
  }
  if(assumptionEl){
    const count = countCauseAssumptions(cause);
    if(count > 0){
      assumptionEl.hidden = false;
      assumptionEl.textContent = count === 1 ? '1 assumption' : `${count} assumptions`;
    }else{
      assumptionEl.hidden = true;
    }
  }
}
function previewEvidenceText(value){
  const lines = splitLines(value);
  if(!lines.length) return '—';
  return lines.map(line=>`• ${line}`).join('\n');
}
function makeRemoveButton(cause){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-mini btn-ghost';
  btn.textContent = 'Remove';
  btn.addEventListener('click', ()=>{
    if(confirm('Remove this possible cause?')){
      possibleCauses = possibleCauses.filter(item=>item.id !== cause.id);
      renderCauses();
      saveToStorage();
    }
  });
  return btn;
}
function ensurePossibleCausesUI(){
  let card = document.getElementById('possibleCausesCard');
  if(!card){
    const wrap = document.querySelector('.wrap');
    if(!wrap) return;
    card = document.createElement('div');
    card.className = 'card';
    card.id = 'possibleCausesCard';
    const heading = document.createElement('h3');
    heading.textContent = 'Possible Causes';
    const caption = document.createElement('p');
    caption.className = 'caption';
    caption.textContent = 'Capture hypotheses and pressure test them against the KT IS / IS NOT evidence. Start with the suspect, accusation, and impact; then walk each cause through the table.';
    const list = document.createElement('div');
    list.className = 'cause-list';
    list.id = 'causeList';
    list.setAttribute('aria-live', 'polite');
    const controls = document.createElement('div');
    controls.className = 'cause-controls';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-mini';
    btn.id = 'addCauseBtn';
    btn.textContent = 'Add Possible Cause';
    controls.appendChild(btn);
    card.append(heading, caption, list, controls);
    const summaryCard = document.getElementById('summaryCard');
    if(summaryCard?.parentNode){
      summaryCard.parentNode.insertBefore(card, summaryCard);
    }else if(wrap){
      wrap.appendChild(card);
    }
  }
  causeList = document.getElementById('causeList');
  addCauseBtn = document.getElementById('addCauseBtn');
  if(addCauseBtn && !addCauseBtn.dataset.bound){
    addCauseBtn.dataset.bound = 'true';
    addCauseBtn.addEventListener('click', ()=>{
      const newCause = createEmptyCause();
      possibleCauses.push(newCause);
      renderCauses();
      saveToStorage();
      focusFirstEditableCause();
    });
  }
}
function renderCauses(){
  if(!causeList){
    ensurePossibleCausesUI();
  }
  if(!causeList) return;
  causeList.innerHTML = '';
  if(!possibleCauses.length){
    const empty = document.createElement('div');
    empty.className = 'cause-empty';
    empty.textContent = 'No possible causes captured yet.';
    causeList.appendChild(empty);
    updateCauseEvidencePreviews();
    return;
  }
  possibleCauses.forEach((cause, index)=>{
    if(!cause.id){ cause.id = generateCauseId(); }
    const card = document.createElement('article');
    card.className = 'cause-card';
    card.dataset.causeId = cause.id;
    if(cause.editing){ card.dataset.editing = 'true'; }
    const header = document.createElement('div');
    header.className = 'cause-card__header';
    const meta = document.createElement('div');
    meta.className = 'cause-card__meta';
    const titleEl = document.createElement('span');
    titleEl.className = 'cause-card__title';
    titleEl.textContent = `Possible Cause ${index+1}`;
    const statusEl = document.createElement('span');
    statusEl.className = 'cause-card__status';
    meta.append(titleEl, statusEl);
    const indicators = document.createElement('div');
    indicators.className = 'cause-card__indicators';
    const failureTag = document.createElement('span');
    failureTag.className = 'cause-card__failure';
    failureTag.textContent = 'Failed Testing';
    failureTag.hidden = true;
    const chip = document.createElement('span');
    chip.className = 'cause-card__chip';
    const assumptionTag = document.createElement('span');
    assumptionTag.className = 'cause-card__assumptions';
    assumptionTag.hidden = true;
    indicators.append(failureTag, chip, assumptionTag);
    header.append(meta, indicators);
    card.append(header);
    updateCauseStatusLabel(statusEl, cause);
    updateCauseProgressChip(chip, cause);
    const summaryEl = document.createElement('p');
    summaryEl.className = 'cause-card__summary';
    summaryEl.dataset.role = 'hypothesis';
    summaryEl.textContent = buildHypothesisSentence(cause);
    card.append(summaryEl);
    if(cause.editing){
      const helper = document.createElement('small');
      helper.className = 'cause-card__helper subtle';
      helper.textContent = 'Answer the prompts to refine the hypothesis statement.';
      card.append(helper);
      const form = document.createElement('div');
      form.className = 'cause-card__form';
      const suspectField = document.createElement('div');
      suspectField.className = 'field';
      const suspectLabel = document.createElement('label');
      suspectLabel.textContent = 'What/Who is the Suspect?';
      const suspectInput = document.createElement('textarea');
      suspectInput.value = cause.suspect || '';
      suspectInput.placeholder = 'Name the component, service, team, or actor you believe is responsible.';
      suspectInput.setAttribute('data-min-height','120');
      suspectInput.addEventListener('input', e=>{
        cause.suspect = e.target.value;
        autoResize(suspectInput);
        summaryEl.textContent = buildHypothesisSentence(cause);
        updateCauseStatusLabel(statusEl, cause);
        updateCauseProgressChip(chip, cause);
        saveToStorage();
      });
      autoResize(suspectInput);
      suspectField.append(suspectLabel, suspectInput);
      const accusationField = document.createElement('div');
      accusationField.className = 'field';
      const accusationLabel = document.createElement('label');
      accusationLabel.textContent = 'What is the Accusation?';
      const accusationInput = document.createElement('textarea');
      accusationInput.value = cause.accusation || '';
      accusationInput.placeholder = 'Describe the behavior, change, or failure you believe is occurring.';
      accusationInput.setAttribute('data-min-height','120');
      accusationInput.addEventListener('input', e=>{
        cause.accusation = e.target.value;
        autoResize(accusationInput);
        summaryEl.textContent = buildHypothesisSentence(cause);
        updateCauseStatusLabel(statusEl, cause);
        updateCauseProgressChip(chip, cause);
        saveToStorage();
      });
      autoResize(accusationInput);
      accusationField.append(accusationLabel, accusationInput);
      const impactField = document.createElement('div');
      impactField.className = 'field';
      const impactLabel = document.createElement('label');
      impactLabel.textContent = 'So What? How does this create the problem?';
      const impactInput = document.createElement('textarea');
      impactInput.value = cause.impact || '';
      impactInput.placeholder = 'Clarify how this cause would produce the customer or system impact.';
      impactInput.setAttribute('data-min-height','120');
      impactInput.addEventListener('input', e=>{
        cause.impact = e.target.value;
        autoResize(impactInput);
        summaryEl.textContent = buildHypothesisSentence(cause);
        updateCauseStatusLabel(statusEl, cause);
        updateCauseProgressChip(chip, cause);
        saveToStorage();
      });
      autoResize(impactInput);
      impactField.append(impactLabel, impactInput);
      form.append(suspectField, accusationField, impactField);
      card.append(form);
      const controls = document.createElement('div');
      controls.className = 'cause-controls';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn-mini';
      saveBtn.textContent = 'Save hypothesis';
      saveBtn.addEventListener('click', ()=>{
        if(!hasCompleteHypothesis(cause)){
          if(typeof showToast === 'function'){ showToast('Fill in all three prompts to save this possible cause.'); }
          return;
        }
        cause.editing = false;
        renderCauses();
        saveToStorage();
      });
      controls.append(saveBtn);
      controls.append(makeRemoveButton(cause));
      card.append(controls);
    }else{
      const controls = document.createElement('div');
      controls.className = 'cause-controls';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-mini btn-ghost';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', ()=>{
        cause.editing = true;
        renderCauses();
        saveToStorage();
        focusFirstEditableCause();
      });
      const testBtn = document.createElement('button');
      testBtn.type = 'button';
      testBtn.className = 'btn-mini';
      testBtn.textContent = cause.testingOpen ? 'Hide testing' : 'Test this cause';
      testBtn.addEventListener('click', ()=>{
        cause.testingOpen = !cause.testingOpen;
        renderCauses();
        saveToStorage();
      });
      controls.append(editBtn, testBtn, makeRemoveButton(cause));
      card.append(controls);
      if(cause.testingOpen){
        card.append(buildCauseTestPanel(cause, chip, statusEl, card));
      }
    }
    causeList.appendChild(card);
    updateCauseCardIndicators(card, cause);
  });
  updateCauseEvidencePreviews();
}
function buildCauseTestPanel(cause, progressChip, statusEl, card){
  const panel = document.createElement('div');
  panel.className = 'cause-test';
  const intro = document.createElement('p');
  intro.className = 'cause-test__intro';
  intro.textContent = 'For each KT row, choose how this hypothesis handles the IS / IS NOT evidence and document your reasoning.';
  panel.appendChild(intro);
  if(!rowsBuilt.length){
    const empty = document.createElement('div');
    empty.className = 'cause-empty';
    empty.textContent = 'Add IS / IS NOT evidence first to begin testing this cause.';
    panel.appendChild(empty);
    return panel;
  }
  const eligibleIndexes = evidencePairIndexes();
  if(!eligibleIndexes.length){
    const empty = document.createElement('div');
    empty.className = 'cause-empty';
    empty.textContent = 'Add IS / IS NOT evidence pairs to begin testing this cause.';
    panel.appendChild(empty);
    return panel;
  }
  eligibleIndexes.forEach(index=>{
    const row = rowsBuilt[index];
    const rowKey = getRowKeyByIndex(index);
    const finding = getCauseFinding(cause, rowKey);
    const rowEl = document.createElement('section');
    rowEl.className = 'cause-eval-row';
    rowEl.dataset.rowIndex = index;
    rowEl.dataset.rowKey = rowKey;
    const qText = document.createElement('div');
    qText.className = 'cause-eval-question-text';
    qText.dataset.role = 'question';
    qText.textContent = row?.th?.textContent?.trim() || fillTokens(row?.def?.q || '');
    rowEl.appendChild(qText);
    const evidenceWrap = document.createElement('div');
    evidenceWrap.className = 'cause-evidence-wrap';
    const isBlock = document.createElement('div');
    isBlock.className = 'cause-evidence-block';
    isBlock.dataset.rowIndex = index;
    isBlock.dataset.type = 'is';
    const isLabel = document.createElement('span');
    isLabel.className = 'cause-evidence-label';
    isLabel.textContent = 'IS evidence';
    const isValue = document.createElement('div');
    isValue.className = 'cause-evidence-text';
    isValue.dataset.role = 'is-value';
    isValue.textContent = previewEvidenceText(row?.isTA?.value || '');
    isBlock.append(isLabel, isValue);
    const notBlock = document.createElement('div');
    notBlock.className = 'cause-evidence-block';
    notBlock.dataset.rowIndex = index;
    notBlock.dataset.type = 'not';
    const notLabel = document.createElement('span');
    notLabel.className = 'cause-evidence-label';
    notLabel.textContent = 'IS NOT evidence';
    const notValue = document.createElement('div');
    notValue.className = 'cause-evidence-text';
    notValue.dataset.role = 'not-value';
    notValue.textContent = previewEvidenceText(row?.notTA?.value || '');
    notBlock.append(notLabel, notValue);
    evidenceWrap.append(isBlock, notBlock);
    rowEl.appendChild(evidenceWrap);
    const inputsWrap = document.createElement('div');
    inputsWrap.className = 'cause-eval-inputs';
    const optionWrap = document.createElement('div');
    optionWrap.className = 'cause-eval-options';
    const noteField = document.createElement('div');
    noteField.className = 'field cause-eval-note';
    noteField.hidden = true;
    const noteLabel = document.createElement('label');
    noteLabel.dataset.role = 'note-label';
    const noteInput = document.createElement('textarea');
    noteInput.dataset.role = 'finding-note';
    noteInput.value = findingNote(finding);
    noteInput.placeholder = 'Select an option to describe this relationship.';
    noteInput.setAttribute('data-min-height','120');
    noteInput.disabled = true;
    noteInput.addEventListener('input', e=>{
      setCauseFindingValue(cause, rowKey, 'note', e.target.value);
      autoResize(noteInput);
      updateCauseProgressChip(progressChip, cause);
      updateCauseStatusLabel(statusEl, cause);
      updateCauseCardIndicators(card, cause);
      saveToStorage();
    });
    autoResize(noteInput);
    noteField.append(noteLabel, noteInput);
    inputsWrap.append(optionWrap, noteField);
    rowEl.appendChild(inputsWrap);

    const optionDefs = [
      {
        mode: CAUSE_FINDING_MODES.ASSUMPTION,
        buttonLabel: 'Explains Only if…',
        noteLabel: 'What assumptions are necessary to explain why we see it on the <is> and not the <is not>?',
        placeholder: 'List the assumptions required so we observe <is> while avoiding <is not>.'
      },
      {
        mode: CAUSE_FINDING_MODES.YES,
        buttonLabel: 'Yes, because…',
        noteLabel: 'How does this naturally explain that we see <is> and that we don\'t see <is not>?',
        placeholder: 'Describe how this cause naturally creates <is> and avoids <is not>.'
      },
      {
        mode: CAUSE_FINDING_MODES.FAIL,
        buttonLabel: 'Does not explain…',
        noteLabel: 'Why can\'t we explain the <is> being present, but not the <is not>?',
        placeholder: 'Explain why this cause cannot produce <is> without contradicting <is not>.'
      }
    ];
    const buttons = [];
    const rawIs = row?.isTA?.value || '';
    const rawNot = row?.notTA?.value || '';

    function applyMode(newMode, opts={}){
      const active = isValidFindingMode(newMode) ? newMode : '';
      buttons.forEach(btn=>{
        btn.element.classList.toggle('is-selected', btn.mode === active);
      });
      if(active){
        const config = optionDefs.find(def=>def.mode === active);
        const labelTemplate = config?.noteLabel || '';
        const placeholderTemplate = config?.placeholder || '';
        noteLabel.textContent = substituteEvidenceTokens(labelTemplate, rawIs, rawNot);
        noteLabel.dataset.template = labelTemplate;
        noteInput.placeholder = substituteEvidenceTokens(placeholderTemplate, rawIs, rawNot);
        noteInput.dataset.placeholderTemplate = placeholderTemplate;
        noteInput.disabled = false;
        noteField.hidden = false;
      }else{
        noteLabel.textContent = '';
        delete noteLabel.dataset.template;
        noteInput.placeholder = 'Select an option to describe this relationship.';
        delete noteInput.dataset.placeholderTemplate;
        noteInput.value = '';
        noteInput.disabled = true;
        noteField.hidden = true;
        setCauseFindingValue(cause, rowKey, 'note', '');
      }
      autoResize(noteInput);
      if(!opts.silent){
        updateCauseProgressChip(progressChip, cause);
        updateCauseStatusLabel(statusEl, cause);
        updateCauseCardIndicators(card, cause);
        saveToStorage();
      }
    }

    optionDefs.forEach(def=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cause-eval-option';
      btn.textContent = def.buttonLabel;
      btn.dataset.mode = def.mode;
      btn.addEventListener('click', ()=>{
        const entry = getCauseFinding(cause, rowKey);
        const current = findingMode(entry);
        if(current === def.mode){
          setCauseFindingValue(cause, rowKey, 'mode', '');
          applyMode('');
        }else{
          setCauseFindingValue(cause, rowKey, 'mode', def.mode);
          applyMode(def.mode);
        }
      });
      optionWrap.appendChild(btn);
      buttons.push({ element: btn, mode: def.mode });
    });

    const startingMode = findingMode(finding);
    noteInput.value = findingNote(finding);
    autoResize(noteInput);
    applyMode(startingMode, {silent:true});
    panel.appendChild(rowEl);
  });
  return panel;
}
function updateCauseEvidencePreviews(){
  if(!causeList) return;
  causeList.querySelectorAll('.cause-eval-row').forEach(rowEl=>{
    const index = parseInt(rowEl.dataset.rowIndex, 10);
    if(Number.isNaN(index) || !rowsBuilt[index]) return;
    const row = rowsBuilt[index];
    const questionEl = rowEl.querySelector('[data-role="question"]');
    if(questionEl){ questionEl.textContent = row?.th?.textContent?.trim() || fillTokens(row?.def?.q || ''); }
    const isValue = rowEl.querySelector('[data-role="is-value"]');
    const rawIs = row?.isTA?.value || '';
    const rawNot = row?.notTA?.value || '';
    if(isValue){ isValue.textContent = previewEvidenceText(rawIs); }
    const notValue = rowEl.querySelector('[data-role="not-value"]');
    if(notValue){ notValue.textContent = previewEvidenceText(rawNot); }
    const noteLabel = rowEl.querySelector('[data-role="note-label"]');
    if(noteLabel && noteLabel.dataset.template){
      noteLabel.textContent = substituteEvidenceTokens(noteLabel.dataset.template, rawIs, rawNot);
    }
    const noteInput = rowEl.querySelector('textarea[data-role="finding-note"]');
    if(noteInput && noteInput.dataset.placeholderTemplate){
      noteInput.placeholder = substituteEvidenceTokens(noteInput.dataset.placeholderTemplate, rawIs, rawNot);
    }
  });
  causeList.querySelectorAll('.cause-card').forEach(card=>{
    const id = card?.dataset?.causeId;
    if(!id) return;
    const cause = possibleCauses.find(item=>item.id === id);
    if(!cause) return;
    const chip = card.querySelector('.cause-card__chip');
    if(chip){ updateCauseProgressChip(chip, cause); }
    const statusEl = card.querySelector('.cause-card__status');
    if(statusEl){ updateCauseStatusLabel(statusEl, cause); }
    updateCauseCardIndicators(card, cause);
  });
}
function focusFirstEditableCause(){
  requestAnimationFrame(()=>{
    const target = causeList?.querySelector('[data-editing="true"] textarea');
    if(target){
      target.focus();
      const end = target.value.length;
      try{ target.setSelectionRange(end, end); }catch(_){ /* no-op */ }
    }
  });
}
let objectIS = null;     // first WHAT → IS
let deviationIS = null;  // second WHAT → IS
let objectISDirty = false;
let deviationISDirty = false;

function mkBand(title, note){
  const tr = document.createElement('tr'); tr.className='band';
  const th = document.createElement('th'); th.colSpan = 5; th.innerHTML = `${title} <span>— ${note}</span>`;
  tr.appendChild(th); return tr;
}
function mkRow(def, i){
  const tr = document.createElement('tr'); tr.dataset.row = i;
  const th = document.createElement('th'); th.scope='row'; th.textContent = fillTokens(def.q);

  const tdIS = document.createElement('td');
  const tdNOT = document.createElement('td');
  const tdDIST = document.createElement('td');
  const tdCHG = document.createElement('td');

  const isTA  = document.createElement('textarea'); isTA.className='tableta';
  const notTA = document.createElement('textarea'); notTA.className='tableta';
  const distTA= document.createElement('textarea'); distTA.className='tableta';
  const chgTA = document.createElement('textarea'); chgTA.className='tableta';

  isTA.placeholder   = fillTokens(def.isPH || "");
  notTA.placeholder  = mkIsNotPH(fillTokens(def.notPH || ""), "");
  distTA.placeholder = mkDistPH("", "");
  chgTA.placeholder  = mkChangePH("");

  const refreshIsNotPH = ()=> notTA.placeholder = mkIsNotPH(fillTokens(def.notPH||""), isTA.value);
  const refreshDistPH  = ()=> distTA.placeholder = mkDistPH(isTA.value, notTA.value);
  const refreshChgPH   = ()=> chgTA.placeholder  = mkChangePH(distTA.value);

  [isTA,notTA,distTA,chgTA].forEach(t=>{
    autoResize(t);
    t.addEventListener('input', ()=>{
      autoResize(t);
      if(t===isTA){
        refreshIsNotPH();
        refreshDistPH();
      }else if(t===notTA){
        refreshDistPH();
      }else if(t===distTA){
        refreshChgPH();
      }
      saveToStorage();
      if(t===isTA || t===notTA){
        renderCauses();
      }else{
        updateCauseEvidencePreviews();
      }
    });
  });

  tdIS.appendChild(isTA); tdNOT.appendChild(notTA); tdDIST.appendChild(distTA); tdCHG.appendChild(chgTA);
  tr.append(th, tdIS, tdNOT, tdDIST, tdCHG);

  rowsBuilt.push({tr, th, def, isTA, notTA, distTA, chgTA});
  return tr;
}
/**
 * Builds the KT table rows from ROWS definitions and wires textarea listeners
 * for persistence, token refresh, and possible-cause previews.
 */
function initTable(){
  let dataRowCount = 0;
  ROWS.forEach((def)=>{
    if(def.band){ tbody.appendChild(mkBand(def.band, def.note||'')); }
    else{
      const tr = mkRow(def, ++dataRowCount);
      tbody.appendChild(tr);
      if(dataRowCount===1) objectIS   = rowsBuilt[rowsBuilt.length-1].isTA;  // first data row IS
      if(dataRowCount===2) deviationIS= rowsBuilt[rowsBuilt.length-1].isTA;  // second data row IS
    }
  });

  [objectIS, deviationIS].forEach(el=>{
    el.addEventListener('input', ()=>{
      if(el===objectIS) objectISDirty = true;
      if(el===deviationIS) deviationISDirty = true;
      refreshAllTokenizedText();
      updateTitlesAndLabels();
      saveToStorage();
    });
  });
}
/* [script:table-build] end */

/* [script:preface-refs] start */
/* =================== Preface helpers & H1/H2 =================== */
/* Collects DOM references for preface cards and dynamic headings. These feeds
   summary generation, token replacement, and persistence. */
const oneLine = document.getElementById('oneLine');
const proof = document.getElementById('proof');
const objectPrefill = document.getElementById('objectPrefill');
const healthy = document.getElementById('healthy');
const now = document.getElementById('now');

const bridgeOpenedUtc = document.getElementById('bridgeOpenedUtc');
const bridgeSetNowBtn = document.getElementById('bridgeSetNowBtn');
const icName = document.getElementById('icName');
const bcName = document.getElementById('bcName');
const semOpsName = document.getElementById('semOpsName');
const severity = document.getElementById('severity');

const detectMonitoring = document.getElementById('detectMonitoring');
const detectUserReport = document.getElementById('detectUserReport');
const detectAutomation = document.getElementById('detectAutomation');
const detectOther = document.getElementById('detectOther');

const evScreenshot = document.getElementById('evScreenshot');
const evLogs = document.getElementById('evLogs');
const evMetrics = document.getElementById('evMetrics');
const evRepro = document.getElementById('evRepro');
const evOther = document.getElementById('evOther');

const labelHealthy = document.getElementById('labelHealthy');
const labelNow = document.getElementById('labelNow');

const docTitle = document.getElementById('docTitle');
const docSubtitle = document.getElementById('docSubtitle');

const impactNow = document.getElementById('impactNow');
const impactFuture = document.getElementById('impactFuture');
const impactTime = document.getElementById('impactTime');

const containNone = document.getElementById('containNone');
const containMitigation = document.getElementById('containMitigation');
const containRestore = document.getElementById('containRestore');
const containDesc = document.getElementById('containDesc');

const commInternalStampBtn = document.getElementById('commInternalStampBtn');
const commExternalStampBtn = document.getElementById('commExternalStampBtn');
const commNextUpdateTime = document.getElementById('commNextUpdateTime');
const commControlsCard = document.getElementById('commControlsCard');
const commCadenceGroup = document.getElementById('commCadenceGroup');
const commCadenceRadios = commCadenceGroup ? [...commCadenceGroup.querySelectorAll('input[name="commCadence"]')] : [];
const commCountdown = document.getElementById('commCountdown');
const commDueAlert = document.getElementById('commDueAlert');
const commLogList = document.getElementById('commLogList');
const commLogToggleBtn = document.getElementById('commLogToggleBtn');
let causeList = document.getElementById('causeList');
let addCauseBtn = document.getElementById('addCauseBtn');

let commLog = [];
let commCadence = '';
let commNextDueIso = '';
let cadenceTimerId = null;
let dueToastShown = false;
let commShowAll = false;

[oneLine, proof, objectPrefill, healthy, now].forEach(el=>{
  el.addEventListener('input', ()=>{
    // If the table fields are empty, seed them from preface
    if(el===objectPrefill && objectIS && !objectIS.value.trim()){
      objectIS.value = el.value.trim(); autoResize(objectIS);
      refreshAllTokenizedText();
    }
    if(el===now && deviationIS && !deviationIS.value.trim()){
      deviationIS.value = el.value.trim(); autoResize(deviationIS);
      refreshAllTokenizedText();
    }
    if(el===oneLine && deviationIS && !deviationIS.value.trim()){
      deviationIS.value = el.value.trim(); autoResize(deviationIS);
      refreshAllTokenizedText();
    }
    updateTitlesAndLabels();
    saveToStorage();
  });
  el.addEventListener('keyup', syncMirror);
  el.addEventListener('change', ()=>syncMirror(true));
});

[icName, bcName, semOpsName].forEach(el=>{
  if(el){ el.addEventListener('input', saveToStorage); }
});
[severity].forEach(el=>{
  if(el){ el.addEventListener('change', saveToStorage); }
});

if(commNextUpdateTime){
  commNextUpdateTime.addEventListener('change', ()=>{
    applyManualDueValue(commNextUpdateTime.value);
    saveToStorage();
  });
}

if(commCadenceRadios.length){
  commCadenceRadios.forEach(radio=>{
    radio.addEventListener('change', ()=>{
      if(!radio.checked) return;
      commCadence = radio.value;
      dueToastShown = false;
      if(commLog.length){
        const lastIso = commLog[0]?.ts;
        if(lastIso){
          const base = new Date(lastIso);
          if(!Number.isNaN(base.valueOf())){
            const mins = getCadenceMinutes();
            if(mins){
              base.setMinutes(base.getMinutes() + mins);
              setNextDue(base);
            }
          }
        }
      }
      scheduleCadenceTick();
      saveToStorage();
    });
  });
}

[
  detectMonitoring,
  detectUserReport,
  detectAutomation,
  detectOther,
  evScreenshot,
  evLogs,
  evMetrics,
  evRepro,
  evOther,
  containNone,
  containMitigation,
  containRestore
].forEach(el=>{ if(el){ el.addEventListener('change', saveToStorage); } });

if(containDesc){ containDesc.addEventListener('input', saveToStorage); }

if(bridgeSetNowBtn){
  bridgeSetNowBtn.addEventListener('click', ()=>{
    bridgeOpenedUtc.value = new Date().toISOString();
    saveToStorage();
    bridgeOpenedUtc.focus();
  });
}

if(commInternalStampBtn){
  commInternalStampBtn.addEventListener('click', ()=>logCommunication('internal'));
}

if(commExternalStampBtn){
  commExternalStampBtn.addEventListener('click', ()=>logCommunication('external'));
}

if(commLogToggleBtn){
  commLogToggleBtn.addEventListener('click', ()=>{
    commShowAll = !commShowAll;
    updateCommLogUI();
  });
}

updateCommLogUI();
scheduleCadenceTick();

function getCadenceMinutes(){
  const mins = parseInt(commCadence, 10);
  return Number.isFinite(mins) ? mins : null;
}

function updateCadenceRadios(){
  if(!commCadenceRadios.length) return;
  commCadenceRadios.forEach(radio=>{
    radio.checked = radio.value === commCadence;
  });
}

function toTimeValue(date){
  if(!(date instanceof Date) || Number.isNaN(date.valueOf())) return '';
  const h = String(date.getHours()).padStart(2,'0');
  const m = String(date.getMinutes()).padStart(2,'0');
  return `${h}:${m}`;
}

function isoFromTimeValue(value){
  if(!value) return '';
  const parts = value.split(':');
  if(parts.length < 2) return '';
  const [hh, mm] = parts.map(Number);
  if(Number.isNaN(hh) || Number.isNaN(mm)) return '';
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(hh, mm, 0, 0);
  if(candidate.getTime() <= now.getTime()){
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.toISOString();
}

function toggleCommDue(isDue){
  if(commControlsCard){
    commControlsCard.classList.toggle('communication-due', !!isDue);
  }
  if(commDueAlert){
    if(isDue){
      commDueAlert.textContent = 'Next communication is due now. Reconfirm updates.';
      commDueAlert.hidden = false;
    }else{
      commDueAlert.textContent = '';
      commDueAlert.hidden = true;
    }
  }
}

function formatCountdown(ms){
  const totalSeconds = Math.max(0, Math.round(ms/1000));
  const mins = Math.floor(totalSeconds/60);
  const secs = totalSeconds % 60;
  if(mins >= 60){
    const hours = Math.floor(mins/60);
    const rem = mins % 60;
    return `${hours}h ${rem}m`;
  }
  if(mins > 0){
    return `${mins}m ${String(secs).padStart(2,'0')}s`;
  }
  return `${secs}s`;
}

function updateCommLogUI(){
  if(!commLogList) return;
  commLogList.innerHTML = '';
  if(!commLog.length){
    const li = document.createElement('li');
    li.className = 'comm-log__empty';
    li.textContent = 'No communications logged yet.';
    commLogList.appendChild(li);
    if(commLogToggleBtn){
      commLogToggleBtn.hidden = true;
      commLogToggleBtn.setAttribute('aria-expanded', 'false');
    }
    return;
  }
  const limit = 6;
  const entries = commShowAll ? commLog : commLog.slice(0, limit);
  entries.forEach(entry=>{
    const li = document.createElement('li');
    const typeSpan = document.createElement('span');
    typeSpan.className = 'comm-log__type';
    typeSpan.textContent = entry.type === 'external' ? 'External' : 'Internal';
    li.appendChild(typeSpan);
    if(entry.message){
      const messageSpan = document.createElement('span');
      messageSpan.className = 'comm-log__message';
      messageSpan.textContent = entry.message;
      li.appendChild(messageSpan);
    }
    const timeEl = document.createElement('time');
    timeEl.className = 'comm-log__time';
    if(entry.ts){
      const d = new Date(entry.ts);
      if(!Number.isNaN(d.valueOf())){
        timeEl.dateTime = entry.ts;
        timeEl.textContent = d.toLocaleString([], { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
      }else{
        timeEl.textContent = entry.ts;
      }
    }
    li.appendChild(timeEl);
    commLogList.appendChild(li);
  });
  if(commLogToggleBtn){
    const hasExtra = commLog.length > limit;
    commLogToggleBtn.hidden = !hasExtra;
    if(hasExtra){
      commLogToggleBtn.textContent = commShowAll ? 'Show less' : 'Show all';
      commLogToggleBtn.setAttribute('aria-expanded', commShowAll ? 'true' : 'false');
    }else{
      commLogToggleBtn.setAttribute('aria-expanded', 'false');
    }
  }
}

function setNextDue(date){
  if(!(date instanceof Date) || Number.isNaN(date.valueOf())) return;
  commNextDueIso = date.toISOString();
  const val = toTimeValue(date);
  if(commNextUpdateTime){ commNextUpdateTime.value = val; }
  dueToastShown = false;
  scheduleCadenceTick();
}

function applyManualDueValue(value){
  if(!value){
    commNextDueIso = '';
    dueToastShown = false;
    if(commNextUpdateTime){ commNextUpdateTime.value = ''; }
    toggleCommDue(false);
    if(commCountdown){ commCountdown.textContent = ''; }
    return;
  }
  const iso = isoFromTimeValue(value);
  if(!iso) return;
  commNextDueIso = iso;
  if(commNextUpdateTime){ commNextUpdateTime.value = value; }
  toggleCommDue(false);
  dueToastShown = false;
  scheduleCadenceTick();
  updateCadenceState();
}

function updateCadenceState(){
  if(!commCountdown) return;
  if(!commNextDueIso){
    commCountdown.textContent = '';
    toggleCommDue(false);
    return;
  }
  const now = new Date();
  const due = new Date(commNextDueIso);
  if(Number.isNaN(due.valueOf())){
    commCountdown.textContent = '';
    toggleCommDue(false);
    return;
  }
  const diff = due.getTime() - now.getTime();
  if(diff <= 0){
    commCountdown.textContent = 'Due now';
    toggleCommDue(true);
    if(!dueToastShown){
      dueToastShown = true;
      if(typeof showToast === 'function'){ showToast('Next communication is due now.'); }
    }
    return;
  }
  commCountdown.textContent = `Next in ${formatCountdown(diff)}`;
  toggleCommDue(false);
}

function scheduleCadenceTick(){
  if(cadenceTimerId){ clearInterval(cadenceTimerId); }
  cadenceTimerId = setInterval(updateCadenceState, 15000);
  updateCadenceState();
}

function logCommunication(type, message=''){
  const now = new Date();
  const iso = now.toISOString();
  const entry = { type, ts: iso };
  if(typeof message === 'string' && message.trim()){
    entry.message = message.trim();
  }
  commLog.unshift(entry);
  commLog = commLog.slice(0, 20);
  commShowAll = false;
  updateCommLogUI();
  const mins = getCadenceMinutes();
  if(mins){
    const due = new Date(now);
    due.setMinutes(due.getMinutes() + mins);
    setNextDue(due);
  }
  saveToStorage();
}
/* [script:preface-refs] end */

/* [script:tokens] start */
/* Token + computed text helpers keep `{OBJECT}` / `{DEVIATION}` references
   consistent across UI labels and summaries. */
function firstSnippet(v){
  const s = (v||'').trim();
  if(!s) return '';
  // Return the first line or sentence, up to 120 chars (not just one char)
  const first = s.split(/\n|\. /)[0];
  return first.length > 120 ? first.slice(0,120) : first;
}
function compactOneLine(str, max=90){
  const s = (str||'').trim().replace(/\s+/g,' ');
  return s.length>max ? s.slice(0,max-1)+'…' : s;
}
function getObjectFull(){
  return (objectPrefill.value || objectIS?.value || '').trim();
}
function getDeviationFull(){
  // Treat "What is happening now?" as the deviation for the problem statement.
  return (now.value || deviationIS?.value || '').trim();
}
function objectAnchor(){
  // Use a compact anchor for labels (not the full paragraph to keep labels readable)
  const src = getObjectFull() || 'the object';
  return compactOneLine(src, 80);
}
function fillTokens(text){
  const obj = firstSnippet(objectIS?.value)    || firstSnippet(getObjectFull()) || 'the object';
  const dev = firstSnippet(deviationIS?.value) || firstSnippet(getDeviationFull()) || 'the deviation';
  return (text||'').replace(/\{OBJECT\}/g, '“'+obj+'”').replace(/\{DEVIATION\}/g, '“'+dev+'”');
}
function mkIsNotPH(baseCopy, isVal){
  const base = (baseCopy||'').trim();
  const isSnippet = firstSnippet(isVal);
  if(isSnippet){
    const prompt = fillTokens(``);
    return base ? `${prompt}\n\n${base}` : prompt;
  }
  return base || fillTokens('');
}
function mkDistPH(isVal, notVal){
  const base = fillTokens('');
  const isSnippet = firstSnippet(isVal);
  const notSnippet = firstSnippet(notVal);
  const parts = [];
  if(isSnippet){ parts.push(`What is different, odd, special, or uniquely true about “${isSnippet}”?`); }
  if(notSnippet){ parts.push(`Only list traits that are not shared by “${notSnippet}”`); }
  const lead = parts.length ? parts.join(' ') + '' : '';
  return lead ? `${lead}\n${base}` : base;
}
function mkChangePH(distText){
  const base = fillTokens('');
  const distSnippet = firstSnippet(distText);
  if(distSnippet){
    return `What changed in, on, around, or about “${distSnippet}”, Ask this question for each distinction listed.\n${base}`;
  }
  return base;
}
function refreshAllTokenizedText(){
  rowsBuilt.forEach(({th, def, isTA, notTA})=>{
    th.textContent = fillTokens(def.q);
    isTA.placeholder  = fillTokens(def.isPH||"");
    notTA.placeholder = mkIsNotPH(fillTokens(def.notPH||""), isTA.value);
  });
  updateCauseEvidencePreviews();
}
function updateTitlesAndLabels(){
  const objFull = getObjectFull();
  const devFull = getDeviationFull();
  const objAnch = objectAnchor();

  if(objFull && devFull){
    // H1/H2 use the FULL text as requested (concatenated)
    docTitle.textContent = `${objFull} — ${devFull}`;
    docSubtitle.textContent = `What is happening now to ${objAnch}: ${devFull}`;
    document.title = `${compactOneLine(objFull, 50)} — ${compactOneLine(devFull, 50)} · KT Intake`;
  }else{
    docTitle.textContent = "KT Intake";
    docSubtitle.textContent = "Describe Problem";
    document.title = "KT Intake";
  }

  // Dynamic labels for Healthy/Now
  labelNow.textContent = objAnch ? `What is happening now to ${objAnch}?` : "What is happening now?";
  labelHealthy.textContent = objAnch ? `What does healthy look like here for ${objAnch}?` : "What does healthy look like?";

  // (Optional) adjust placeholders subtly to reflect anchor
  if(objAnch){
    now.placeholder = ``;
    healthy.placeholder = ``;
  }
}
/* [script:tokens] end */


/* ===== Mirror Sync (robust against extensions/overlays) ===== */
let _mirrorTick = null;
let _lastPrefObj = "";
let _lastPrefNow = "";
/**
 * Periodically syncs prefetched headings into KT table textareas to respect
 * `{OBJECT}`/`{DEVIATION}` token updates. Triggers auto-save when values change.
 */
function syncMirror(force=false){
  try{
    const curObj = getObjectFull();
    const curNow = getDeviationFull();
    let changed = false;
    if(force || curObj !== _lastPrefObj){
      _lastPrefObj = curObj;
      if(objectIS && !objectISDirty){
        if(objectIS.value !== curObj){
          objectIS.value = curObj;
          autoResize(objectIS);
          changed = true;
        }
      }
    }
    if(force || curNow !== _lastPrefNow){
      _lastPrefNow = curNow;
      if(deviationIS && !deviationISDirty){
        if(deviationIS.value !== curNow){
          deviationIS.value = curNow;
          autoResize(deviationIS);
          changed = true;
        }
      }
    }
    if(changed || force){
      refreshAllTokenizedText();
      updateTitlesAndLabels();
      saveToStorage();
    }
  }catch(e){ /* no-op */ }
}
/* [script:init] start */
/* Initialisation helpers wire textarea behaviour, build core UI, and load
   persisted state. Do not rename init(), initTable(), or initStepsFeature(). */
function autoResize(el){
  if(!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  const attr = parseInt(el.getAttribute('data-min-height') || '', 10);
  const varMin = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ta-min-h'), 10);
  const fallback = Number.isFinite(varMin) ? varMin : 140;
  const minH = Number.isFinite(attr) ? attr : fallback;
  const base = Number.isFinite(attr) ? attr : 140;
  el.style.height = Math.max(minH, el.scrollHeight, base) + 'px';
}
function init(){
  initTable();
  ensurePossibleCausesUI();
  renderCauses();
  initStepsFeature({ onSave: saveToStorage, onLog: logCommunication });
  restoreFromStorage();
  if(bridgeOpenedUtc && !bridgeOpenedUtc.value.trim()){
    bridgeOpenedUtc.value = new Date().toISOString();
    saveToStorage();
  }
  refreshAllTokenizedText();
  updateTitlesAndLabels();
  // Kick off periodic sync to capture extension-driven edits (e.g., Grammarly)
  if(!_mirrorTick){ _mirrorTick = setInterval(syncMirror, 300); }
  // Do an immediate sync so existing values populate
  syncMirror(true);
}
/* [script:init] end */

/* [script:export] start */

/* =================== Summary Export (executive style, chat-friendly) =================== */
/* Generates formatted summaries for ServiceNow/AI prompts. See README.md and
   ktintake.AGENTS.md when extending to keep ordering & tone aligned. */
function getSummaryState(){
  return {
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
    commNextUpdateTime,
    getContainmentStatus,
    commLog,
    commNextDueIso,
    stepsItems: getStepsItems(),
    getStepsCounts,
    possibleCauses,
    buildHypothesisSentence,
    causeStatusLabel,
    causeHasFailure,
    countCauseAssumptions,
    evidencePairIndexes,
    countCompletedEvidence,
    getRowKeyByIndex,
    rowsBuilt,
    peekCauseFinding,
    findingMode,
    findingNote,
    fillTokens,
    tbody,
    showToast
  };
}

setSummaryStateProvider(getSummaryState);

async function runSummaryFlow({usePromptPreamble=false}={}){
  const aiType = usePromptPreamble ? 'prompt preamble' : '';
  return generateSummary('summary', aiType);
}

async function onGenerateSummary(){
  return generateSummary('summary', '');
}

async function onGenerateAIPrompt(){
  return generateSummary('summary', 'prompt preamble');
}

window.onGenerateSummary = onGenerateSummary;
window.onGenerateAIPrompt = onGenerateAIPrompt;
window.onGenerateAISummary = () => generateSummary('summary', 'ai summary');

document.addEventListener('DOMContentLoaded', function(){
  init();
  var btn = document.getElementById('genSummaryBtn');
  if(btn){ btn.addEventListener('click', onGenerateSummary); }
  var aiPromptBtn = document.getElementById('commAIPromptBtn');
  if(aiPromptBtn){ aiPromptBtn.addEventListener('click', onGenerateAIPrompt); }
  var aiSummaryBtn = document.getElementById('generateAiSummaryBtn');
  if(aiSummaryBtn){ aiSummaryBtn.addEventListener('click', function(){ generateSummary('summary', 'ai summary'); }); }
});

/* [script:export] end */

/* [script:storage] start */
/* localStorage persistence: serialises the ktIntake payload, cadence timers,
   possible causes, and steps data. Extend keys cautiously. */
/* =================== Autosave =================== */
function getContainmentStatus(){
  if(containMitigation?.checked) return 'mitigation';
  if(containRestore?.checked) return 'restore';
  if(containNone?.checked) return 'none';
  return '';
}
/**
 * Serialises all form inputs, communication cadence, KT table content, possible
 * causes, and steps state into localStorage under `kt-intake-full-v2`.
 * Add new fields by extending this payload and updating restoreFromStorage().
 */
function saveToStorage(){
  const data={ pre:{ oneLine:oneLine.value, proof:proof.value, objectPrefill:objectPrefill.value, healthy:healthy.value, now:now.value },
               impact:{ now:impactNow.value, future:impactFuture.value, time:impactTime.value },
               ops:{
                 bridgeOpenedUtc:bridgeOpenedUtc?.value||'',
                 icName:icName?.value||'',
                 bcName:bcName?.value||'',
                 semOpsName:semOpsName?.value||'',
                 severity:severity?.value||'',
                 detectMonitoring:!!detectMonitoring?.checked,
                 detectUserReport:!!detectUserReport?.checked,
                 detectAutomation:!!detectAutomation?.checked,
                 detectOther:!!detectOther?.checked,
                 evScreenshot:!!evScreenshot?.checked,
                 evLogs:!!evLogs?.checked,
                 evMetrics:!!evMetrics?.checked,
                 evRepro:!!evRepro?.checked,
                 evOther:!!evOther?.checked,
                 containStatus:getContainmentStatus(),
                 containDesc:containDesc?.value||'',
                 commNextUpdateTime:commNextUpdateTime?.value||'',
                 commCadence:commCadence||'',
                 commLog:commLog.slice(0,20),
                 commNextDueIso:commNextDueIso||''
               },
               table:[],
               causes: serializeCauses(possibleCauses),
               steps: exportStepsState() };
  [...tbody.querySelectorAll('tr')].forEach(tr=>{
    if(tr.classList.contains('band')){ data.table.push({band: tr.textContent.trim()}); return; }
    const t=tr.querySelectorAll('textarea');
    data.table.push({q: tr.querySelector('th').textContent.trim(), is:t[0].value, no:t[1].value, di:t[2].value, ch:t[3].value});
  });
  persistStateToStorage(data);
}
/**
 * Restores persisted state from localStorage and rehydrates form controls,
 * KT table, possible causes, and the steps drawer. Keep schema changes in sync
 * with saveToStorage() and document new keys in README/AGENTS.
 */
function restoreFromStorage(){
  const data = loadStateFromStorage();
  if(!data) return;
  if(data.pre){
    oneLine.value=data.pre.oneLine||''; proof.value=data.pre.proof||'';
    objectPrefill.value=data.pre.objectPrefill||''; healthy.value=data.pre.healthy||'';
    now.value=data.pre.now||'';
    [oneLine,proof,objectPrefill,healthy,now].forEach(autoResize);
    if(objectPrefill.value && objectIS && !objectIS.value) { objectIS.value=objectPrefill.value; autoResize(objectIS); }
    if(now.value && deviationIS && !deviationIS.value) { deviationIS.value=now.value; autoResize(deviationIS); }
  }
  if(data.impact){
    impactNow.value=data.impact.now||''; impactFuture.value=data.impact.future||''; impactTime.value=data.impact.time||'';
    [impactNow,impactFuture,impactTime].forEach(autoResize);
  }
  if(data.ops){
    if(bridgeOpenedUtc){ bridgeOpenedUtc.value=data.ops.bridgeOpenedUtc||''; }
    if(icName){ icName.value=data.ops.icName||''; }
    if(bcName){ bcName.value=data.ops.bcName||''; }
    if(semOpsName){ semOpsName.value=data.ops.semOpsName||''; }
    if(severity){ severity.value=data.ops.severity||''; }
    if(detectMonitoring){ detectMonitoring.checked=!!data.ops.detectMonitoring; }
    if(detectUserReport){ detectUserReport.checked=!!data.ops.detectUserReport; }
    if(detectAutomation){ detectAutomation.checked=!!data.ops.detectAutomation; }
    if(detectOther){ detectOther.checked=!!data.ops.detectOther; }
    if(evScreenshot){ evScreenshot.checked=!!data.ops.evScreenshot; }
    if(evLogs){ evLogs.checked=!!data.ops.evLogs; }
    if(evMetrics){ evMetrics.checked=!!data.ops.evMetrics; }
    if(evRepro){ evRepro.checked=!!data.ops.evRepro; }
    if(evOther){ evOther.checked=!!data.ops.evOther; }
    if(containDesc){ containDesc.value=data.ops.containDesc||''; }
    if(typeof data.ops.containStatus==='string'){
      const status = data.ops.containStatus;
      if(containNone){ containNone.checked = status==='none'; }
      if(containMitigation){ containMitigation.checked = status==='mitigation'; }
      if(containRestore){ containRestore.checked = status==='restore'; }
    }
    if(commNextUpdateTime){ commNextUpdateTime.value=data.ops.commNextUpdateTime||''; }
    commCadence = typeof data.ops.commCadence==='string' ? data.ops.commCadence : commCadence;
    if(Array.isArray(data.ops.commLog)){
      commLog = data.ops.commLog.filter(entry=>entry && typeof entry.type==='string' && typeof entry.ts==='string');
    }
    commNextDueIso = typeof data.ops.commNextDueIso==='string' ? data.ops.commNextDueIso : commNextDueIso;
    dueToastShown = false;
    updateCadenceRadios();
    updateCommLogUI();
    if(commNextDueIso){
      const due = new Date(commNextDueIso);
      if(!Number.isNaN(due.valueOf())){
        const val = toTimeValue(due);
        if(val){
          if(commNextUpdateTime){ commNextUpdateTime.value = val; }
        }
      }
    }else if(commNextUpdateTime && commNextUpdateTime.value){
      applyManualDueValue(commNextUpdateTime.value);
    }else{
      updateCadenceState();
    }
  }
  if(Array.isArray(data.table)){
    let i=0;
    [...tbody.querySelectorAll('tr')].forEach(tr=>{
      if(tr.classList.contains('band')) return;
      const rec = data.table.find(d=>d.q===tr.querySelector('th').textContent.trim() && !d.band) || data.table[i++];
      if(!rec) return;
      const t = tr.querySelectorAll('textarea');
      t[0].value=rec.is||''; t[1].value=rec.no||''; t[2].value=rec.di||''; t[3].value=rec.ch||'';
      t.forEach(autoResize);
    });
  }
  if(Array.isArray(data.causes)){
    possibleCauses = deserializeCauses(data.causes);
  }else{
    possibleCauses = [];
  }
  ensurePossibleCausesUI();
  renderCauses();
  if(possibleCauses.some(cause=>cause && cause.editing)){
    focusFirstEditableCause();
  }
  updateCauseEvidencePreviews();
  scheduleCadenceTick();
  if(data.steps){
    importStepsState(data.steps);
  }
}
/* [script:storage] end */

/* [script:toast] start */
/* Minimal notification helper for clipboard feedback. */
function showToast(msg){
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show';
  setTimeout(()=>toast.classList.remove('show'), 2200);
}
/* [script:toast] end */
