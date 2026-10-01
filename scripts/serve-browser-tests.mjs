#!/usr/bin/env node
/**
 * @fileoverview Deterministic local HTTP target for Playwright browser tests.
 *
 * The server intentionally mirrors Intake's public deployment boundary instead
 * of exposing the repository root. Browser assets are served; authored template
 * JSON, API source, tests, scripts, and repository documentation are not.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HOST = process.env.BROWSER_TEST_HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.BROWSER_TEST_PORT || '4173', 10);
const ROOT_FILES = new Set(['index.html', 'main.js', 'styles.css']);
const PUBLIC_DIRECTORIES = new Set(['src', 'components']);
const PUBLIC_DOCS = new Set(['docs/eula.md']);

const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml'
});

/**
 * Resolve one request path against the intentional public test surface.
 *
 * @param {string} pathname URL pathname.
 * @returns {string|null} Absolute public file path or null when blocked.
 */
function publicFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  if (!relative || relative.includes('\0')) return null;

  const normalized = relative.replaceAll('\\', '/');
  const firstSegment = normalized.split('/')[0];
  const allowed = ROOT_FILES.has(normalized)
    || PUBLIC_DOCS.has(normalized)
    || PUBLIC_DIRECTORIES.has(firstSegment);
  if (!allowed) return null;

  const absolute = resolve(ROOT, normalized);
  const rootPrefix = ROOT.endsWith(sep) ? ROOT : ROOT + sep;
  return absolute === ROOT || absolute.startsWith(rootPrefix) ? absolute : null;
}

/**
 * Send a small text response.
 *
 * @param {import('node:http').ServerResponse} response HTTP response.
 * @param {number} status Status code.
 * @param {string} body Response body.
 * @returns {void}
 */
function sendText(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8'
  });
  response.end(body);
}

/**
 * Handle one browser-test HTTP request.
 *
 * @param {import('node:http').IncomingMessage} request HTTP request.
 * @param {import('node:http').ServerResponse} response HTTP response.
 * @returns {Promise<void>} Resolves after the response is sent.
 */
async function handleRequest(request, response) {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    sendText(response, 405, 'Method not allowed');
    return;
  }

  const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
  if (url.pathname === '/healthz') {
    sendText(response, 200, 'ok');
    return;
  }

  const filePath = publicFile(url.pathname);
  if (!filePath) {
    sendText(response, 404, 'Not found');
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': CONTENT_TYPES[extname(filePath)] || 'application/octet-stream'
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') {
      sendText(response, 404, 'Not found');
      return;
    }
    console.error('[browser-test-server] request failed', error);
    sendText(response, 500, 'Internal server error');
  }
}

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`[browser-test-server] http://${HOST}:${PORT}`);
});
