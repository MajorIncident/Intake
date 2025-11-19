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

test('strips leading conjunctions before building impact clauses', async () => {
  const sentenceBuilder = await loadKtModule();
  const result = sentenceBuilder({
    suspect: 'Employees',
    accusation: 'Using incorrect hand cream',
    impact: 'and leaving gaps on paint'
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
  assert.equal(result, 'We suspect Payment service that is experiencing timeouts under load. This could lead to declined transactions for EU customers.');
});

test('falls back to placeholders when suspect or impact are missing', async () => {
  const sentenceBuilder = await loadKtModule();
  const result = sentenceBuilder({
    suspect: '',
    accusation: 'configuration drift on the gateway',
    impact: ''
  });
  assert.equal(result, 'Add suspect to complete this hypothesis.');
});

test('uses relative clauses when accusations start with verbs', async () => {
  const sentenceBuilder = await loadKtModule();
  const result = sentenceBuilder({
    suspect: 'Auth service',
    accusation: 'is rebooting repeatedly',
    impact: ''
  });
  assert.equal(result, 'We suspect Auth service that is rebooting repeatedly. Describe the impact to explain the customer effect.');
});

test('adds pronouns when accusations rely on standalone verbs', async () => {
  const sentenceBuilder = await loadKtModule();
  const result = sentenceBuilder({
    suspect: 'API gateway',
    accusation: 'fails to retry requests',
    impact: 'users unable to check out'
  });
  assert.equal(result, 'We suspect API gateway because it fails to retry requests. This could lead to users unable to check out.');
});

test('drops impact sentence when only filler impact text is provided', async () => {
  const sentenceBuilder = await loadKtModule();
  const result = sentenceBuilder({
    suspect: 'Batch processor',
    accusation: 'is skipping jobs unexpectedly',
    impact: 'n/a'
  });
  assert.equal(result, 'We suspect Batch processor that is skipping jobs unexpectedly. Describe the impact to explain the customer effect.');
});
