/**
 * @module classroomJoinQr
 * @summary Renders a local QR Code for the safe Classroom join URL.
 * @description
 *   This implementation intentionally supports one small, auditable profile:
 *   QR Model 2, Version 5, error-correction level L, byte mode, mask 0.
 *   Version 5-L carries up to 106 UTF-8 bytes in byte mode. The join-link
 *   builder remains the authority for the payload; this module never builds,
 *   persists, transmits, or logs Classroom credentials.
 */

const QR_VERSION = 5;
const QR_SIZE = 17 + (QR_VERSION * 4);
const DATA_CODEWORDS = 108;
const ERROR_CODEWORDS = 26;
const REMAINDER_BITS = 7;
const MAX_BYTE_PAYLOAD = 106;
const QUIET_ZONE = 4;
const FORMAT_EC_LEVEL_L = 0b01;
const FORMAT_MASK_PATTERN = 0;

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

{
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    GF_EXP[index] = value;
    GF_LOG[value] = index;
    value <<= 1;
    if ((value & 0x100) !== 0) value ^= 0x11d;
  }
  for (let index = 255; index < GF_EXP.length; index += 1) {
    GF_EXP[index] = GF_EXP[index - 255];
  }
}

function gfMultiply(left, right) {
  if (left === 0 || right === 0) return 0;
  return GF_EXP[GF_LOG[left] + GF_LOG[right]];
}

function reedSolomonGenerator(degree) {
  let polynomial = [1];
  for (let exponent = 0; exponent < degree; exponent += 1) {
    const root = GF_EXP[exponent];
    const next = new Array(polynomial.length + 1).fill(0);
    polynomial.forEach((coefficient, index) => {
      next[index] ^= coefficient;
      next[index + 1] ^= gfMultiply(coefficient, root);
    });
    polynomial = next;
  }
  return polynomial;
}

const ERROR_GENERATOR = reedSolomonGenerator(ERROR_CODEWORDS);

function reedSolomonRemainder(data) {
  const remainder = new Array(ERROR_CODEWORDS).fill(0);
  data.forEach(byte => {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let index = 0; index < ERROR_CODEWORDS; index += 1) {
      remainder[index] ^= gfMultiply(ERROR_GENERATOR[index + 1], factor);
    }
  });
  return remainder;
}

function appendBits(target, value, length) {
  for (let bit = length - 1; bit >= 0; bit -= 1) {
    target.push(((value >>> bit) & 1) !== 0);
  }
}

function encodeDataBytes(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  if (bytes.length > MAX_BYTE_PAYLOAD) {
    throw new RangeError(
      `Classroom join QR payload is ${bytes.length} bytes; Version 5-L supports at most ${MAX_BYTE_PAYLOAD}.`
    );
  }

  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  bytes.forEach(byte => appendBits(bits, byte, 8));

  const capacityBits = DATA_CODEWORDS * 8;
  const terminator = Math.min(4, capacityBits - bits.length);
  for (let index = 0; index < terminator; index += 1) bits.push(false);
  while ((bits.length % 8) !== 0) bits.push(false);

  const data = [];
  for (let offset = 0; offset < bits.length; offset += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      byte = (byte << 1) | (bits[offset + bit] ? 1 : 0);
    }
    data.push(byte);
  }

  const pads = [0xec, 0x11];
  while (data.length < DATA_CODEWORDS) {
    data.push(pads[(data.length - Math.ceil(bits.length / 8)) & 1]);
  }
  return data;
}

function createMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(false));
}

function setFunction(modules, functions, x, y, value) {
  if (x < 0 || y < 0 || x >= QR_SIZE || y >= QR_SIZE) return;
  modules[y][x] = Boolean(value);
  functions[y][x] = true;
}

function drawFinder(modules, functions, centerX, centerY) {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(
        modules,
        functions,
        centerX + dx,
        centerY + dy,
        distance !== 2 && distance !== 4
      );
    }
  }
}

function drawAlignment(modules, functions, centerX, centerY) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunction(
        modules,
        functions,
        centerX + dx,
        centerY + dy,
        Math.max(Math.abs(dx), Math.abs(dy)) !== 1
      );
    }
  }
}

function formatBits(maskPattern = FORMAT_MASK_PATTERN) {
  const data = (FORMAT_EC_LEVEL_L << 3) | maskPattern;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function drawFormat(modules, functions) {
  const bits = formatBits();

  for (let index = 0; index <= 5; index += 1) {
    setFunction(modules, functions, 8, index, (bits >>> index) & 1);
  }
  setFunction(modules, functions, 8, 7, (bits >>> 6) & 1);
  setFunction(modules, functions, 8, 8, (bits >>> 7) & 1);
  setFunction(modules, functions, 7, 8, (bits >>> 8) & 1);
  for (let index = 9; index < 15; index += 1) {
    setFunction(modules, functions, 14 - index, 8, (bits >>> index) & 1);
  }

  for (let index = 0; index < 8; index += 1) {
    setFunction(modules, functions, QR_SIZE - 1 - index, 8, (bits >>> index) & 1);
  }
  for (let index = 8; index < 15; index += 1) {
    setFunction(modules, functions, 8, QR_SIZE - 15 + index, (bits >>> index) & 1);
  }

  setFunction(modules, functions, 8, QR_SIZE - 8, true);
}

function drawFunctionPatterns(modules, functions) {
  for (let index = 0; index < QR_SIZE; index += 1) {
    setFunction(modules, functions, 6, index, (index % 2) === 0);
    setFunction(modules, functions, index, 6, (index % 2) === 0);
  }

  drawFinder(modules, functions, 3, 3);
  drawFinder(modules, functions, QR_SIZE - 4, 3);
  drawFinder(modules, functions, 3, QR_SIZE - 4);
  drawAlignment(modules, functions, 30, 30);
  drawFormat(modules, functions);
}

function finalMessageBits(text) {
  const data = encodeDataBytes(text);
  const errorCorrection = reedSolomonRemainder(data);
  const bits = [];
  [...data, ...errorCorrection].forEach(byte => appendBits(bits, byte, 8));
  for (let index = 0; index < REMAINDER_BITS; index += 1) bits.push(false);
  return bits;
}

function drawData(modules, functions, bits) {
  let bitIndex = 0;

  for (let right = QR_SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    const upward = (((right + 1) & 2) === 0);

    for (let vertical = 0; vertical < QR_SIZE; vertical += 1) {
      const y = upward ? QR_SIZE - 1 - vertical : vertical;
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        if (functions[y][x]) continue;

        const raw = bitIndex < bits.length ? bits[bitIndex] : false;
        const mask = ((x + y) % 2) === 0;
        modules[y][x] = raw !== mask;
        bitIndex += 1;
      }
    }
  }

  if (bitIndex !== bits.length) {
    throw new Error(`QR matrix consumed ${bitIndex} data bits; expected ${bits.length}.`);
  }
}

/**
 * Build a Version 5-L QR matrix for a join URL.
 *
 * @param {string} text Safe Classroom join URL.
 * @returns {boolean[][]} 37x37 QR module matrix.
 */
export function createClassroomJoinQrMatrix(text) {
  if (typeof text !== 'string' || !text) {
    throw new TypeError('Classroom join QR requires a non-empty URL.');
  }

  const modules = createMatrix(QR_SIZE);
  const functions = createMatrix(QR_SIZE);
  drawFunctionPatterns(modules, functions);
  drawData(modules, functions, finalMessageBits(text));
  return modules;
}

/**
 * Convert a QR matrix to one compact SVG path.
 *
 * @param {boolean[][]} matrix QR module matrix.
 * @param {number} [quietZone=QUIET_ZONE] White module border.
 * @returns {{path:string, viewBox:string, size:number}} SVG geometry.
 */
export function classroomJoinQrSvgGeometry(matrix, quietZone = QUIET_ZONE) {
  if (!Array.isArray(matrix) || matrix.length !== QR_SIZE) {
    throw new TypeError(`Classroom join QR matrix must be ${QR_SIZE}x${QR_SIZE}.`);
  }

  const commands = [];
  matrix.forEach((row, y) => {
    if (!Array.isArray(row) || row.length !== QR_SIZE) {
      throw new TypeError(`Classroom join QR matrix must be ${QR_SIZE}x${QR_SIZE}.`);
    }
    row.forEach((dark, x) => {
      if (dark) commands.push(`M${x + quietZone} ${y + quietZone}h1v1h-1z`);
    });
  });

  const size = QR_SIZE + (quietZone * 2);
  return {
    path: commands.join(''),
    viewBox: `0 0 ${size} ${size}`,
    size
  };
}

/**
 * Render the safe join URL into an existing SVG element.
 *
 * @param {SVGElement|null} svg SVG element.
 * @param {string} text Safe Classroom join URL.
 * @param {object} [options] Presentation options.
 * @param {string} [options.label='Scan to join this class'] Accessible label.
 * @returns {boolean} Whether rendering succeeded.
 */
export function renderClassroomJoinQr(svg, text, { label = 'Scan to join this class' } = {}) {
  if (!svg || typeof svg.setAttribute !== 'function') return false;

  const matrix = createClassroomJoinQrMatrix(text);
  const geometry = classroomJoinQrSvgGeometry(matrix);
  const namespace = 'http://www.w3.org/2000/svg';
  const documentRef = svg.ownerDocument;

  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute('viewBox', geometry.viewBox);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');

  const background = documentRef.createElementNS(namespace, 'rect');
  background.setAttribute('x', '0');
  background.setAttribute('y', '0');
  background.setAttribute('width', String(geometry.size));
  background.setAttribute('height', String(geometry.size));
  background.setAttribute('fill', '#fff');

  const modules = documentRef.createElementNS(namespace, 'path');
  modules.setAttribute('d', geometry.path);
  modules.setAttribute('fill', '#000');

  svg.append(background, modules);
  return true;
}

export const CLASSROOM_JOIN_QR_PROFILE = Object.freeze({
  version: QR_VERSION,
  size: QR_SIZE,
  errorCorrection: 'L',
  maxBytePayload: MAX_BYTE_PAYLOAD,
  dataCodewords: DATA_CODEWORDS,
  errorCodewords: ERROR_CODEWORDS,
  remainderBits: REMAINDER_BITS
});
