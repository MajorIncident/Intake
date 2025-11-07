// Main JavaScript for KT Intake – extracted from inline script in ktintake.html

/* [rows] start */
/* =================== Core data & prompts (KT Problem Analysis) =================== */
/* Use {OBJECT} / {DEVIATION} tokens anywhere you want auto-fill. These are protected
   datasets—see README.md and AGENTS.md for change control expectations. */
import {
  ROWS,
  CAUSE_FINDING_MODES,
  CAUSE_FINDING_MODE_VALUES,
  STEPS_PHASES,
  STEP_DEFINITIONS
} from './src/constants.js';

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
/**
 * Serialises possible causes for storage/export.
 * @returns {Array<object>} causes with normalized finding entries ready for persistence.
 */
function serializeCauses(){
  return possibleCauses.map(cause=>{
    const findings = {};
    if(cause.findings && typeof cause.findings === 'object'){
      Object.keys(cause.findings).forEach(key=>{
        const normalized = normalizeFindingEntry(cause.findings[key]);
        const mode = findingMode(normalized);
        const note = findingNote(normalized);
        if(mode || note.trim()){
          findings[key] = { mode, note };
          cause.findings[key] = normalized;
        }else{
          delete cause.findings[key];
        }
      });
    }
    return {
      id: cause.id || generateCauseId(),
      suspect: cause.suspect || '',
      accusation: cause.accusation || '',
      impact: cause.impact || '',
      findings,
      editing: !!cause.editing,
      testingOpen: !!cause.testingOpen
    };
  });
}
/**
 * Hydrates possible causes from stored JSON structures.
 * @param {Array<object>} rawList
 * @returns {Array<object>} cleaned cause objects safe for rendering.
 */
function deserializeCauses(rawList){
  if(!Array.isArray(rawList)) return [];
  return rawList.map(raw=>{
    const cause = {
      id: typeof raw.id === 'string' ? raw.id : generateCauseId(),
      suspect: typeof raw.suspect === 'string' ? raw.suspect : '',
      accusation: typeof raw.accusation === 'string' ? raw.accusation : '',
      impact: typeof raw.impact === 'string' ? raw.impact : '',
      findings: {},
      editing: !!raw.editing,
      testingOpen: !!raw.testingOpen
    };
    if(raw && raw.findings && typeof raw.findings === 'object'){
      Object.keys(raw.findings).forEach(key=>{
        const normalized = normalizeFindingEntry(raw.findings[key]);
        const mode = findingMode(normalized);
        const note = findingNote(normalized);
        if(mode || note.trim()){
          cause.findings[key] = normalized;
        }
      });
    }
    return cause;
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

/* ===== Steps Checklist ===== */
const STEPS_ITEMS_KEY = 'steps.items';
const STEPS_DRAWER_KEY = 'steps.drawerOpen';
let stepsBtn = null;
let stepsCompletedLabel = null;
let stepsDrawer = null;
let stepsBackdrop = null;
let stepsList = null;
let stepsCloseBtn = null;
let stepsDrawerProgress = null;
let stepsItems = STEP_DEFINITIONS.map(def=>({ id:def.id, phase:def.phase, label:def.label, checked:false }));
let stepsDrawerOpen = false;
let stepsReady = false;
let stepsReturnFocus = null;

function parseJsonSafe(value){
  if(!value) return null;
  try{
    return JSON.parse(value);
  }catch(_){
    return null;
  }
}

function hydrateStepsFromLocalStorage(){
  const storedItems = parseJsonSafe(localStorage.getItem(STEPS_ITEMS_KEY));
  const map = new Map();
  if(Array.isArray(storedItems)){
    storedItems.forEach(item=>{
      if(!item || item.id === undefined) return;
      const key = String(item.id);
      map.set(key, {
        checked: !!item.checked,
        label: typeof item.label === 'string' ? item.label : ''
      });
    });
  }
  stepsItems = STEP_DEFINITIONS.map(def=>{
    const stored = map.get(def.id);
    return {
      id: def.id,
      phase: def.phase,
      label: stored && stored.label ? stored.label : def.label,
      checked: stored ? !!stored.checked : false
    };
  });
  const storedDrawer = parseJsonSafe(localStorage.getItem(STEPS_DRAWER_KEY));
  if(typeof storedDrawer === 'boolean'){
    stepsDrawerOpen = storedDrawer;
  }
}

function saveStepsItemsToLocalStorage(){
  try{
    const payload = stepsItems.map(item=>({ id:item.id, label:item.label, checked:!!item.checked }));
    localStorage.setItem(STEPS_ITEMS_KEY, JSON.stringify(payload));
  }catch(_){ /* ignore */ }
}

function saveStepsDrawerStateToLocalStorage(){
  try{
    localStorage.setItem(STEPS_DRAWER_KEY, JSON.stringify(!!stepsDrawerOpen));
  }catch(_){ /* ignore */ }
}

function getStepsCounts(){
  const total = stepsItems.length;
  const completed = stepsItems.filter(item=>item.checked).length;
  return { total, completed };
}

function formatStepsBadge(){
  const { total, completed } = getStepsCounts();
  return `${completed} of ${total}`;
}

function formatStepsDrawerProgress(){
  const { total, completed } = getStepsCounts();
  return `${completed} of ${total} completed`;
}

function updateStepsProgressUI(){
  const badgeText = formatStepsBadge();
  if(stepsCompletedLabel){
    stepsCompletedLabel.textContent = badgeText;
  }
  if(stepsDrawerProgress){
    stepsDrawerProgress.textContent = formatStepsDrawerProgress();
  }
}

function getDrawerFocusables(){
  if(!stepsDrawer) return [];
  const nodes = stepsDrawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  return [...nodes].filter(el=>{
    if(el.hasAttribute('disabled')) return false;
    if(el.getAttribute('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

function renderStepsList(){
  if(!stepsList) return;
  stepsList.innerHTML = '';
  const grouped = new Map();
  stepsItems.forEach(step=>{
    if(!grouped.has(step.phase)){
      grouped.set(step.phase, []);
    }
    grouped.get(step.phase).push(step);
  });
  STEPS_PHASES.forEach(phase=>{
    const items = grouped.get(phase.id);
    if(!items || !items.length) return;
    const details = document.createElement('details');
    details.className = 'steps-category';
    details.open = true;
    const summary = document.createElement('summary');
    summary.className = 'steps-category__header';
    const textWrap = document.createElement('div');
    textWrap.className = 'steps-category__header-text';
    const phaseEl = document.createElement('span');
    phaseEl.className = 'steps-category__phase';
    phaseEl.textContent = `Phase ${phase.id}`;
    const nameEl = document.createElement('span');
    nameEl.className = 'steps-category__name';
    nameEl.textContent = phase.label;
    textWrap.appendChild(phaseEl);
    textWrap.appendChild(nameEl);
    const chevron = document.createElement('span');
    chevron.className = 'steps-category__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    summary.appendChild(textWrap);
    summary.appendChild(chevron);
    details.appendChild(summary);
    const container = document.createElement('div');
    container.className = 'steps-category__items';
    items.forEach(step=>{
      const row = document.createElement('div');
      row.className = 'steps-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `step-${step.id}`;
      checkbox.dataset.stepId = step.id;
      checkbox.checked = !!step.checked;
      const label = document.createElement('label');
      label.htmlFor = checkbox.id;
      label.textContent = step.label;
      checkbox.addEventListener('change', handleStepToggle);
      row.appendChild(checkbox);
      row.appendChild(label);
      container.appendChild(row);
    });
    details.appendChild(container);
    stepsList.appendChild(details);
  });
}

function handleStepToggle(event){
  const checkbox = event.currentTarget;
  if(!checkbox || !checkbox.dataset) return;
  const stepId = checkbox.dataset.stepId;
  const step = stepsItems.find(item=>item.id === stepId);
  if(!step) return;
  step.checked = !!checkbox.checked;
  updateStepsProgressUI();
  saveStepsItemsToLocalStorage();
  if(stepsReady){
    saveToStorage();
  }
  const message = step.checked ? `Step checked: ${step.label}` : `Step unchecked: ${step.label}`;
  logCommunication('internal', message);
}

function handleStepsDrawerKeydown(event){
  if(event.key !== 'Tab') return;
  const focusables = getDrawerFocusables();
  if(!focusables.length){
    event.preventDefault();
    if(stepsCloseBtn){ stepsCloseBtn.focus(); }
    return;
  }
  const index = focusables.indexOf(document.activeElement);
  if(event.shiftKey){
    if(index <= 0){
      event.preventDefault();
      focusables[focusables.length - 1].focus();
    }
  }else{
    if(index === focusables.length - 1){
      event.preventDefault();
      focusables[0].focus();
    }
  }
}

function handleStepsGlobalKeydown(event){
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  if(key === 's' && event.altKey && !event.ctrlKey && !event.metaKey){
    event.preventDefault();
    toggleStepsDrawer();
    return;
  }
  if(event.key === 'Escape' && stepsDrawerOpen){
    event.preventDefault();
    closeStepsDrawer();
  }
}

function setStepsDrawer(open, options={}){
  const shouldOpen = !!open;
  const skipFocus = !!options.skipFocus;
  const skipSave = !!options.skipSave;
  if(shouldOpen && !stepsDrawerOpen){
    stepsReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  stepsDrawerOpen = shouldOpen;
  if(stepsDrawer){
    stepsDrawer.classList.toggle('is-open', shouldOpen);
    stepsDrawer.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  }
  if(stepsBackdrop){
    stepsBackdrop.classList.toggle('is-open', shouldOpen);
    stepsBackdrop.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  }
  if(stepsBtn){
    stepsBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }
  document.body.classList.toggle('steps-drawer-open', shouldOpen);
  if(shouldOpen){
    if(!skipFocus){
      const focusables = getDrawerFocusables();
      const target = focusables.length ? focusables[0] : stepsCloseBtn || stepsDrawer;
      requestAnimationFrame(()=>{ target?.focus?.(); });
    }
  }else{
    const target = stepsBtn || stepsReturnFocus;
    if(!skipFocus){
      requestAnimationFrame(()=>{ target?.focus?.(); });
    }
    stepsReturnFocus = null;
  }
  if(stepsDrawerProgress){
    stepsDrawerProgress.textContent = formatStepsDrawerProgress();
  }
  if(!skipSave){
    saveStepsDrawerStateToLocalStorage();
    if(stepsReady){
      saveToStorage();
    }
  }
}

function openStepsDrawer(){ setStepsDrawer(true); }
function closeStepsDrawer(){ setStepsDrawer(false); }
function toggleStepsDrawer(){ setStepsDrawer(!stepsDrawerOpen); }

function exportStepsState(){
  return {
    items: stepsItems.map(item=>({ id:item.id, label:item.label, checked:!!item.checked })),
    drawerOpen: !!stepsDrawerOpen
  };
}

function importStepsState(data){
  if(!data) return;
  let incoming = null;
  if(Array.isArray(data.items)){
    incoming = data.items;
  }else if(Array.isArray(data.steps)){
    incoming = data.steps;
  }
  if(Array.isArray(incoming)){
    const map = new Map();
    incoming.forEach(item=>{
      if(!item) return;
      const key = item.id !== undefined ? String(item.id) : (item.stepId !== undefined ? String(item.stepId) : '');
      if(!key) return;
      map.set(key, {
        checked: !!item.checked,
        label: typeof item.label === 'string' ? item.label : (typeof item.title === 'string' ? item.title : '')
      });
    });
    stepsItems = STEP_DEFINITIONS.map(def=>{
      const stored = map.get(def.id);
      return {
        id: def.id,
        phase: def.phase,
        label: stored && stored.label ? stored.label : def.label,
        checked: stored ? !!stored.checked : false
      };
    });
  }
  if(typeof data.drawerOpen === 'boolean'){
    stepsDrawerOpen = data.drawerOpen;
  }else if(typeof data.open === 'boolean'){
    stepsDrawerOpen = data.open;
  }
  renderStepsList();
  updateStepsProgressUI();
  setStepsDrawer(stepsDrawerOpen, { skipFocus:true, skipSave:true });
  saveStepsItemsToLocalStorage();
  saveStepsDrawerStateToLocalStorage();
}

/**
 * Bootstraps the incident steps drawer: wires DOM references, restores
 * persisted progress, and attaches keyboard/toggle listeners.
 */
function initStepsFeature(){
  stepsBtn = document.getElementById('stepsBtn');
  stepsCompletedLabel = document.getElementById('stepsCompletedLabel');
  stepsDrawer = document.getElementById('stepsDrawer');
  stepsBackdrop = document.getElementById('stepsBackdrop');
  stepsList = document.getElementById('stepsList');
  stepsCloseBtn = document.getElementById('stepsCloseBtn');
  stepsDrawerProgress = document.getElementById('stepsDrawerProgress');

  hydrateStepsFromLocalStorage();
  renderStepsList();
  updateStepsProgressUI();
  setStepsDrawer(stepsDrawerOpen, { skipFocus:true, skipSave:true });

  if(stepsBtn){ stepsBtn.addEventListener('click', toggleStepsDrawer); }
  if(stepsCloseBtn){ stepsCloseBtn.addEventListener('click', closeStepsDrawer); }
  if(stepsBackdrop){ stepsBackdrop.addEventListener('click', closeStepsDrawer); }
  if(stepsDrawer){ stepsDrawer.addEventListener('keydown', handleStepsDrawerKeydown); }
  document.addEventListener('keydown', handleStepsGlobalKeydown);
  stepsReady = true;
}

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
  initStepsFeature();
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

function ensureSummaryCard(){
  let card = document.getElementById('summaryCard');
  if(!card){
    const wrap = document.querySelector('.wrap');
    card = document.createElement('div');
    card.className = 'card';
    card.id = 'summaryCard';
    const h = document.createElement('h3'); h.textContent = 'Copy & Paste Summary';
    const pre = document.createElement('pre'); pre.id='summaryPre'; pre.style.whiteSpace='pre-wrap'; pre.style.font='13px/1.6 monospace'; pre.style.margin='0';
    card.appendChild(h); card.appendChild(pre);
    wrap.appendChild(card);
  }
  return card;
}

// Normalize user text into a single logical string for table cells (we’ll wrap visually in the table).
function inlineText(s){
  const v=(s||'').trim();
  if(!v) return '—';
  return v
    .split(/\r?\n/)
    .map(x=>x.trim())
    .filter(Boolean)
    .join(' · ');
}

function inlineSummaryText(s){
  const lines = splitLines(s);
  if(!lines.length) return '';
  return lines.join(' · ');
}

function summaryLine(label, value){
  const text = inlineSummaryText(value);
  if(!text) return '';
  return `${label}: ${text}`;
}

function summaryLineRaw(label, value){
  const text = (value||'').trim();
  if(!text) return '';
  return `${label}: ${text}`;
}

function summaryBullet(label, value){
  const text = inlineSummaryText(value);
  if(!text) return '';
  return `• ${label}: ${text}`;
}

function summaryBulletRaw(label, value){
  const text = (value||'').trim();
  if(!text) return '';
  return `• ${label}: ${text}`;
}

function joinSummaryLines(lines){
  return lines.filter(line=>line && line.trim().length).join('\n');
}

function splitLines(text){
  const v=(text||'').trim();
  if(!v) return [];
  return v.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
}

function formatLabeledList(label, lines){
  if(!lines.length) return '';
  if(lines.length === 1) return `${label}: ${lines[0]}`;
  const bullets = lines.map(line=>`  • ${line}`).join('\n');
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
  for(let i=0;i<len;i++){
    const left = distLines[i] || '—';
    const right = changeLines[i] || '—';
    pairs.push(`  • ${left} → ${right}`);
  }
  return ['Distinctions → Changes:', ...pairs].join('\n');
}

function formatChipsetSelections(list){
  const selected = list.filter(item=>item.el?.checked).map(item=>item.label);
  return selected.length ? selected.join(', ') : '';
}

function containmentStatusText(){
  const status = getContainmentStatus();
  if(status==='mitigation') return 'Temporary mitigation applied';
  if(status==='restore') return 'Full restoration in progress';
  if(status==='none') return 'No action yet';
  return '';
}

function latestCommEntry(type){
  if(!Array.isArray(commLog)) return null;
  return commLog.find(entry=>entry && entry.type === type && entry.ts);
}

function formatCommTimestamp(ts){
  if(!ts) return '';
  const d = new Date(ts);
  if(Number.isNaN(d.valueOf())) return ts;
  return d.toISOString();
}

function formatCommSummaryLine(type, label){
  const entry = latestCommEntry(type);
  if(!entry) return '';
  const ts = formatCommTimestamp(entry.ts);
  return ts ? `${label}: ${ts}` : '';
}

function nextUpdateSummaryLine(){
  if(commNextDueIso){
    const d = new Date(commNextDueIso);
    if(!Number.isNaN(d.valueOf())){
      return `Next Update: ${d.toISOString()}`;
    }
    return `Next Update: ${commNextDueIso}`;
  }
  if(commNextUpdateTime?.value){
    return `Next Update: ${commNextUpdateTime.value}`;
  }
  return '';
}

function causeProgressSummary(cause){
  const eligibleIndexes = evidencePairIndexes();
  const total = eligibleIndexes.length;
  if(total === 0) return 'No KT evidence pairs captured yet';
  const answered = countCompletedEvidence(cause, eligibleIndexes);
  if(causeHasFailure(cause)){
    return `${answered}/${total} evidence checks • Failed on at least one check`;
  }
  return `${answered}/${total} evidence checks complete`;
}

function formatCauseFindingsSummary(cause){
  if(!cause || !cause.findings) return '';
  const eligibleIndexes = evidencePairIndexes();
  if(!eligibleIndexes.length) return '';
  const sections = [];
  eligibleIndexes.forEach(index=>{
    const row = rowsBuilt[index];
    const key = getRowKeyByIndex(index);
    const entry = peekCauseFinding(cause, key);
    if(!entry) return;
    const mode = findingMode(entry);
    const note = findingNote(entry);
    if(!mode && !note.trim()) return;
    const label = row?.th?.textContent?.trim() || fillTokens(row?.def?.q || `Row ${index+1}`);
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

function formatPossibleCausesSummary(){
  if(!possibleCauses.length){
    return 'No possible causes captured.';
  }
  const blocks = possibleCauses.map((cause, index)=>{
    const header = `• Possible Cause ${index+1}: ${buildHypothesisSentence(cause)}`;
    const status = `  Status: ${causeStatusLabel(cause)}`;
    const progress = `  Progress: ${causeProgressSummary(cause)}`;
    const failureLine = causeHasFailure(cause) ? '  Result: Failed testing on at least one evidence check' : '';
    const assumptionCount = countCauseAssumptions(cause);
    const assumptionLine = assumptionCount ? `  Assumptions noted: ${assumptionCount}` : '';
    const evidence = formatCauseFindingsSummary(cause);
    return [header, status, progress, failureLine, assumptionLine, evidence].filter(Boolean).join('\n');
  });
  return blocks.join('\n\n');
}

function formatStepsSummary(){
  if(!Array.isArray(stepsItems) || !stepsItems.length) return '';
  const { total, completed } = getStepsCounts();
  const lines = [`Completed: ${completed}/${total}`];
  const open = stepsItems.filter(step=>!step.checked);
  if(open.length){
    lines.push('Open Items:');
    open.forEach(step=>{
      lines.push(`  • Step ${step.id} — ${step.label}`);
    });
  }
  return lines.join('\n');
}

/* ---------- Executive summary builder ---------- */
/**
 * Compiles the human-readable incident summary using current field values.
 * Respects section order shown in the UI so ServiceNow output matches the
 * facilitator workflow. See README.md and ktintake.AGENTS.md for formatting
 * expectations when extending the output.
 */
function buildSummaryText(){
  const title = document.getElementById('docTitle').textContent.trim();
  const subtitle = document.getElementById('docSubtitle').textContent.trim();

  const detectionSummary = formatChipsetSelections([
    {el: detectMonitoring, label: 'Monitoring'},
    {el: detectUserReport, label: 'User Report'},
    {el: detectAutomation, label: 'Automation'},
    {el: detectOther, label: 'Other'}
  ]);

  const evidenceSummary = formatChipsetSelections([
    {el: evScreenshot, label: 'Screenshot'},
    {el: evLogs, label: 'Logs'},
    {el: evMetrics, label: 'Metrics'},
    {el: evRepro, label: 'Repro'},
    {el: evOther, label: 'Other'}
  ]);

  // === Preface (inline answers) ===
  const prefaceLines = [
    summaryBullet('One-line', oneLine.value),
    summaryBullet('Evidence/Proof', proof.value),
    summaryBullet('Specific Object', objectPrefill.value || (objectIS?.value||'')),
    summaryBullet('Healthy Baseline', healthy.value),
    summaryBullet('Current State (What is happening now?)', now.value),
    summaryBulletRaw('Detection Source', detectionSummary),
    summaryBulletRaw('Evidence Collected', evidenceSummary)
  ];
  const preface = joinSummaryLines(prefaceLines);

  // === Impact (inline answers) ===
  const impactLines = [
    summaryLine('Current Impact', impactNow.value),
    summaryLine('Future Impact', impactFuture.value),
    summaryLine('Timeframe', impactTime.value)
  ];
  const imp = joinSummaryLines(impactLines);

  const containmentLines = [
    summaryLineRaw('Status', containmentStatusText()),
    summaryLine('Description', containDesc?.value)
  ];
  const containment = joinSummaryLines(containmentLines);

  const communications = joinSummaryLines([
    formatCommSummaryLine('internal', 'Last Internal Update'),
    formatCommSummaryLine('external', 'Last External Update'),
    nextUpdateSummaryLine()
  ]);

  // === KT Table as chat-friendly blocks per question ===
  const rowsOut = [];
  let pendingBand = '';

  [...tbody.querySelectorAll('tr')].forEach(tr=>{
    if(tr.classList.contains('band')){
      pendingBand = `== ${tr.textContent.trim()} ==`;
      return;
    }
    const q = tr.querySelector('th').textContent.trim();
    const t = tr.querySelectorAll('textarea');
    const isLines = splitLines(t[0].value);
    const notLines = splitLines(t[1].value);
    const distLines = splitLines(t[2].value);
    const changeLines = splitLines(t[3].value);

    // Question header
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
    sections.forEach(section=>rowsOut.push(section));
  });

  const ktOut = rowsOut.filter(line=>line && line.trim().length).join('\n\n');

  // === Compose (minimal blank lines between major sections) ===
  const sectionsOut = [];
  if(title.trim()){ sectionsOut.push(title.trim()); }
  if(subtitle.trim()){ sectionsOut.push(subtitle.trim()); }
  function pushSection(label, body){
    const content = (body||'').trim();
    if(!content) return;
    if(sectionsOut.length){ sectionsOut.push(''); }
    sectionsOut.push(label);
    sectionsOut.push(content);
  }

  const bridgeLines = [
    summaryLineRaw('Bridge Opened (UTC)', bridgeOpenedUtc?.value),
    summaryLineRaw('Incident Commander', icName?.value),
    summaryLineRaw('Bridge Coordinator', bcName?.value),
    summaryLineRaw('SEM/Ops Lead', semOpsName?.value),
    summaryLineRaw('Severity', severity?.value)
  ];
  const bridge = joinSummaryLines(bridgeLines);

  pushSection('— Bridge Activation —', bridge);
  pushSection('— Preface —', preface);
  pushSection('— Containment —', containment);
  pushSection('— Impact —', imp);
  pushSection('— Communications —', communications);
  const stepsSummary = formatStepsSummary();
  if(stepsSummary.trim().length){
    pushSection('— Steps Checklist —', stepsSummary);
  }
  const causes = formatPossibleCausesSummary();
  if(causes.trim().length){
    pushSection('— Possible Causes —', causes);
  }
  if(ktOut.trim().length){
    pushSection('— KT IS / IS NOT —', ktOut);
  }

  return sectionsOut.join('\n');
}



const PROMPT_PREAMBLE = `You are ChatGPT acting as an incident communications specialist.
Following NIST SP 800-61, ISO/IEC 27035, and ITIL major incident best practices, craft two communication log entries:
one for internal stakeholders and one for external customers.
Each entry should include recommended tone, key talking points, risk framing, and next steps.
Use the incident context below to tailor the guidance.`;

/**
 * Unified summary generator. Builds summary text (standard or AI prompt),
 * attempts to copy it to the clipboard, and updates the on-page summary card
 * for manual fallback. See README.md and ktintake.AGENTS.md for workflow context.
 * @param {string} kind   - e.g., "summary" (reserved for extensibility)
 * @param {string} aiType - descriptive label used for AI prompt variants.
 */
async function generateSummary(kind='summary', aiType=''){
  void kind; // reserved for future use

  const baseText = buildSummaryText();

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
    if(window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(output);
      if(typeof showToast==='function'){ showToast('Summary updated & copied. It’s also shown below.'); }
    }else{
      if(typeof showToast==='function'){ showToast('Summary updated. Clipboard blocked — copy it from the bottom.'); }
    }
  }catch(_){
    if(typeof showToast==='function'){ showToast('Summary updated. Clipboard blocked — copy it from the bottom.'); }
  }
}

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
const STORAGE_KEY='kt-intake-full-v2';
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
               causes: serializeCauses(),
               steps: exportStepsState() };
  [...tbody.querySelectorAll('tr')].forEach(tr=>{
    if(tr.classList.contains('band')){ data.table.push({band: tr.textContent.trim()}); return; }
    const t=tr.querySelectorAll('textarea');
    data.table.push({q: tr.querySelector('th').textContent.trim(), is:t[0].value, no:t[1].value, di:t[2].value, ch:t[3].value});
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
/**
 * Restores persisted state from localStorage and rehydrates form controls,
 * KT table, possible causes, and the steps drawer. Keep schema changes in sync
 * with saveToStorage() and document new keys in README/AGENTS.
 */
function restoreFromStorage(){
  const raw = localStorage.getItem(STORAGE_KEY); if(!raw) return;
  const data = JSON.parse(raw);
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
