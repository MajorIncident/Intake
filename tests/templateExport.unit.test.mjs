import assert from 'node:assert/strict';
import { test } from 'node:test';

import { exportCurrentStateAsTemplate } from '../src/templateExport.js';
import { TEMPLATE_MODE_IDS } from '../src/templateModes.js';
import { TEMPLATE_KINDS } from '../src/templateKinds.js';

function createStubs() {
  const blobs = [];
  class FakeBlob {
    constructor(chunks, options) {
      this.chunks = chunks;
      this.options = options;
      blobs.push(this);
    }
  }
  const link = {
    clickCalled: false,
    href: '',
    download: '',
    rel: '',
    click() {
      this.clickCalled = true;
    }
  };
  const documentRef = {
    createElement(tag) {
      if (tag === 'a') {
        return link;
      }
      throw new Error(`Unsupported element: ${tag}`);
    },
    createEvent() {
      return { initEvent() {} };
    }
  };
  const urlRef = {
    created: [],
    revoked: [],
    createObjectURL(blob) {
      this.created.push(blob);
      return 'blob:mock';
    },
    revokeObjectURL(url) {
      this.revoked.push(url);
    }
  };
  return { FakeBlob, blobs, link, documentRef, urlRef };
}

test('exportCurrentStateAsTemplate emits standard template payloads without extra modes', () => {
  const { FakeBlob, blobs, link, documentRef, urlRef } = createStubs();
  const result = exportCurrentStateAsTemplate({
    name: 'My Template',
    description: 'Created from current intake.',
    templateKind: TEMPLATE_KINDS.STANDARD,
    collect: () => ({ meta: { version: 1, savedAt: null } }),
    BlobCtor: FakeBlob,
    documentRef,
    urlRef,
    now: () => new Date('2024-01-01T00:00:00Z')
  });
  assert.equal(result.success, true);
  assert.ok(link.clickCalled, 'download link should be triggered');
  assert.equal(link.download, 'kt-template-my-template-2024-01-01T00-00-00.000Z.json');
  assert.equal(blobs.length, 1);
  const payload = JSON.parse(blobs[0].chunks.join(''));
  assert.equal(payload.templateKind, TEMPLATE_KINDS.STANDARD);
  assert.deepEqual(payload.supportedModes, [TEMPLATE_MODE_IDS.FULL]);
});

test('case study template exports include every supported mode', () => {
  const { FakeBlob, blobs, link, documentRef, urlRef } = createStubs();
  const state = { meta: { version: 1, savedAt: null }, pre: {}, impact: {}, ops: {}, table: [], causes: [], steps: {}, actions: {} };
  const result = exportCurrentStateAsTemplate({
    name: 'Case Study',
    description: 'Password protected template.',
    templateKind: TEMPLATE_KINDS.CASE_STUDY,
    collect: () => state,
    BlobCtor: FakeBlob,
    documentRef,
    urlRef
  });
  assert.equal(result.success, true);
  const payload = JSON.parse(blobs[0].chunks.join(''));
  assert.equal(payload.templateKind, TEMPLATE_KINDS.CASE_STUDY);
  assert.deepEqual(payload.supportedModes, Object.values(TEMPLATE_MODE_IDS));
});

test('exportCurrentStateAsTemplate returns an error when required metadata is missing', () => {
  const { FakeBlob, documentRef, urlRef } = createStubs();
  const result = exportCurrentStateAsTemplate({
    name: '',
    description: '',
    templateKind: TEMPLATE_KINDS.CASE_STUDY,
    collect: () => ({}),
    BlobCtor: FakeBlob,
    documentRef,
    urlRef
  });
  assert.equal(result.success, false);
  assert.equal(result.message, 'Unable to export the template.');
});
