/**
 * Unit coverage for the local Classroom join QR renderer.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
  CLASSROOM_JOIN_QR_PROFILE,
  classroomJoinQrSvgGeometry,
  createClassroomJoinQrMatrix,
  renderClassroomJoinQr
} from '../src/classroomJoinQr.js';

const SAFE_URL = 'https://intake.test/#join=K7FMP4Q2';

function finderSignature(matrix, originX, originY) {
  return Array.from({ length: 7 }, (_, y) =>
    Array.from({ length: 7 }, (_, x) => matrix[originY + y][originX + x] ? '1' : '0').join('')
  );
}

test('Classroom join QR uses the documented fixed Version 5-L profile', () => {
  assert.deepEqual(CLASSROOM_JOIN_QR_PROFILE, {
    version: 5,
    size: 37,
    errorCorrection: 'L',
    maxBytePayload: 106,
    dataCodewords: 108,
    errorCodewords: 26,
    remainderBits: 7
  });

  const matrix = createClassroomJoinQrMatrix(SAFE_URL);
  assert.equal(matrix.length, 37);
  assert.equal(matrix.every(row => row.length === 37), true);

  const expectedFinder = [
    '1111111',
    '1000001',
    '1011101',
    '1011101',
    '1011101',
    '1000001',
    '1111111'
  ];
  assert.deepEqual(finderSignature(matrix, 0, 0), expectedFinder);
  assert.deepEqual(finderSignature(matrix, 30, 0), expectedFinder);
  assert.deepEqual(finderSignature(matrix, 0, 30), expectedFinder);

  assert.equal(matrix[30][30], true, 'Version 5 alignment pattern center is dark');
  assert.equal(matrix[29][30], false, 'Alignment pattern inner ring is light');
  assert.equal(matrix[28][30], true, 'Alignment pattern outer ring is dark');
  assert.equal(matrix[29][8], true, 'Fixed dark module is present');
});

test('Classroom join QR accepts the full Version 5-L byte payload and fails closed above it', () => {
  assert.doesNotThrow(() => createClassroomJoinQrMatrix('A'.repeat(106)));
  assert.throws(
    () => createClassroomJoinQrMatrix('A'.repeat(107)),
    /supports at most 106/u
  );
});

test('Classroom join QR is deterministic and SVG geometry contains only local vector modules', () => {
  const first = createClassroomJoinQrMatrix(SAFE_URL);
  const second = createClassroomJoinQrMatrix(SAFE_URL);
  assert.deepEqual(first, second);

  const geometry = classroomJoinQrSvgGeometry(first);
  assert.equal(geometry.viewBox, '0 0 45 45');
  assert.equal(geometry.size, 45);
  assert.equal(geometry.path.startsWith('M'), true);
  assert.equal(geometry.path.includes('http'), false);
  assert.equal(geometry.path.includes(SAFE_URL), false);
});

test('rendering QR writes only local SVG rect/path content with an accessible label', () => {
  const dom = new JSDOM('<svg id="qr"></svg>');
  const svg = dom.window.document.getElementById('qr');

  assert.equal(
    renderClassroomJoinQr(svg, SAFE_URL, { label: 'Scan to join K7FM-P4Q2' }),
    true
  );

  assert.equal(svg.getAttribute('role'), 'img');
  assert.equal(svg.getAttribute('aria-label'), 'Scan to join K7FM-P4Q2');
  assert.equal(svg.getAttribute('viewBox'), '0 0 45 45');
  assert.equal(svg.querySelectorAll('rect').length, 1);
  assert.equal(svg.querySelectorAll('path').length, 1);
  assert.equal(svg.outerHTML.includes(SAFE_URL), false);
  assert.equal(svg.outerHTML.includes('workspace='), false);
});
