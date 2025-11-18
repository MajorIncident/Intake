/**
 * @module templateExport
 * @summary Converts the current intake state into a template JSON download.
 * @description
 *   Provides a small wrapper around {@link collectAppState} so operators can
 *   export curated templates without hand-editing JSON. The helper asks for a
 *   template name/description upstream, slugs the identifier, and emits a file
 *   that matches the `templates/*.json` contract enforced by the manifest
 *   builder.
 */

import { collectAppState } from './appState.js';
import { TEMPLATE_MODE_IDS } from './templateModes.js';
import { TEMPLATE_KINDS, normalizeTemplateKind } from './templateKinds.js';

const MODE_VALUES = Object.values(TEMPLATE_MODE_IDS);

function slugify(value) {
  if (typeof value !== 'string') {
    return 'template';
  }
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'template';
}

function buildSupportedModes(kind) {
  if (kind === TEMPLATE_KINDS.STANDARD) {
    return [TEMPLATE_MODE_IDS.FULL];
  }
  return [...MODE_VALUES];
}

function ensureBlobCtor(BlobCtor) {
  if (BlobCtor) {
    return BlobCtor;
  }
  if (typeof Blob !== 'undefined') {
    return Blob;
  }
  return null;
}

/**
 * Export the current intake snapshot as a curated template JSON file.
 *
 * @param {{
 *   name: string,
 *   description: string,
 *   templateKind: keyof typeof TEMPLATE_KINDS,
 *   collect?: () => any,
 *   BlobCtor?: typeof Blob,
 *   documentRef?: Document|null,
 *   urlRef?: typeof URL|null,
 *   now?: () => Date
 * }} options - Export configuration and dependency overrides.
 * @returns {{ success: boolean, message: string, error?: unknown }} Outcome for UI messaging.
 */
export function exportCurrentStateAsTemplate({
  name,
  description,
  templateKind,
  collect = collectAppState,
  BlobCtor = ensureBlobCtor(),
  documentRef = typeof document !== 'undefined' ? document : null,
  urlRef = typeof URL !== 'undefined' ? URL : null,
  now = () => new Date()
} = {}) {
  try {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) {
      throw new Error('Template name is required.');
    }
    const normalizedDescription = typeof description === 'string'
      ? description.trim()
      : '';
    if (!normalizedDescription) {
      throw new Error('Template description is required.');
    }
    const kind = normalizeTemplateKind(templateKind);
    if (typeof collect !== 'function') {
      throw new Error('collectAppState missing');
    }
    if (!BlobCtor) {
      return { success: false, message: 'Template downloads are not supported in this environment.' };
    }
    if (!documentRef || typeof documentRef.createElement !== 'function') {
      return { success: false, message: 'Document context unavailable for template downloads.' };
    }
    if (!urlRef || typeof urlRef.createObjectURL !== 'function') {
      return { success: false, message: 'Browser URL helpers missing for template downloads.' };
    }

    const state = collect();
    const slug = slugify(normalizedName);
    const payload = {
      id: slug,
      name: normalizedName,
      description: normalizedDescription,
      templateKind: kind,
      supportedModes: buildSupportedModes(kind),
      state
    };

    const serialized = JSON.stringify(payload, null, 2);
    const blob = new BlobCtor([serialized], { type: 'application/json' });
    const blobUrl = urlRef.createObjectURL(blob);

    const link = documentRef.createElement('a');
    link.href = blobUrl;
    const timestamp = now().toISOString().replace(/[:]/g, '-');
    link.download = `kt-template-${slug}-${timestamp}.json`;
    link.rel = 'noopener';

    if (typeof link.click === 'function') {
      link.click();
    } else {
      const event = documentRef.createEvent?.('MouseEvents');
      event?.initEvent('click', true, true);
      link.dispatchEvent?.(event);
    }

    if (typeof urlRef.revokeObjectURL === 'function') {
      urlRef.revokeObjectURL(blobUrl);
    }

    return {
      success: true,
      message: kind === TEMPLATE_KINDS.STANDARD
        ? 'Standard template saved with Full mode defaults ✨'
        : 'Case study template saved with multi-mode support ✨'
    };
  } catch (error) {
    return { success: false, message: 'Unable to export the template.', error };
  }
}
