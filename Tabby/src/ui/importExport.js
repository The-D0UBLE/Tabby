/**
 * @module importExport
 * Handles exporting and importing the extension storage to/from a JSON file.
 *
 * This file is intentionally separate so options.js and the core UI stay clean.
 */

const EXPORT_BTN_ID = 'export-backup';
const IMPORT_BTN_ID = 'import-backup';
const IMPORT_FILE_ID = 'import-file';

/**
 * Format a Date to YYYYMMDD-HHMMSS for filename.
 * @param {Date} d
 * @returns {string}
 */
function formatTimestamp(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Trigger a download of the given object as a JSON file.
 * @param {Object} obj
 * @param {string} filename
 */
function downloadJSON(obj, filename) {
  try {
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Failed to prepare export: ' + (err && err.message ? err.message : err));
  }
}

/**
 * Basic validation + migration for imported data.
 * Accepts:
 *  - { groups: {...}, folders: {...} } (preferred)
 *  - legacy: { groupName: [ "https://...", ... ], otherGroup: [...] }  (interpreted as groups)
 *
 * Returns normalized object: { groups: {...}, folders: {...} } or throws Error.
 * @param {any} parsed
 */
function normalizeImportedData(parsed) {
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON content (not an object).');

  // Case: contains top-level groups/folders keys
  if ('groups' in parsed || 'folders' in parsed) {
    const groups = parsed.groups || {};
    const folders = parsed.folders || {};

    // Migrate group entries where tabs are an array of strings (legacy) -> object form
    const migratedGroups = {};
    for (const gName of Object.keys(groups)) {
      const arr = groups[gName] || [];
      if (!Array.isArray(arr)) throw new Error(`Group "${gName}" is not an array.`);
      migratedGroups[gName] = arr.map(item => {
        if (typeof item === 'string') return { title: item, url: item };
        if (typeof item === 'object' && item !== null && 'url' in item) return { title: item.title || item.url, url: item.url };
        throw new Error(`Invalid tab entry in group "${gName}".`);
      });
    }

    // Ensure folders are arrays of group-name strings
    const migratedFolders = {};
    for (const fName of Object.keys(folders)) {
      const arr = folders[fName] || [];
      if (!Array.isArray(arr)) throw new Error(`Folder "${fName}" is not an array.`);
      migratedFolders[fName] = arr.map(v => String(v));
    }

    return { groups: migratedGroups, folders: migratedFolders };
  }

  // Otherwise, treat the whole object as groups mapping
  // Validate: each key -> array of strings or objects
  const assumedGroups = {};
  for (const key of Object.keys(parsed)) {
    const arr = parsed[key];
    if (!Array.isArray(arr)) throw new Error(`Top-level key "${key}" is not an array; can't interpret as groups/folders JSON.`);
    assumedGroups[key] = arr.map(item => {
      if (typeof item === 'string') return { title: item, url: item };
      if (typeof item === 'object' && item !== null && 'url' in item) return { title: item.title || item.url, url: item.url };
      throw new Error(`Invalid tab entry in group "${key}".`);
    });
  }
  return { groups: assumedGroups, folders: {} };
}

/**
 * Wire up buttons and file input.
 */
function init() {
  const exportBtn = document.getElementById(EXPORT_BTN_ID);
  const importBtn = document.getElementById(IMPORT_BTN_ID);
  const importFile = document.getElementById(IMPORT_FILE_ID);

  if (!exportBtn || !importBtn || !importFile) {
    // UI elements not present (maybe options page not loaded). Just skip silently.
    return;
  }

  exportBtn.addEventListener('click', async () => {
    // Read all storage and download as JSON
    try {
      chrome.storage.local.get(null, data => {
        const timestamp = formatTimestamp(new Date());
        const filename = `tabby-backup-${timestamp}.json`;
        // Prefer to export only the keys we use, but include everything to be safe
        downloadJSON(data, filename);
      });
    } catch (err) {
      alert('Export failed: ' + (err && err.message ? err.message : err));
    }
  });

  importBtn.addEventListener('click', () => {
    // trigger file chooser
    importFile.value = '';
    importFile.click();
  });

  importFile.addEventListener('change', () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const parsed = JSON.parse(text);
        const normalized = normalizeImportedData(parsed);

        // Confirm replacement
        const proceed = confirm('Import will replace your current groups and folders. Continue?');
        if (!proceed) return;

        // Write to storage
        chrome.storage.local.set({ groups: normalized.groups, folders: normalized.folders }, () => {
          if (chrome.runtime.lastError) {
            alert('Failed to write imported data: ' + chrome.runtime.lastError.message);
            return;
          }
          alert('Import successful. The page will refresh to show the imported data.');
          // Refresh the UI: dispatch an event or reload the page to force options.js to re-load storage
          // Simpler: reload options page to ensure everything is re-read
          location.reload();
        });
      } catch (err) {
        alert('Import failed: ' + (err && err.message ? err.message : err));
      }
    };
    reader.onerror = (e) => {
      alert('Failed to read the selected file.');
    };
    reader.readAsText(file);
  });
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
