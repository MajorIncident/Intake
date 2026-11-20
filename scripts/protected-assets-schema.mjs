/**
 * @module protectedAssetsSchema
 * @summary Validates the server-only protected staged-asset registry (#316).
 * @description
 *   Protected images and document pages for staged Case Studies are authored
 *   under `templates/assets/` with a `registry.json` index. The build embeds
 *   the validated bytes into the server-only `api/_protected-assets.manifest.js`;
 *   nothing here ever reaches the public `dist/` bundle.
 *
 *   Registry shape:
 *   ```json
 *   { "assets": [
 *     { "id": "cabinet-photo", "kind": "image", "file": "cabinet-photo.png" },
 *     { "id": "inspection-report", "kind": "document",
 *       "pages": [{ "page": 1, "file": "inspection-report-p1.png" }] }
 *   ] }
 *   ```
 *
 *   Media types are detected from the file bytes, never trusted from the
 *   author, and only raster PNG, JPEG, and WebP are accepted (no SVG: it can
 *   carry script). Every staged `image` / `document-page` block must resolve
 *   to a registry entry of the matching kind and page; anything else fails the
 *   build closed.
 */

/** Largest accepted single asset representation, in bytes. */
export const PROTECTED_ASSET_MAX_BYTES = 2 * 1024 * 1024;

export const PROTECTED_ASSET_KINDS = Object.freeze(['image', 'document']);

const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Detects a supported raster media type from file bytes.
 * @param {Uint8Array} bytes - File contents.
 * @returns {'image/png'|'image/jpeg'|'image/webp'|null} Media type, or null when unsupported.
 */
export function detectProtectedAssetMediaType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function checkFile(value, ctx, errors) {
  if (typeof value !== 'string' || !FILE_NAME_PATTERN.test(value) || value.includes('..')) {
    errors.push(`${ctx} must be a plain file name inside templates/assets/`);
    return null;
  }
  return value;
}

/**
 * Validates and normalizes the authored registry (without reading files).
 * @param {unknown} registry - Parsed `registry.json`, or undefined when absent.
 * @returns {{errors: string[], assets: Array<{id: string, kind: 'image', file: string}|{id: string, kind: 'document', pages: Array<{page: number, file: string}>}>}} Result.
 */
export function validateProtectedAssetRegistry(registry) {
  const errors = [];
  if (registry === undefined) return { errors, assets: [] };
  if (!isRecord(registry) || !Array.isArray(registry.assets)) {
    return { errors: ['registry must be an object with an "assets" array'], assets: [] };
  }
  for (const key of Object.keys(registry)) {
    if (key !== 'assets') errors.push(`registry.${key} is not allowed`);
  }
  const assets = [];
  const seen = new Set();
  registry.assets.forEach((entry, index) => {
    const ctx = `assets[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${ctx} must be an object`);
      return;
    }
    const id = typeof entry.id === 'string' ? entry.id : '';
    if (!STABLE_ID_PATTERN.test(id)) {
      errors.push(`${ctx}.id must be a stable lowercase slug (letters, numbers, hyphens; max 64 characters)`);
      return;
    }
    if (seen.has(id)) errors.push(`${ctx}.id duplicates ${id}`);
    seen.add(id);
    if (!PROTECTED_ASSET_KINDS.includes(entry.kind)) {
      errors.push(`${ctx}.kind must be one of: ${PROTECTED_ASSET_KINDS.join(', ')}`);
      return;
    }
    if (entry.kind === 'image') {
      for (const key of Object.keys(entry)) {
        if (!['id', 'kind', 'file'].includes(key)) errors.push(`${ctx}.${key} is not allowed for an image`);
      }
      const file = checkFile(entry.file, `${ctx}.file`, errors);
      if (file) assets.push({ id, kind: 'image', file });
      return;
    }
    for (const key of Object.keys(entry)) {
      if (!['id', 'kind', 'pages'].includes(key)) errors.push(`${ctx}.${key} is not allowed for a document`);
    }
    if (!Array.isArray(entry.pages) || entry.pages.length === 0) {
      errors.push(`${ctx}.pages must be a non-empty array`);
      return;
    }
    const pages = [];
    const pageNumbers = new Set();
    entry.pages.forEach((page, pageIndex) => {
      const pageCtx = `${ctx}.pages[${pageIndex}]`;
      if (!isRecord(page) || !Number.isInteger(page.page) || page.page < 1) {
        errors.push(`${pageCtx}.page must be a positive integer`);
        return;
      }
      if (pageNumbers.has(page.page)) errors.push(`${pageCtx}.page duplicates page ${page.page}`);
      pageNumbers.add(page.page);
      for (const key of Object.keys(page)) {
        if (!['page', 'file'].includes(key)) errors.push(`${pageCtx}.${key} is not allowed`);
      }
      const file = checkFile(page.file, `${pageCtx}.file`, errors);
      if (file) pages.push({ page: page.page, file });
    });
    assets.push({ id, kind: 'document', pages: pages.sort((a, b) => a.page - b.page) });
  });
  return { errors, assets };
}

/**
 * Validates one asset file's bytes.
 * @param {Uint8Array} bytes - File contents.
 * @param {string} ctx - Error context.
 * @param {string[]} errors - Error sink.
 * @returns {string|null} Detected media type, or null when rejected.
 */
export function validateProtectedAssetBytes(bytes, ctx, errors) {
  if (!bytes || bytes.length === 0) {
    errors.push(`${ctx} is empty`);
    return null;
  }
  if (bytes.length > PROTECTED_ASSET_MAX_BYTES) {
    errors.push(`${ctx} is larger than ${PROTECTED_ASSET_MAX_BYTES} bytes`);
    return null;
  }
  const mediaType = detectProtectedAssetMediaType(bytes);
  if (!mediaType) errors.push(`${ctx} is not a PNG, JPEG, or WebP image`);
  return mediaType;
}

/**
 * Checks that every staged image / document-page block resolves to the registry.
 * @param {Array<{id: string, simulation?: object}>} caseStudies - Validated protected Case Studies.
 * @param {Array<{id: string, kind: string, pages?: Array<{page: number}>}>} assets - Normalized registry.
 * @returns {string[]} Errors.
 */
export function validateSimulationAssetReferences(caseStudies, assets) {
  const errors = [];
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  for (const caseStudy of caseStudies) {
    for (const block of caseStudy.simulation?.studentContent || []) {
      if (block.kind !== 'image' && block.kind !== 'document-page') continue;
      const ctx = `${caseStudy.id} studentContent ${block.id}`;
      const asset = byId.get(block.assetId);
      if (!asset) {
        errors.push(`${ctx} references unknown protected asset ${block.assetId}`);
      } else if (block.kind === 'image' && asset.kind !== 'image') {
        errors.push(`${ctx} is an image but ${block.assetId} is a ${asset.kind}`);
      } else if (block.kind === 'document-page') {
        if (asset.kind !== 'document') {
          errors.push(`${ctx} is a document page but ${block.assetId} is a ${asset.kind}`);
        } else if (!asset.pages.some(page => page.page === block.page)) {
          errors.push(`${ctx} references missing page ${block.page} of ${block.assetId}`);
        }
      }
    }
  }
  return errors;
}
