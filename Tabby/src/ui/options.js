/**
 * @module options
 * Handles the options page UI and event logic, plus search/sort controls.
 */

import { loadStorage } from '../background/storage.js';
import { createGroup, createFolder } from '../background/tabManager.js';
import {
  renderOpenTabs,
  renderGroups,
  renderFolders,
  setGroupFilter,
  setFolderFilter,
  setGroupSort,
  setFolderSort
} from './ui-render.js';

document.addEventListener('DOMContentLoaded', () => {
  // Localization
  document.querySelectorAll('[data-i18n]').forEach(elem => {
    const msg = chrome.i18n.getMessage(elem.dataset.i18n);
    if (msg) elem.textContent = msg;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
    const msg = chrome.i18n.getMessage(elem.dataset.i18nPlaceholder);
    if (msg) elem.placeholder = msg;
  });

  const tabList = document.getElementById('tab-list');
  const groupList = document.getElementById('group-list');
  const folderList = document.getElementById('folder-list');

  const newGroupInput = document.getElementById('new-group-name');
  const createGroupBtn = document.getElementById('create-group');

  const newFolderInput = document.getElementById('new-folder-name');
  const createFolderBtn = document.getElementById('create-folder');

  // Search & sort controls
  const groupSearch = document.getElementById('group-search');
  const folderSearch = document.getElementById('folder-search');
  const groupSort = document.getElementById('group-sort');
  const folderSort = document.getElementById('folder-sort');

  // Backup/import buttons are handled by importExport.js (already in page)

  let storageReady = false;

  function refreshAll() {
    if (!storageReady) return;
    renderOpenTabs(tabList);
    renderGroups(groupList);
    renderFolders(folderList);
  }

  // Debounce utility for search inputs
  function debounce(fn, wait = 200) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  loadStorage(() => {
    storageReady = true;
    refreshAll();
  });

  createGroupBtn.addEventListener('click', () => {
    const name = newGroupInput.value.trim();
    createGroup(name);
    newGroupInput.value = '';
    refreshAll();
  });

  createFolderBtn.addEventListener('click', () => {
    const name = newFolderInput.value.trim();
    createFolder(name);
    newFolderInput.value = '';
    refreshAll();
  });

  // Wire up search & sort
  const onGroupSearch = debounce((ev) => {
    setGroupFilter(ev.target.value || '');
    refreshAll();
  }, 180);
  const onFolderSearch = debounce((ev) => {
    setFolderFilter(ev.target.value || '');
    refreshAll();
  }, 180);

  groupSearch.addEventListener('input', onGroupSearch);
  folderSearch.addEventListener('input', onFolderSearch);

  groupSort.addEventListener('change', (ev) => {
    setGroupSort(ev.target.value);
    refreshAll();
  });
  folderSort.addEventListener('change', (ev) => {
    setFolderSort(ev.target.value);
    refreshAll();
  });

  // initialize sort/filter state from default control values
  setGroupFilter(groupSearch.value || '');
  setFolderFilter(folderSearch.value || '');
  setGroupSort(groupSort.value || 'alpha-asc');
  setFolderSort(folderSort.value || 'alpha-asc');
});
