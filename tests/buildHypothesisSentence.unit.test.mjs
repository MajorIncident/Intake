import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

process.env.TEST_BYPASS_STUBS = 'kt';
globalThis.__testBypassStubs = new Set(['kt']);

let buildHypothesisSentence;

async function loadKtModule(){
  if(buildHypothesisSentence){
    return buildHypothesisSentence;
  }
  const dom = new JSDOM(`
    <table><tbody id="tbody"></tbody></table>
    <div id="causeList"></div>
    <button id="addCauseBtn"></button>
  `);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  const module = await import('../src/kt.js?actual');
  buildHypothesisSentence = module.buildHypothesisSentence;
  return buildHypothesisSentence;
}

test('returns prompt when all hypothesis fields are empty', async () => {
  const sentenceBuilder = await loadKtModule();
  const result = sentenceBuilder({ suspect: '', accusation: '', impact: '' });
  assert.equal(result, 'Add suspect, accusation, and impact to craft a strong hypothesis.');
});

test('smoothly handles gerunds for accusation and impact', async () => {
  const sentenceBuilder = await loadKtModule();
  const result = sentenceBuilder({
    suspect: 'Employees',
    accusation: 'Using incorrect hand cream',
    impact: 'Leaving gaps on paint'
  });
  assert.equal(result, 'We suspect Employees because they are using incorrect hand cream. This results in leaving gaps on paint.');
});

test('wraps noun-based accusations and impacts in neutral phrasing', async () => {
  const sentenceBuilder = await loadKtModule();
  const result = sentenceBuilder({
    suspect: 'Payment service',
    accusation: 'timeouts under load',
    impact: 'declined transactions for EU customers'
  });
  assert.equal(result, 'We suspect Payment service because a deviation involving timeouts under load. This results in declined transactions for EU customers.');
});

test('falls back to placeholders when suspect or impact are missing', async () => {
  const sentenceBuilder = await loadKtModule();
  const result = sentenceBuilder({
    suspect: '',
    accusation: 'configuration drift on the gateway',
    impact: ''
  });
  assert.equal(result, 'We suspect … because a deviation involving configuration drift on the gateway. This results in ….');
});
