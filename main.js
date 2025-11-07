// Main JavaScript for KT Intake – extracted from inline script in ktintake.html

/* [rows] start */
/* =================== Core data & prompts (KT Problem Analysis) =================== */
/* Use {OBJECT} / {DEVIATION} tokens anywhere you want auto-fill. These are protected
   datasets—see README.md and AGENTS.md for change control expectations. */
import {
  configureKT,
  initTable,
  ensurePossibleCausesUI,
  renderCauses,
  refreshAllTokenizedText,
  updateCauseEvidencePreviews,
  focusFirstEditableCause,
  getPossibleCauses,
  setPossibleCauses,
  getRowsBuilt,
  evidencePairIndexes,
  countCompletedEvidence,
  causeStatusLabel,
  causeHasFailure,
  countCauseAssumptions,
  getRowKeyByIndex,
  peekCauseFinding,
  findingMode,
  findingNote,
  fillTokens,
  getObjectISField,
  getDeviationISField,
  isObjectISDirty,
  isDeviationISDirty,
  buildHypothesisSentence
} from './src/kt.js';
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
/* Table rendering & hypothesis helpers now live in src/kt.js; this file retains
   the tbody reference for persistence routines. */
const tbody = document.getElementById('tbody');
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

let commLog = [];
let commCadence = '';
let commNextDueIso = '';
let cadenceTimerId = null;
let dueToastShown = false;
let commShowAll = false;

[oneLine, proof, objectPrefill, healthy, now].forEach(el=>{
  el.addEventListener('input', ()=>{
    // If the table fields are empty, seed them from preface
    const objectIS = getObjectISField();
    const deviationIS = getDeviationISField();
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
function compactOneLine(str, max=90){
  const s = (str||'').trim().replace(/\s+/g,' ');
  return s.length>max ? s.slice(0,max-1)+'…' : s;
}
function getObjectFull(){
  const objectIS = getObjectISField();
  return (objectPrefill.value || objectIS?.value || '').trim();
}
function getDeviationFull(){
  // Treat "What is happening now?" as the deviation for the problem statement.
  const deviationIS = getDeviationISField();
  return (now.value || deviationIS?.value || '').trim();
}
function objectAnchor(){
  // Use a compact anchor for labels (not the full paragraph to keep labels readable)
  const src = getObjectFull() || 'the object';
  return compactOneLine(src, 80);
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
      const objectIS = getObjectISField();
      if(objectIS && !isObjectISDirty()){
        if(objectIS.value !== curObj){
          objectIS.value = curObj;
          autoResize(objectIS);
          changed = true;
        }
      }
    }
    if(force || curNow !== _lastPrefNow){
      _lastPrefNow = curNow;
      const deviationIS = getDeviationISField();
      if(deviationIS && !isDeviationISDirty()){
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
  configureKT({
    autoResize,
    onSave: saveToStorage,
    showToast,
    onTokensChange: updateTitlesAndLabels,
    getObjectFull,
    getDeviationFull
  });
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
    objectIS: getObjectISField(),
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
    possibleCauses: getPossibleCauses(),
    buildHypothesisSentence,
    causeStatusLabel,
    causeHasFailure,
    countCauseAssumptions,
    evidencePairIndexes,
    countCompletedEvidence,
    getRowKeyByIndex,
    rowsBuilt: getRowsBuilt(),
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
               causes: serializeCauses(getPossibleCauses()),
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
    const objectIS = getObjectISField();
    if(objectPrefill.value && objectIS && !objectIS.value) { objectIS.value=objectPrefill.value; autoResize(objectIS); }
    const deviationIS = getDeviationISField();
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
    setPossibleCauses(deserializeCauses(data.causes));
  }else{
    setPossibleCauses([]);
  }
  ensurePossibleCausesUI();
  renderCauses();
  const causes = getPossibleCauses();
  if(causes.some(cause=>cause && cause.editing)){
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
