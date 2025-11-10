/**
 * @module fileTransfer
 * @summary Provides helpers for exporting and importing intake snapshots as files.
 * @description
 *   These utilities bridge the app state serialization helpers with browser
 *   download/upload primitives so operators can move data between devices.
 *   The exports are dependency-injected for ease of testing and resilient to
 *   missing browser capabilities at runtime.
 */

import { collectAppState, applyAppState, resetAnalysisId } from './appState.js';
import { migrateAppState } from './storage.js';

/**
 * Serialize the current intake state and trigger a JSON download.
 *
 * @param {Object} [options] - Optional dependency overrides for testing.
 * @param {() => any} [options.collect=collectAppState] - Function that returns the current state snapshot.
 * @param {typeof Blob} [options.BlobCtor=Blob] - Blob constructor used to package the payload.
 * @param {Document} [options.documentRef=document] - Document instance used to create the anchor element.
 * @param {URL} [options.urlRef=URL] - URL interface providing `createObjectURL`/`revokeObjectURL`.
 * @param {() => Date} [options.now=() => new Date()] - Factory for timestamping the export filename.
 * @returns {{ success: boolean, message: string, error?: unknown }} Result describing the outcome for UI toasts.
 */
export function exportAppStateToFile({
  collect = collectAppState,
  BlobCtor = typeof Blob !== 'undefined' ? Blob : null,
  documentRef = typeof document !== 'undefined' ? document : null,
  urlRef = typeof URL !== 'undefined' ? URL : null,
  now = () => new Date()
} = {}) {
  try {
    if (typeof collect !== 'function') {
      return { success: false, message: 'Unable to export intake snapshot.', error: new Error('collectAppState missing') };
    }
    if (!BlobCtor) {
      return { success: false, message: 'File downloads are not supported in this environment.' };
    }
    if (!documentRef || typeof documentRef.createElement !== 'function') {
      return { success: false, message: 'Document context unavailable for downloads.' };
    }
    if (!urlRef || typeof urlRef.createObjectURL !== 'function') {
      return { success: false, message: 'Browser URL helpers missing for downloads.' };
    }

    const state = collect();
    const serialized = JSON.stringify(state, null, 2);
    const blob = new BlobCtor([serialized], { type: 'application/json' });
    const blobUrl = urlRef.createObjectURL(blob);

    const link = documentRef.createElement('a');
    link.href = blobUrl;
    const timestamp = now().toISOString().replace(/[:]/g, '-');
    link.download = `kt-intake-${timestamp}.json`;
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

    return { success: true, message: 'Download started for intake snapshot ✨' };
  } catch (error) {
    return { success: false, message: 'Unable to export intake snapshot.', error };
  }
}

/**
 * Import an intake snapshot from a JSON file, migrate it, and apply it to the UI.
 *
 * @param {File|Blob|null|undefined} file - User-selected file or blob.
 * @param {Object} [options] - Optional dependency overrides for testing.
 * @param {() => FileReader} [options.createReader] - Factory returning a FileReader instance.
 * @param {(data: unknown) => any} [options.migrate=migrateAppState] - Migration helper applied to parsed JSON.
 * @param {(state: any) => void} [options.apply=applyAppState] - Function that applies the migrated state.
 * @param {() => void} [options.reset=resetAnalysisId] - Resets the cached analysis identifier before applying.
 * @returns {Promise<{ success: boolean, message: string, error?: unknown }>} Result describing the outcome for UI toasts.
 */
export function importAppStateFromFile(file, {
  createReader,
  migrate = migrateAppState,
  apply = applyAppState,
  reset = resetAnalysisId
} = {}) {
  return new Promise(resolve => {
    if (!file) {
      resolve({ success: false, message: 'Select an intake export file to import.' });
      return;
    }

    const readerFactory = typeof createReader === 'function'
      ? createReader
      : (() => (typeof FileReader !== 'undefined' ? new FileReader() : null));

    let reader = null;
    try {
      reader = readerFactory();
    } catch (factoryError) {
      resolve({ success: false, message: 'File imports are not supported in this environment.', error: factoryError });
      return;
    }

    if (!reader || typeof reader.readAsText !== 'function') {
      resolve({ success: false, message: 'File imports are not supported in this environment.' });
      return;
    }

    reader.onerror = event => {
      const error = event?.error || reader.error;
      resolve({ success: false, message: 'Unable to read the selected file.', error });
    };

    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string'
          ? reader.result
          : (reader.result ? String(reader.result) : '');
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (parseError) {
          resolve({ success: false, message: 'Import cancelled: file was not valid JSON.', error: parseError });
          return;
        }

        let migrated = null;
        try {
          migrated = migrate(parsed);
        } catch (migrationError) {
          resolve({ success: false, message: 'Import failed while migrating the snapshot.', error: migrationError });
          return;
        }

        if (!migrated || typeof migrated !== 'object') {
          resolve({ success: false, message: 'Import failed: snapshot was empty after migration.' });
          return;
        }

        try {
          if (typeof reset === 'function') {
            reset();
          }
          apply(migrated);
        } catch (applyError) {
          resolve({ success: false, message: 'Import failed while applying the snapshot.', error: applyError });
          return;
        }

        resolve({ success: true, message: 'Intake snapshot imported from file ✨' });
      } catch (unexpected) {
        resolve({ success: false, message: 'Import failed due to an unexpected error.', error: unexpected });
      }
    };

    try {
      reader.readAsText(file);
    } catch (readError) {
      resolve({ success: false, message: 'Unable to read the selected file.', error: readError });
    }
  });
}
