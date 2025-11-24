/**
 * @module tabManager
 * Core logic to create, modify, delete and rename groups and folders.
 */

import { storageData, saveStorage } from './storage.js';

/**
 * Create a new tab group.
 * @param {string} name - Group name
 */
export function createGroup(name) {
  if (!name) {
    alert(chrome.i18n.getMessage('enterGroupName'));
    return;
  }
  if (storageData.groups[name]) {
    alert(chrome.i18n.getMessage('groupExists'));
    return;
  }
  storageData.groups[name] = [];
  saveStorage();
}

/**
 * Create a new folder.
 * @param {string} name - Folder name
 */
export function createFolder(name) {
  if (!name) {
    alert(chrome.i18n.getMessage('enterFolderName'));
    return;
  }
  if (storageData.folders[name]) {
    alert(chrome.i18n.getMessage('folderExists'));
    return;
  }
  storageData.folders[name] = [];
  saveStorage();
}

/**
 * Delete a group and remove it from all folders.
 * @param {string} groupName 
 */
export function deleteGroup(groupName) {
  if (!confirm(chrome.i18n.getMessage('deleteGroupConfirm', [groupName]))) return;
  delete storageData.groups[groupName];
  Object.keys(storageData.folders).forEach(folder => {
    storageData.folders[folder] = storageData.folders[folder].filter(g => g !== groupName);
  });
  saveStorage();
}

/**
 * Delete a folder without deleting contained groups.
 * @param {string} folderName 
 */
export function deleteFolder(folderName) {
  if (!confirm(chrome.i18n.getMessage('deleteFolderConfirm', [folderName]))) return;
  delete storageData.folders[folderName];
  saveStorage();
}

/**
 * Move a group into a specific folder, removing it from others.
 * @param {string} groupName 
 * @param {string} folderName 
 */
export function moveGroupToFolder(groupName, folderName) {
  Object.keys(storageData.folders).forEach(folder => {
    storageData.folders[folder] = storageData.folders[folder].filter(g => g !== groupName);
  });
  if (!storageData.folders[folderName]) storageData.folders[folderName] = [];
  if (!storageData.folders[folderName].includes(groupName)) {
    storageData.folders[folderName].push(groupName);
  }
  saveStorage();
}

/**
 * Remove a group from a folder but keep it in storage.
 * @param {string} groupName 
 * @param {string} folderName 
 */
export function removeGroupFromFolder(groupName, folderName) {
  if (!storageData.folders[folderName]) return;
  storageData.folders[folderName] = storageData.folders[folderName].filter(g => g !== groupName);
  saveStorage();
}

/**
 * Rename a group safely.
 * - Validates non-empty new name.
 * - Ensures new name isn't already used.
 * - Moves tabs data to new key and updates folder membership arrays.
 * @param {string} oldName
 * @param {string} newName
 * @returns {boolean} true on success, false on failure
 */
export function renameGroup(oldName, newName) {
  newName = (newName || '').trim();
  if (!newName) {
    alert(chrome.i18n.getMessage('enterGroupName'));
    return false;
  }
  if (newName === oldName) return true; // nothing to do
  if (storageData.groups[newName]) {
    alert(chrome.i18n.getMessage('groupExists'));
    return false;
  }
  // Move group data
  storageData.groups[newName] = storageData.groups[oldName] || [];
  delete storageData.groups[oldName];

  // Replace occurrences in folders
  Object.keys(storageData.folders).forEach(folder => {
    storageData.folders[folder] = storageData.folders[folder].map(g => g === oldName ? newName : g)
      // ensure no duplicates if newName already present in folder
      .filter((g, idx, arr) => arr.indexOf(g) === idx);
  });

  saveStorage();
  return true;
}

/**
 * Rename a folder safely.
 * - Validates non-empty new name.
 * - Ensures new name isn't already used.
 * - Moves folder membership array to new key.
 * @param {string} oldName
 * @param {string} newName
 * @returns {boolean} true on success, false on failure
 */
export function renameFolder(oldName, newName) {
  newName = (newName || '').trim();
  if (!newName) {
    alert(chrome.i18n.getMessage('enterFolderName'));
    return false;
  }
  if (newName === oldName) return true; // nothing to do
  if (storageData.folders[newName]) {
    alert(chrome.i18n.getMessage('folderExists'));
    return false;
  }
  storageData.folders[newName] = storageData.folders[oldName] || [];
  delete storageData.folders[oldName];
  saveStorage();
  return true;
}
