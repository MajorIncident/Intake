const fs = require('fs');
const path = require('path');
const {JSDOM} = require('jsdom');

const PROMPT_PREAMBLE = `You are ChatGPT acting as an incident communications specialist.
Following NIST SP 800-61, ISO/IEC 27035, and ITIL major incident best practices, craft two communication log entries:
one for internal stakeholders and one for external customers.
Each entry should include recommended tone, key talking points, risk framing, and next steps.
Use the incident context below to tailor the guidance.`;

async function createDom(){
  const html = fs.readFileSync(path.join(__dirname, '..', 'ktintake.html'), 'utf8');
  const dom = new JSDOM(html.replace('init();', '/* init(); disabled during tests */'), {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'https://example.com'
  });

  if(typeof dom.window.init === 'function'){
    dom.window.init();
  }

  // Ensure listeners wired in DOMContentLoaded run.
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', {bubbles: true}));
  dom.window.showToast = jest.fn();

  const intervalId = dom.window.eval('typeof _mirrorTick !== "undefined" ? _mirrorTick : null');
  if(intervalId){
    dom.window.clearInterval(intervalId);
    dom.window.eval('_mirrorTick = null');
  }

  return dom;
}

function seedSampleData(window){
  const {document} = window;
  document.getElementById('oneLine').value = 'Major outage impacting EU region';
  document.getElementById('objectPrefill').value = 'Payments API';
  document.getElementById('proof').value = 'Error rate exceeds 40%';
  document.getElementById('now').value = 'Customers seeing checkout failures';
  document.getElementById('healthy').value = 'Transactions process normally';
  document.getElementById('impactNow').value = 'EU customers cannot complete purchases';
  document.getElementById('impactFuture').value = 'Global impact likely within 30 minutes';
  document.getElementById('impactTime').value = 'Estimated recovery within 45 minutes';
  document.getElementById('containDesc').value = 'Rollback in progress';

  const firstTableTextarea = document.querySelector('#ktTable tbody tr:not(.band) textarea');
  if(firstTableTextarea){
    firstTableTextarea.value = 'Payments API requests';
  }

  if(typeof window.syncMirror === 'function'){
    window.syncMirror(true);
  }
}

describe('summary generation flows', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Generate Summary copies the plain summary and updates the card', async () => {
    const dom = await createDom();
    const {window} = dom;
    seedSampleData(window);

    Object.defineProperty(window, 'isSecureContext', {value: true, configurable: true});
    const clipboardMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {value: {writeText: clipboardMock}, configurable: true});

    const summary = window.buildSummaryText();
    await window.onGenerateSummary();

    expect(clipboardMock).toHaveBeenCalledWith(summary);
    expect(window.document.getElementById('summaryPre').textContent).toBe(summary);

    dom.window.close();
  });

  test('AI prompt prepends the guidance preamble before copying', async () => {
    const dom = await createDom();
    const {window} = dom;
    seedSampleData(window);

    Object.defineProperty(window, 'isSecureContext', {value: true, configurable: true});
    const clipboardMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {value: {writeText: clipboardMock}, configurable: true});

    const summary = window.buildSummaryText();
    await window.onGenerateAIPrompt();

    const expected = `${PROMPT_PREAMBLE}\n\n${summary}`;
    expect(clipboardMock).toHaveBeenCalledWith(expected);
    expect(window.document.getElementById('summaryPre').textContent).toBe(expected);

    dom.window.close();
  });

  test('falls back to toast messaging when clipboard is unavailable', async () => {
    const dom = await createDom();
    const {window} = dom;
    seedSampleData(window);

    Object.defineProperty(window, 'isSecureContext', {value: false, configurable: true});
    delete window.navigator.clipboard;

    await window.onGenerateSummary();

    expect(window.showToast).toHaveBeenCalledWith('Summary updated. Clipboard blocked — copy it from the bottom.');
    expect(window.document.getElementById('summaryPre').textContent).toBe(window.buildSummaryText());

    dom.window.close();
  });
});
