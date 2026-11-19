/**
 * @module classroomCaseContent
 * @summary Sanitizes and renders released staged Case Study content blocks (#316).
 * @description
 *   Pure helpers shared by the Student case reference: narrative / prompt /
 *   evidence text, semantic tables, and protected images and document pages.
 *   Everything is built with DOM APIs and `textContent` — authored content is
 *   never parsed as HTML. Images and document pages render only from a caller
 *   supplied object URL obtained through an authorized fetch; this module never
 *   builds a network URL, so a protected asset location can never reach the DOM.
 *
 *   Exports: `sanitizeCaseContentBlock`, `caseContentAssetKey`,
 *   `renderCaseContentBlock`. Owns no anchors; it fills
 *   `#studentCaseReferenceContent` through its caller.
 */

const TEXT_KINDS = Object.freeze(['narrative', 'prompt', 'evidence']);
const ASSET_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const MAX_TABLE_COLUMNS = 20;
const MAX_TABLE_ROWS = 200;

function text(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * Keep only the approved fields of one released content block.
 * @param {unknown} content - Block from the Student exercise payload.
 * @returns {object|null} Sanitized block, or null when it cannot be shown safely.
 */
export function sanitizeCaseContentBlock(content) {
  if (!content || typeof content !== 'object') return null;
  const id = text(content.id).trim();
  const title = text(content.title).trim();
  const kind = text(content.kind);
  if (!id || !title) return null;

  if (kind === 'table') {
    const headers = Array.isArray(content.headers) ? content.headers.map(text) : [];
    const rows = Array.isArray(content.rows) ? content.rows : [];
    if (!headers.length || headers.length > MAX_TABLE_COLUMNS || !rows.length || rows.length > MAX_TABLE_ROWS) return null;
    if (rows.some(row => !Array.isArray(row) || row.length !== headers.length)) return null;
    return { id, kind, title, headers, rows: rows.map(row => row.map(text)) };
  }
  if (kind === 'image' || kind === 'document-page') {
    const assetId = text(content.assetId);
    const alt = text(content.alt).trim();
    if (!ASSET_ID_PATTERN.test(assetId) || !alt) return null;
    if (kind === 'image') return { id, kind, title, assetId, alt };
    if (!Number.isInteger(content.page) || content.page < 1) return null;
    return { id, kind, title, assetId, page: content.page, alt };
  }
  return { id, kind: TEXT_KINDS.includes(kind) ? kind : 'narrative', title, body: text(content.body) };
}

/**
 * Stable cache key for a block's protected asset representation.
 * @param {object} block - Sanitized block.
 * @returns {string} `assetId`, `assetId#page`, or '' for blocks without an asset.
 */
export function caseContentAssetKey(block) {
  if (block?.kind === 'image') return block.assetId;
  if (block?.kind === 'document-page') return `${block.assetId}#${block.page}`;
  return '';
}

function element(documentRef, tag, className, textValue) {
  const node = documentRef.createElement(tag);
  if (className) node.className = className;
  if (textValue !== undefined) node.textContent = textValue;
  return node;
}

function renderTable(documentRef, block) {
  const wrap = element(documentRef, 'div', 'student-case-reference__table-wrap');
  // A scrollable region must be keyboard-reachable and named.
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', block.title);
  const table = element(documentRef, 'table', 'student-case-reference__table');
  table.append(element(documentRef, 'caption', '', block.title));
  const head = element(documentRef, 'thead');
  const headRow = element(documentRef, 'tr');
  block.headers.forEach(header => {
    const cell = element(documentRef, 'th', '', header);
    cell.scope = 'col';
    headRow.append(cell);
  });
  head.append(headRow);
  const body = element(documentRef, 'tbody');
  block.rows.forEach(row => {
    const tr = element(documentRef, 'tr');
    row.forEach(value => tr.append(element(documentRef, 'td', '', value)));
    body.append(tr);
  });
  table.append(head, body);
  wrap.append(table);
  return wrap;
}

function renderAsset(documentRef, block, asset) {
  const figure = element(documentRef, 'figure', `student-case-reference__figure student-case-reference__figure--${block.kind}`);
  if (asset?.status === 'ready' && typeof asset.url === 'string') {
    const image = element(documentRef, 'img', 'student-case-reference__image');
    image.alt = block.alt;
    image.decoding = 'async';
    image.src = asset.url;
    figure.append(image);
  } else {
    figure.append(element(
      documentRef,
      'p',
      'student-case-reference__asset-status',
      asset?.status === 'error'
        ? `${block.kind === 'document-page' ? 'This page' : 'This image'} could not be loaded. It will retry shortly.`
        : `Loading ${block.kind === 'document-page' ? 'page' : 'image'}…`
    ));
  }
  figure.append(element(
    documentRef,
    'figcaption',
    '',
    block.kind === 'document-page' ? `${block.title} · Page ${block.page}` : block.title
  ));
  return figure;
}

/**
 * Render one sanitized block as an `<article>`.
 * @param {Document} documentRef - Owning document.
 * @param {object} block - Sanitized block.
 * @param {{asset?: {status: 'loading'|'ready'|'error', url?: string}}} [options] - Loaded asset state for image/page blocks.
 * @returns {HTMLElement} Rendered block.
 */
export function renderCaseContentBlock(documentRef, block, { asset = null } = {}) {
  const article = element(documentRef, 'article', `student-case-reference__item student-case-reference__item--${block.kind}`);
  article.setAttribute('data-persistence', 'local-only');
  article.setAttribute('data-summary', 'exclude');
  if (block.kind === 'table') {
    article.append(renderTable(documentRef, block));
  } else if (block.kind === 'image' || block.kind === 'document-page') {
    article.append(renderAsset(documentRef, block, asset));
  } else {
    article.append(element(documentRef, 'strong', '', block.title), element(documentRef, 'p', '', block.body));
  }
  return article;
}
