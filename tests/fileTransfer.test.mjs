/**
 * fileTransfer module behaviour tests.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { exportAppStateToFile, importAppStateFromFile } from '../src/fileTransfer.js';

test('fileTransfer: exportAppStateToFile packages state into a downloadable blob', () => {
  let collected = 0;
  const collect = () => {
    collected += 1;
    return { meta: { version: 1 }, pre: { oneLine: 'Example' } };
  };

  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
    }
  }

  let clicked = 0;
  const anchor = {
    href: '',
    download: '',
    rel: '',
    click() {
      clicked += 1;
    },
    dispatchEvent() {
      clicked += 1;
    }
  };

  const documentRef = {
    createElement(tag) {
      assert.equal(tag, 'a');
      return anchor;
    },
    createEvent() {
      return {
        initEvent() {},
        dispatchEvent() {}
      };
    }
  };

  let createdUrl = '';
  let revokedUrl = '';
  const urlRef = {
    createObjectURL(blob) {
      assert.ok(blob instanceof FakeBlob, 'uses provided Blob constructor');
      createdUrl = 'blob://test';
      return createdUrl;
    },
    revokeObjectURL(url) {
      revokedUrl = url;
    }
  };

  const now = () => new Date('2024-01-01T00:00:00.000Z');

  const result = exportAppStateToFile({ collect, BlobCtor: FakeBlob, documentRef, urlRef, now });

  assert.equal(collected, 1);
  assert.equal(createdUrl, 'blob://test');
  assert.equal(revokedUrl, 'blob://test');
  assert.equal(anchor.download, 'kt-intake-2024-01-01T00-00-00.000Z.json');
  assert.equal(anchor.rel, 'noopener');
  assert.ok(clicked >= 1, 'download anchor triggered');
  assert.deepEqual(result, { success: true, message: 'Download started for intake snapshot ✨' });
});

test('fileTransfer: importAppStateFromFile migrates, resets, and applies state', async () => {
  const file = new Blob(['{}'], { type: 'application/json' });
  let readerInstance = null;
  const createReader = () => {
    readerInstance = {
      result: null,
      onload: null,
      onerror: null,
      readAsText(target) {
        assert.strictEqual(target, file);
        setTimeout(() => {
          this.result = JSON.stringify({ meta: { version: 1 }, pre: { oneLine: 'Example' } });
          if (typeof this.onload === 'function') {
            this.onload({ target: this });
          }
        }, 0);
      }
    };
    return readerInstance;
  };

  const migratedState = { meta: { version: 1 }, pre: { oneLine: 'Example' } };
  let migrateInput = null;
  const migrate = raw => {
    migrateInput = raw;
    return migratedState;
  };

  let applyCalls = 0;
  let appliedArg = null;
  const apply = state => {
    applyCalls += 1;
    appliedArg = state;
  };

  let resetCalls = 0;
  const reset = () => {
    resetCalls += 1;
  };

  const result = await importAppStateFromFile(file, { createReader, migrate, apply, reset });

  assert.equal(resetCalls, 1, 'analysis id reset exactly once');
  assert.equal(applyCalls, 1, 'migrated state applied once');
  assert.strictEqual(appliedArg, migratedState, 'apply receives migrated payload');
  assert.deepEqual(migrateInput, JSON.parse(readerInstance.result), 'migration sees parsed JSON');
  assert.deepEqual(result, { success: true, message: 'Intake snapshot imported from file ✨' });
});
