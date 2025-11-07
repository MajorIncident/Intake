import {
  ROWS,
  CAUSE_FINDING_MODES,
  CAUSE_FINDING_MODE_VALUES
} from './constants.js';

let autoResize = () => {};
let saveHandler = () => {};
let showToastHandler = null;
let tokensChangeHandler = () => {};
let getObjectFullFn = () => '';
let getDeviationFullFn = () => '';

const tbody = document.getElementById('tbody');
const rowsBuilt = [];
let possibleCauses = [];
let causeList = document.getElementById('causeList');
let addCauseBtn = document.getElementById('addCauseBtn');

let objectIS = null;
let deviationIS = null;
let objectISDirty = false;
let deviationISDirty = false;

export function configureKT({
  autoResize: autoResizeFn,
  onSave,
  showToast,
  onTokensChange,
  getObjectFull,
  getDeviationFull
} = {}){
  if(typeof autoResizeFn === 'function'){
    autoResize = autoResizeFn;
  }
  if(typeof onSave === 'function'){
    saveHandler = onSave;
  }
  if(typeof showToast === 'function'){
    showToastHandler = showToast;
  }
  if(typeof onTokensChange === 'function'){
    tokensChangeHandler = onTokensChange;
  }
  if(typeof getObjectFull === 'function'){
    getObjectFullFn = getObjectFull;
  }
  if(typeof getDeviationFull === 'function'){
    getDeviationFullFn = getDeviationFull;
  }
}

function callShowToast(message){
  if(typeof showToastHandler === 'function'){
    showToastHandler(message);
  }
}

function firstSnippet(v){
  const s = (v || '').trim();
  if(!s) return '';
  const first = s.split(/\n|\. /)[0];
  return first.length > 120 ? first.slice(0, 120) : first;
}

export function getObjectISField(){
  return objectIS;
}

export function getDeviationISField(){
  return deviationIS;
}

export function isObjectISDirty(){
  return objectISDirty;
}

export function isDeviationISDirty(){
  return deviationISDirty;
}

export function fillTokens(text){
  const obj = firstSnippet(objectIS?.value)
    || firstSnippet(getObjectFullFn())
    || 'the object';
  const dev = firstSnippet(deviationIS?.value)
    || firstSnippet(getDeviationFullFn())
    || 'the deviation';
  return (text || '')
    .replace(/\{OBJECT\}/g, `“${obj}”`)
    .replace(/\{DEVIATION\}/g, `“${dev}”`);
}

function mkIsNotPH(baseCopy, isVal){
  const base = (baseCopy || '').trim();
  const isSnippet = firstSnippet(isVal);
  if(isSnippet){
    const prompt = fillTokens('');
    return base ? `${prompt}\n\n${base}` : prompt;
  }
  return base || fillTokens('');
}

function mkDistPH(isVal, notVal){
  const base = fillTokens('');
  const isSnippet = firstSnippet(isVal);
  const notSnippet = firstSnippet(notVal);
  const parts = [];
  if(isSnippet){
    parts.push(`What is different, odd, special, or uniquely true about “${isSnippet}”?`);
  }
  if(notSnippet){
    parts.push(`Only list traits that are not shared by “${notSnippet}”`);
  }
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

export function refreshAllTokenizedText(){
  rowsBuilt.forEach(({ th, def, isTA, notTA }) => {
    th.textContent = fillTokens(def.q);
    isTA.placeholder = fillTokens(def.isPH || '');
    notTA.placeholder = mkIsNotPH(fillTokens(def.notPH || ''), isTA.value);
  });
  updateCauseEvidencePreviews();
}

function isValidFindingMode(mode){
  return typeof mode === 'string' && CAUSE_FINDING_MODE_VALUES.includes(mode);
}

function normalizeFindingEntry(entry){
  const normalized = { mode: '', note: '' };
  if(entry && typeof entry === 'object'){
    if(typeof entry.mode === 'string'){
      const mode = entry.mode.trim().toLowerCase();
      if(isValidFindingMode(mode)){
        normalized.mode = mode;
      }
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

export function findingMode(entry){
  if(!entry || typeof entry !== 'object') return '';
  const mode = typeof entry.mode === 'string' ? entry.mode : '';
  return isValidFindingMode(mode) ? mode : '';
}

export function findingNote(entry){
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

export { peekCauseFinding };

export function causeHasFailure(cause){
  if(!cause) return false;
  const indexes = evidencePairIndexes();
  if(!indexes.length) return false;
  for(let i = 0; i < indexes.length; i++){
    const entry = peekCauseFinding(cause, getRowKeyByIndex(indexes[i]));
    if(entry && findingMode(entry) === CAUSE_FINDING_MODES.FAIL){
      return true;
    }
  }
  return false;
}

export function countCauseAssumptions(cause){
  if(!cause) return 0;
  const indexes = evidencePairIndexes();
  let total = 0;
  indexes.forEach(idx => {
    const entry = peekCauseFinding(cause, getRowKeyByIndex(idx));
    if(entry && findingMode(entry) === CAUSE_FINDING_MODES.ASSUMPTION){
      total++;
    }
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
  return 'cause-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36);
}

export function createEmptyCause(){
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
  return ['suspect', 'accusation', 'impact'].every(key => typeof cause[key] === 'string' && cause[key].trim().length);
}

export function buildHypothesisSentence(cause){
  if(!cause) return '';
  const suspect = (cause.suspect || '').trim();
  const accusation = (cause.accusation || '').trim();
  const impact = (cause.impact || '').trim();
  if(!suspect && !accusation && !impact){
    return 'Add suspect, accusation, and impact to craft a strong hypothesis.';
  }
  const fallback = text => (text && text.trim()) ? text.trim() : '…';
  return `We suspect ${fallback(suspect)} because ${fallback(accusation)}, which results in ${fallback(impact)}.`;
}

export function getRowKeyByIndex(index){
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

export function evidencePairIndexes(){
  const indexes = [];
  rowsBuilt.forEach((row, index) => {
    if(rowHasEvidencePair(row)){
      indexes.push(index);
    }
  });
  return indexes;
}

export function countCompletedEvidence(cause, eligibleIndexes){
  let count = 0;
  const indexes = Array.isArray(eligibleIndexes) ? eligibleIndexes : evidencePairIndexes();
  indexes.forEach(index => {
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

export function causeStatusLabel(cause){
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
  return lines.map(line => `• ${line}`).join('\n');
}

function splitLines(text){
  const v = (text || '').trim();
  if(!v) return [];
  return v.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function makeRemoveButton(cause){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-mini btn-ghost';
  btn.textContent = 'Remove';
  btn.addEventListener('click', () => {
    if(confirm('Remove this possible cause?')){
      possibleCauses = possibleCauses.filter(item => item.id !== cause.id);
      renderCauses();
      saveHandler();
    }
  });
  return btn;
}

export function ensurePossibleCausesUI(){
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
    addCauseBtn.addEventListener('click', () => {
      const newCause = createEmptyCause();
      possibleCauses.push(newCause);
      renderCauses();
      saveHandler();
      focusFirstEditableCause();
    });
  }
}

export function renderCauses(){
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
  possibleCauses.forEach((cause, index) => {
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
    titleEl.textContent = `Possible Cause ${index + 1}`;
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
      suspectInput.setAttribute('data-min-height', '120');
      suspectInput.addEventListener('input', e => {
        cause.suspect = e.target.value;
        autoResize(suspectInput);
        summaryEl.textContent = buildHypothesisSentence(cause);
        updateCauseStatusLabel(statusEl, cause);
        updateCauseProgressChip(chip, cause);
        saveHandler();
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
      accusationInput.setAttribute('data-min-height', '120');
      accusationInput.addEventListener('input', e => {
        cause.accusation = e.target.value;
        autoResize(accusationInput);
        summaryEl.textContent = buildHypothesisSentence(cause);
        updateCauseStatusLabel(statusEl, cause);
        updateCauseProgressChip(chip, cause);
        saveHandler();
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
      impactInput.setAttribute('data-min-height', '120');
      impactInput.addEventListener('input', e => {
        cause.impact = e.target.value;
        autoResize(impactInput);
        summaryEl.textContent = buildHypothesisSentence(cause);
        updateCauseStatusLabel(statusEl, cause);
        updateCauseProgressChip(chip, cause);
        saveHandler();
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
      saveBtn.addEventListener('click', () => {
        if(!hasCompleteHypothesis(cause)){
          callShowToast('Fill in all three prompts to save this possible cause.');
          return;
        }
        cause.editing = false;
        renderCauses();
        saveHandler();
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
      editBtn.addEventListener('click', () => {
        cause.editing = true;
        renderCauses();
        saveHandler();
        focusFirstEditableCause();
      });
      const testBtn = document.createElement('button');
      testBtn.type = 'button';
      testBtn.className = 'btn-mini';
      testBtn.textContent = cause.testingOpen ? 'Hide testing' : 'Test this cause';
      testBtn.addEventListener('click', () => {
        cause.testingOpen = !cause.testingOpen;
        renderCauses();
        saveHandler();
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
  eligibleIndexes.forEach(index => {
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
    noteInput.setAttribute('data-min-height', '120');
    noteInput.disabled = true;
    noteInput.addEventListener('input', e => {
      setCauseFindingValue(cause, rowKey, 'note', e.target.value);
      autoResize(noteInput);
      updateCauseProgressChip(progressChip, cause);
      updateCauseStatusLabel(statusEl, cause);
      updateCauseCardIndicators(card, cause);
      saveHandler();
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

    function applyMode(newMode, opts = {}){
      const active = isValidFindingMode(newMode) ? newMode : '';
      buttons.forEach(btn => {
        btn.element.classList.toggle('is-selected', btn.mode === active);
      });
      if(active){
        const config = optionDefs.find(def => def.mode === active);
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
        saveHandler();
      }
    }

    optionDefs.forEach(def => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cause-eval-option';
      btn.textContent = def.buttonLabel;
      btn.dataset.mode = def.mode;
      btn.addEventListener('click', () => {
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
    applyMode(startingMode, { silent: true });
    panel.appendChild(rowEl);
  });
  return panel;
}

export function updateCauseEvidencePreviews(){
  if(!causeList) return;
  causeList.querySelectorAll('.cause-eval-row').forEach(rowEl => {
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
  causeList.querySelectorAll('.cause-card').forEach(card => {
    const id = card?.dataset?.causeId;
    if(!id) return;
    const cause = possibleCauses.find(item => item.id === id);
    if(!cause) return;
    const chip = card.querySelector('.cause-card__chip');
    if(chip){ updateCauseProgressChip(chip, cause); }
    const statusEl = card.querySelector('.cause-card__status');
    if(statusEl){ updateCauseStatusLabel(statusEl, cause); }
    updateCauseCardIndicators(card, cause);
  });
}

export function focusFirstEditableCause(){
  requestAnimationFrame(() => {
    const target = causeList?.querySelector('[data-editing="true"] textarea');
    if(target){
      target.focus();
      const end = target.value.length;
      try{ target.setSelectionRange(end, end); }catch(_){ /* no-op */ }
    }
  });
}

export function getPossibleCauses(){
  return possibleCauses;
}

export function setPossibleCauses(list){
  possibleCauses = Array.isArray(list) ? list : [];
}

export function getRowsBuilt(){
  return rowsBuilt;
}

export function getTableElement(){
  return tbody;
}

export function exportKTTableState(){
  if(!tbody) return [];
  const out = [];
  [...tbody.querySelectorAll('tr')].forEach(tr => {
    if(tr.classList.contains('band')){
      out.push({ band: tr.textContent.trim() });
      return;
    }
    const th = tr.querySelector('th');
    const textareas = tr.querySelectorAll('textarea');
    out.push({
      q: th?.textContent.trim() || '',
      is: textareas[0]?.value || '',
      no: textareas[1]?.value || '',
      di: textareas[2]?.value || '',
      ch: textareas[3]?.value || ''
    });
  });
  return out;
}

export function importKTTableState(tableData){
  if(!tbody || !Array.isArray(tableData)) return;
  let index = 0;
  [...tbody.querySelectorAll('tr')].forEach(tr => {
    if(tr.classList.contains('band')) return;
    const th = tr.querySelector('th');
    const label = th?.textContent.trim() || '';
    const match = tableData.find(entry => !entry.band && entry.q === label);
    const record = match || tableData[index++];
    if(!record) return;
    const textareas = tr.querySelectorAll('textarea');
    if(textareas[0]){ textareas[0].value = record.is || ''; autoResize(textareas[0]); }
    if(textareas[1]){ textareas[1].value = record.no || ''; autoResize(textareas[1]); }
    if(textareas[2]){ textareas[2].value = record.di || ''; autoResize(textareas[2]); }
    if(textareas[3]){ textareas[3].value = record.ch || ''; autoResize(textareas[3]); }
  });
  refreshAllTokenizedText();
}

function mkBand(title, note){
  const tr = document.createElement('tr'); tr.className = 'band';
  const th = document.createElement('th'); th.colSpan = 5; th.innerHTML = `${title} <span>— ${note}</span>`;
  tr.appendChild(th); return tr;
}

function mkRow(def, i){
  const tr = document.createElement('tr'); tr.dataset.row = i;
  const th = document.createElement('th'); th.scope = 'row'; th.textContent = fillTokens(def.q);

  const tdIS = document.createElement('td');
  const tdNOT = document.createElement('td');
  const tdDIST = document.createElement('td');
  const tdCHG = document.createElement('td');

  const isTA = document.createElement('textarea'); isTA.className = 'tableta';
  const notTA = document.createElement('textarea'); notTA.className = 'tableta';
  const distTA = document.createElement('textarea'); distTA.className = 'tableta';
  const chgTA = document.createElement('textarea'); chgTA.className = 'tableta';

  isTA.placeholder = fillTokens(def.isPH || '');
  notTA.placeholder = mkIsNotPH(fillTokens(def.notPH || ''), '');
  distTA.placeholder = mkDistPH('', '');
  chgTA.placeholder = mkChangePH('');

  const refreshIsNot = () => { notTA.placeholder = mkIsNotPH(fillTokens(def.notPH || ''), isTA.value); };
  const refreshDist = () => { distTA.placeholder = mkDistPH(isTA.value, notTA.value); };
  const refreshChg = () => { chgTA.placeholder = mkChangePH(distTA.value); };

  [isTA, notTA, distTA, chgTA].forEach(t => {
    autoResize(t);
    t.addEventListener('input', () => {
      autoResize(t);
      if(t === isTA){
        refreshIsNot();
        refreshDist();
      }else if(t === notTA){
        refreshDist();
      }else if(t === distTA){
        refreshChg();
      }
      saveHandler();
      if(t === isTA || t === notTA){
        renderCauses();
      }else{
        updateCauseEvidencePreviews();
      }
    });
  });

  tdIS.appendChild(isTA); tdNOT.appendChild(notTA); tdDIST.appendChild(distTA); tdCHG.appendChild(chgTA);
  tr.append(th, tdIS, tdNOT, tdDIST, tdCHG);

  rowsBuilt.push({ tr, th, def, isTA, notTA, distTA, chgTA });
  return tr;
}

export function initTable(){
  if(!tbody) return;
  if(rowsBuilt.length){
    return;
  }
  let dataRowCount = 0;
  ROWS.forEach(def => {
    if(def.band){
      tbody.appendChild(mkBand(def.band, def.note || ''));
    }else{
      const tr = mkRow(def, ++dataRowCount);
      tbody.appendChild(tr);
      if(dataRowCount === 1) objectIS = rowsBuilt[rowsBuilt.length - 1].isTA;
      if(dataRowCount === 2) deviationIS = rowsBuilt[rowsBuilt.length - 1].isTA;
    }
  });

  [objectIS, deviationIS].forEach(el => {
    if(!el) return;
    el.addEventListener('input', () => {
      if(el === objectIS) objectISDirty = true;
      if(el === deviationIS) deviationISDirty = true;
      refreshAllTokenizedText();
      tokensChangeHandler();
      saveHandler();
    });
  });
}
