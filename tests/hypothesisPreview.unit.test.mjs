import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

process.env.TEST_BYPASS_STUBS = 'kt';
globalThis.__testBypassStubs = new Set(['kt']);

let composeHypothesisSummary;

async function loadKtModule(){
  if(composeHypothesisSummary){
    return composeHypothesisSummary;
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
  composeHypothesisSummary = module.composeHypothesisSummary;
  return composeHypothesisSummary;
}

test('omits impact preview sentence when no impact is provided', async () => {
  const summaryComposer = await loadKtModule();
  const result = summaryComposer({
    suspect: 'Payment service',
    accusation: 'timeouts under load',
    impact: ''
  }, { preview: true });
  assert.equal(result, 'We suspect Payment service because of a deviation involving timeouts under load.');
});

test('uses verb connectors for accusation and impact preview clauses', async () => {
  const summaryComposer = await loadKtModule();
  const result = summaryComposer({
    suspect: 'QA deploy',
    accusation: 'failing to restart nodes',
    impact: 'breaching SLAs'
  }, { preview: true });
  assert.equal(result, 'We suspect QA deploy because they are failing to restart nodes. This could result in breaching SLAs.');
});

test('drops leading conjunctions from impact preview sentences', async () => {
  const summaryComposer = await loadKtModule();
  const result = summaryComposer({
    suspect: 'QA deploy',
    accusation: 'failing to restart nodes',
    impact: 'and breaching SLAs'
  }, { preview: true });
  assert.equal(result, 'We suspect QA deploy because they are failing to restart nodes. This could result in breaching SLAs.');
});

test('adds an explicit subject to copula-led accusations', async () => {
  const summaryComposer = await loadKtModule();
  const result = summaryComposer({
    suspect: 'Cooling fan',
    accusation: 'is overheating',
    impact: ''
  }, { preview: true });
  assert.equal(result, 'We suspect Cooling fan because it is overheating.');
});

test('uses noun connectors for accusation and impact preview clauses', async () => {
  const summaryComposer = await loadKtModule();
  const result = summaryComposer({
    suspect: 'Cache layer',
    accusation: 'overdue firmware upgrades',
    impact: 'downtime for EU shoppers'
  }, { preview: true });
  assert.equal(result, 'We suspect Cache layer because of a deviation involving overdue firmware upgrades. This could lead to downtime for EU shoppers.');
});
