/**
 * #316 protected staged-asset registry validation: shape, byte-sniffed media
 * types, and staged block references all fail the build closed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PROTECTED_ASSET_MAX_BYTES,
  detectProtectedAssetMediaType,
  validateProtectedAssetBytes,
  validateProtectedAssetRegistry,
  validateSimulationAssetReferences
} from '../scripts/protected-assets-schema.mjs';
import { PROTECTED_ASSET_MANIFEST } from '../api/_protected-assets.manifest.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
const WEBP = Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

test('media types are sniffed from bytes and only PNG, JPEG, and WebP are accepted', () => {
  assert.equal(detectProtectedAssetMediaType(PNG), 'image/png');
  assert.equal(detectProtectedAssetMediaType(JPEG), 'image/jpeg');
  assert.equal(detectProtectedAssetMediaType(WEBP), 'image/webp');
  assert.equal(detectProtectedAssetMediaType(SVG), null, 'SVG can carry script');
  const errors = [];
  assert.equal(validateProtectedAssetBytes(SVG, 'svg', errors), null);
  assert.equal(validateProtectedAssetBytes(Buffer.alloc(PROTECTED_ASSET_MAX_BYTES + 1, 0x89), 'huge', errors), null);
  assert.equal(validateProtectedAssetBytes(Buffer.alloc(0), 'empty', errors), null);
  assert.equal(errors.length, 3);
});

test('registry shape is strict and normalized', () => {
  assert.deepEqual(validateProtectedAssetRegistry(undefined), { errors: [], assets: [] });
  const ok = validateProtectedAssetRegistry({
    assets: [
      { id: 'cabinet-photo', kind: 'image', file: 'cabinet.png' },
      { id: 'report', kind: 'document', pages: [{ page: 2, file: 'report-2.png' }, { page: 1, file: 'report-1.png' }] }
    ]
  });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.assets[1].pages.map(page => page.page), [1, 2]);

  const bad = validateProtectedAssetRegistry({
    extra: true,
    assets: [
      { id: 'Bad Id', kind: 'image', file: 'x.png' },
      { id: 'dupe', kind: 'image', file: '../secret.png' },
      { id: 'dupe', kind: 'image', file: 'ok.png', url: 'https://example.test' },
      { id: 'svg-ish', kind: 'vector', file: 'x.svg' },
      { id: 'doc', kind: 'document', pages: [{ page: 0, file: 'p.png' }, { page: 1, file: 'p.png' }, { page: 1, file: 'q.png' }] }
    ]
  });
  const text = bad.errors.join('\n');
  assert.match(text, /registry\.extra is not allowed/);
  assert.match(text, /assets\[0\]\.id must be a stable lowercase slug/);
  assert.match(text, /assets\[1\]\.file must be a plain file name/);
  assert.match(text, /assets\[2\]\.id duplicates dupe/);
  assert.match(text, /assets\[2\]\.url is not allowed/);
  assert.match(text, /assets\[3\]\.kind must be one of: image, document/);
  assert.match(text, /pages\[0\]\.page must be a positive integer/);
  assert.match(text, /pages\[2\]\.page duplicates page 1/);
});

test('every staged image and document-page block must resolve to a registry entry of the right kind and page', () => {
  const assets = [
    { id: 'photo', kind: 'image', file: 'photo.png' },
    { id: 'report', kind: 'document', pages: [{ page: 1, file: 'r1.png' }] }
  ];
  const caseStudies = [{
    id: 'case',
    simulation: {
      studentContent: [
        { id: 'ok-image', kind: 'image', assetId: 'photo' },
        { id: 'ok-page', kind: 'document-page', assetId: 'report', page: 1 },
        { id: 'missing', kind: 'image', assetId: 'nope' },
        { id: 'wrong-kind', kind: 'image', assetId: 'report' },
        { id: 'page-of-image', kind: 'document-page', assetId: 'photo', page: 1 },
        { id: 'missing-page', kind: 'document-page', assetId: 'report', page: 4 },
        { id: 'text', kind: 'narrative', body: 'x' }
      ]
    }
  }];
  const errors = validateSimulationAssetReferences(caseStudies, assets);
  assert.deepEqual(errors, [
    'case studentContent missing references unknown protected asset nope',
    'case studentContent wrong-kind is an image but report is a document',
    'case studentContent page-of-image is a document page but photo is a image',
    'case studentContent missing-page references missing page 4 of report'
  ]);
});

test('the committed server-only asset manifest is generated and frozen', () => {
  assert.ok(Array.isArray(PROTECTED_ASSET_MANIFEST));
  assert.equal(Object.isFrozen(PROTECTED_ASSET_MANIFEST), true);
});
