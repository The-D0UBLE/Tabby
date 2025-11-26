/**
 * @module ui-render
 * Contains DOM rendering logic for groups, folders, and tabs.
 * Features:
 *  - filtering (search) and sorting for groups & folders (exported setters)
 *  - inline rename for groups and folders (uses renameGroup / renameFolder from tabManager)
 *  - stable full re-renders always target top-level containers to avoid DOM nesting bugs
 */

import { storageData, saveStorage } from '../background/storage.js';
import {
  deleteGroup,
  deleteFolder,
  removeGroupFromFolder,
  moveGroupToFolder,
  renameGroup,
  renameFolder
} from '../background/tabManager.js';

/* ---------------------------
   Filter & sort state + setters
   --------------------------- */
let groupFilter = '';
let folderFilter = '';
let groupSortMode = 'alpha-asc';   // 'alpha-asc' | 'alpha-desc' | 'size-asc' | 'size-desc'
let folderSortMode = 'alpha-asc';  // 'alpha-asc' | 'alpha-desc' | 'size-asc' | 'size-desc'

export function setGroupFilter(s) { groupFilter = (s || '').toString().trim().toLowerCase(); }
export function setFolderFilter(s) { folderFilter = (s || '').toString().trim().toLowerCase(); }
export function setGroupSort(mode) { groupSortMode = mode || 'alpha-asc'; }
export function setFolderSort(mode) { folderSortMode = mode || 'alpha-asc'; }

/* ---------------------------
   Helpers: sorting functions
   --------------------------- */
function sortNamesAlpha(names, asc = true) {
  return names.sort((a, b) => {
    const A = a.toLowerCase();
    const B = b.toLowerCase();
    if (A < B) return asc ? -1 : 1;
    if (A > B) return asc ? 1 : -1;
    return 0;
  });
}

function sortGroupList(groupNames) {
  const mode = groupSortMode;
  if (mode === 'alpha-asc') return sortNamesAlpha(groupNames.slice(), true);
  if (mode === 'alpha-desc') return sortNamesAlpha(groupNames.slice(), false);
  if (mode === 'size-asc') {
    return groupNames.slice().sort((a, b) => {
      const asz = (storageData.groups[a] || []).length;
      const bsz = (storageData.groups[b] || []).length;
      if (asz !== bsz) return asz - bsz;
      return a.localeCompare(b);
    });
  }
  if (mode === 'size-desc') {
    return groupNames.slice().sort((a, b) => {
      const asz = (storageData.groups[a] || []).length;
      const bsz = (storageData.groups[b] || []).length;
      if (asz !== bsz) return bsz - asz;
      return a.localeCompare(b);
    });
  }
  return groupNames.slice();
}

function sortFolderList(folderNames) {
  const mode = folderSortMode;
  if (mode === 'alpha-asc') return sortNamesAlpha(folderNames.slice(), true);
  if (mode === 'alpha-desc') return sortNamesAlpha(folderNames.slice(), false);
  if (mode === 'size-asc') {
    return folderNames.slice().sort((a, b) => {
      const asz = (storageData.folders[a] || []).length;
      const bsz = (storageData.folders[b] || []).length;
      if (asz !== bsz) return asz - bsz;
      return a.localeCompare(b);
    });
  }
  if (mode === 'size-desc') {
    return folderNames.slice().sort((a, b) => {
      const asz = (storageData.folders[a] || []).length;
      const bsz = (storageData.folders[b] || []).length;
      if (asz !== bsz) return bsz - asz;
      return a.localeCompare(b);
    });
  }
  return folderNames.slice();
}

/* ---------------------------
   Expanded state
   --------------------------- */
const expandedGroups = new Set();
const expandedFolderGroups = new Map(); // folderName => Set of groupNames
const expandedFolders = new Set();

function getExpandedFolderGroups(folderName) {
  if (!expandedFolderGroups.has(folderName)) expandedFolderGroups.set(folderName, new Set());
  return expandedFolderGroups.get(folderName);
}

/* ---------------------------
   Utility: inline editor for rename
   --------------------------- */
function createInlineEditor(initialValue, onSave, onCancel) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = initialValue;
  input.className = 'inline-rename-input';
  // Lightweight inline styles — you can move these to CSS if you prefer
  input.style.padding = '6px 10px';
  input.style.borderRadius = '8px';
  input.style.border = '1px solid rgba(150,120,190,0.25)';
  input.style.fontSize = '0.95rem';
  input.style.width = '100%';

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (onCancel) onCancel();
    }
  });
  input.addEventListener('blur', () => {
    const newVal = input.value.trim();
    if (newVal === initialValue) {
      if (onCancel) onCancel();
      return;
    }
    if (onSave) onSave(newVal);
  });
  return input;
}

/* ---------------------------
   Render: Open Tabs
   --------------------------- */
export function renderOpenTabs(tabListElement) {
  tabListElement.innerHTML = '';

  chrome.tabs.query({ currentWindow: true }, tabs => {
    tabs.forEach(tab => {
      const li = document.createElement('li');
      li.setAttribute('draggable', 'true');

      // Flex row: title + close button
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.justifyContent = 'space-between';
      li.style.flexWrap = 'nowrap'; // <- prevent wrapping
      li.style.padding = '8px 12px';
      li.style.borderBottom = '1px solid rgba(190, 170, 220, 0.3)';
      li.style.borderRadius = '8px';
      li.style.background = 'transparent';
      li.style.cursor = 'grab';

      const tabObj = { id: tab.id, title: tab.title || tab.url, url: tab.url };
      li.dataset.tab = JSON.stringify(tabObj);

      // Title span
      const titleSpan = document.createElement('span');
      titleSpan.textContent = tabObj.title;
      titleSpan.style.flexGrow = '1';
      titleSpan.style.overflow = 'hidden';
      titleSpan.style.textOverflow = 'ellipsis';
      titleSpan.style.whiteSpace = 'nowrap';
      li.appendChild(titleSpan);

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.marginLeft = '10px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.addEventListener('click', e => {
        e.stopPropagation();
        chrome.tabs.remove(tabObj.id);
        li.remove();
      });
      li.appendChild(closeBtn);

      // Drag events
      li.addEventListener('dragstart', e => {
        e.dataTransfer.setData('application/json', li.dataset.tab);
      });

      tabListElement.appendChild(li);
    });
  });
}



/* ---------------------------
   Render: Groups (top-level panel)
   --------------------------- */
export function renderGroups(groupListElement) {
  groupListElement.innerHTML = '';
  const names = Object.keys(storageData.groups || {});

  const filtered = names.filter(n => {
    if (!groupFilter) return true;
    return n.toLowerCase().includes(groupFilter);
  });

  const sorted = sortGroupList(filtered);

  sorted.forEach(groupName => {
    const li = createGroupListItemForGroupsPanel(groupName, storageData.groups[groupName]);
    groupListElement.appendChild(li);
  });
}

/* ---------------------------
   Render: Folders (top-level panel)
   --------------------------- */
export function renderFolders(folderListElement) {
  folderListElement.innerHTML = '';
  const names = Object.keys(storageData.folders || {});

  const filtered = names.filter(n => {
    if (!folderFilter) return true;
    return n.toLowerCase().includes(folderFilter);
  });

  const sorted = sortFolderList(filtered);

  sorted.forEach(folderName => {
    const li = createFolderListItem(folderName, storageData.folders[folderName]);
    folderListElement.appendChild(li);
  });
}

/* ---------------------------
   DOM item creators (groups panel)
   --------------------------- */
function createGroupListItemForGroupsPanel(groupName, tabs) {
  const li = document.createElement('li');

  // Header row
  const headerRow = document.createElement('div');
  headerRow.classList.add('header-row');

  const caret = document.createElement('span');
  caret.textContent = expandedGroups.has(groupName) ? '▼' : '▶';
  caret.className = 'caret';
  caret.style.userSelect = 'none';
  caret.addEventListener('click', e => {
    e.stopPropagation();
    if (expandedGroups.has(groupName)) expandedGroups.delete(groupName);
    else expandedGroups.add(groupName);
    const groupList = document.getElementById('group-list');
    if (groupList) renderGroups(groupList);
  });
  headerRow.appendChild(caret);

  const nameSpan = document.createElement('span');
  nameSpan.textContent = groupName;
  nameSpan.classList.add('name');
  nameSpan.addEventListener('click', e => {
    e.stopPropagation();
    if (expandedGroups.has(groupName)) expandedGroups.delete(groupName);
    else expandedGroups.add(groupName);
    const groupList = document.getElementById('group-list');
    if (groupList) renderGroups(groupList);
  });
  headerRow.appendChild(nameSpan);

  const buttonsDiv = document.createElement('div');
  buttonsDiv.classList.add('buttons');

  const openBtn = document.createElement('button');
  openBtn.className = 'open-btn';
  openBtn.textContent = chrome.i18n.getMessage('openButtonText');
  openBtn.title = chrome.i18n.getMessage('openAllTabsGroupTitle', [groupName]);
  openBtn.addEventListener('click', e => {
    e.stopPropagation();
    tabs.forEach(tab => chrome.tabs.create({ url: tab.url }));
  });
  buttonsDiv.appendChild(openBtn);

  // Rename button
  const renameBtn = document.createElement('button');
  renameBtn.className = 'rename-btn';
  renameBtn.textContent = 'Rename';
  renameBtn.title = 'Rename group';
  renameBtn.addEventListener('click', e => {
    e.stopPropagation();
    const parent = nameSpan.parentElement;
    const input = createInlineEditor(groupName, (newName) => {
      if (!newName) {
        alert(chrome.i18n.getMessage('enterGroupName'));
        const groupList = document.getElementById('group-list');
        if (groupList) renderGroups(groupList);
        return;
      }
      const success = renameGroup(groupName, newName);
      if (success) {
        const groupList = document.getElementById('group-list');
        const folderList = document.getElementById('folder-list');
        if (groupList) renderGroups(groupList);
        if (folderList) renderFolders(folderList);
      } else {
        const groupList = document.getElementById('group-list');
        if (groupList) renderGroups(groupList);
      }
    }, () => {
      const groupList = document.getElementById('group-list');
      if (groupList) renderGroups(groupList);
    });
    parent.replaceChild(input, nameSpan);
    input.focus();
    input.select();
  });
  buttonsDiv.appendChild(renameBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-group-btn delete-btn';
  deleteBtn.textContent = chrome.i18n.getMessage('deleteButtonText');
  deleteBtn.title = chrome.i18n.getMessage('deleteGroupTitle', [groupName]);
  deleteBtn.addEventListener('click', e => {
    e.stopPropagation();
    deleteGroup(groupName);
    const groupList = document.getElementById('group-list');
    if (groupList) renderGroups(groupList);
  });
  buttonsDiv.appendChild(deleteBtn);

  headerRow.appendChild(buttonsDiv);

  // Make header draggable for moving into folders
  headerRow.setAttribute('draggable', 'true');
  headerRow.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', groupName);
    e.dataTransfer.effectAllowed = 'move';
  });

  li.appendChild(headerRow);

  // Show nested tabs if expanded
  if (expandedGroups.has(groupName)) {
    const tabUL = document.createElement('ul');
    tabUL.className = 'nested';
    tabs.forEach(tab => {
      const tabLI = document.createElement('li');

      const tabRow = document.createElement('div');
      tabRow.classList.add('header-row');

      const titleSpan = document.createElement('span');
      titleSpan.textContent = tab.title || tab.url || chrome.i18n.getMessage('untitledTabText');
      titleSpan.classList.add('name');
      tabRow.appendChild(titleSpan);

      const buttonsDivTab = document.createElement('div');
      buttonsDivTab.classList.add('buttons');

      const openTabBtn = document.createElement('button');
      openTabBtn.textContent = chrome.i18n.getMessage('openButtonText');
      openTabBtn.classList.add('open-btn');
      openTabBtn.title = chrome.i18n.getMessage('openTabTitle');
      openTabBtn.addEventListener('click', e => {
        e.stopPropagation();
        chrome.tabs.create({ url: tab.url });
      });
      buttonsDivTab.appendChild(openTabBtn);

      const deleteTabBtn = document.createElement('button');
      deleteTabBtn.textContent = chrome.i18n.getMessage('deleteButtonText');
      deleteTabBtn.classList.add('delete-btn');
      deleteTabBtn.title = chrome.i18n.getMessage('removeTabFromGroupTitle');
      deleteTabBtn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = storageData.groups[groupName].findIndex(t => t.url === tab.url);
        if (idx !== -1) {
          storageData.groups[groupName].splice(idx, 1);
          saveChangesAndRender();
        }
      });
      buttonsDivTab.appendChild(deleteTabBtn);

      tabRow.appendChild(buttonsDivTab);
      tabLI.appendChild(tabRow);
      tabUL.appendChild(tabLI);
    });
    li.appendChild(tabUL);
  }

  // Accept drop of a tab object onto this group
  li.addEventListener('dragover', e => e.preventDefault());
  li.addEventListener('drop', e => {
    e.preventDefault();
    let tabObj;
    try { tabObj = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
    if (tabObj && tabObj.url && !tabs.some(t => t.url === tabObj.url)) {
      storageData.groups[groupName].push(tabObj);
      saveChangesAndRender();
    }
  });

  return li;
}

/* ---------------------------
   DOM item creators (folders panel)
   --------------------------- */
function createFolderListItem(folderName, groupNames) {
  const li = document.createElement('li');

  const headerRow = document.createElement('div');
  headerRow.classList.add('header-row');

  const caret = document.createElement('span');
  caret.textContent = expandedFolders.has(folderName) ? '▼' : '▶';
  caret.className = 'caret';
  caret.style.userSelect = 'none';
  caret.addEventListener('click', e => {
    e.stopPropagation();
    if (expandedFolders.has(folderName)) expandedFolders.delete(folderName);
    else expandedFolders.add(folderName);
    const folderList = document.getElementById('folder-list');
    if (folderList) renderFolders(folderList);
  });
  headerRow.appendChild(caret);

  const nameSpan = document.createElement('span');
  nameSpan.textContent = folderName;
  nameSpan.classList.add('name');
  nameSpan.addEventListener('click', e => {
    e.stopPropagation();
    if (expandedFolders.has(folderName)) expandedFolders.delete(folderName);
    else expandedFolders.add(folderName);
    const folderList = document.getElementById('folder-list');
    if (folderList) renderFolders(folderList);
  });
  headerRow.appendChild(nameSpan);

  const buttonsDiv = document.createElement('div');
  buttonsDiv.classList.add('buttons');

  const openBtn = document.createElement('button');
  openBtn.classList.add('open-btn');
  openBtn.textContent = chrome.i18n.getMessage('openButtonText');
  openBtn.title = chrome.i18n.getMessage('openAllTabsFolderTitle', [folderName]);
  openBtn.addEventListener('click', e => {
    e.stopPropagation();
    groupNames.forEach(gName => {
      const tabs = storageData.groups[gName];
      if (tabs) tabs.forEach(tab => chrome.tabs.create({ url: tab.url }));
    });
  });
  buttonsDiv.appendChild(openBtn);

  // Rename folder button
  const renameBtn = document.createElement('button');
  renameBtn.className = 'rename-btn';
  renameBtn.textContent = 'Rename';
  renameBtn.title = 'Rename folder';
  renameBtn.addEventListener('click', e => {
    e.stopPropagation();
    const parent = nameSpan.parentElement;
    const input = createInlineEditor(folderName, (newName) => {
      if (!newName) {
        alert(chrome.i18n.getMessage('enterFolderName'));
        const folderList = document.getElementById('folder-list');
        if (folderList) renderFolders(folderList);
        return;
      }
      const success = renameFolder(folderName, newName);
      if (success) {
        const folderList = document.getElementById('folder-list');
        if (folderList) renderFolders(folderList);
      } else {
        const folderList = document.getElementById('folder-list');
        if (folderList) renderFolders(folderList);
      }
    }, () => {
      const folderList = document.getElementById('folder-list');
      if (folderList) renderFolders(folderList);
    });
    parent.replaceChild(input, nameSpan);
    input.focus();
    input.select();
  });
  buttonsDiv.appendChild(renameBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = chrome.i18n.getMessage('deleteButtonText');
  deleteBtn.className = 'delete-group-btn delete-btn';
  deleteBtn.title = chrome.i18n.getMessage('deleteFolderTitle', [folderName]);
  deleteBtn.addEventListener('click', e => {
    e.stopPropagation();
    deleteFolder(folderName);
    const folderList = document.getElementById('folder-list');
    if (folderList) renderFolders(folderList);
  });
  buttonsDiv.appendChild(deleteBtn);

  headerRow.appendChild(buttonsDiv);
  li.appendChild(headerRow);

  // Groups inside folder (if expanded)
  if (expandedFolders.has(folderName)) {
    const groupsUL = document.createElement('ul');
    groupsUL.className = 'nested';

    groupNames.slice().sort().forEach(groupName => {
      const tabs = storageData.groups[groupName];
      if (!tabs) return;
      const groupLI = createGroupListItemForFolderPanel(folderName, groupName, tabs);
      groupsUL.appendChild(groupLI);
    });

    li.appendChild(groupsUL);
  }

  // Drag & drop handlers for moving groups into folder
  li.addEventListener('dragover', e => { e.preventDefault(); li.style.backgroundColor = '#d0e7ff'; });
  li.addEventListener('dragleave', () => { li.style.backgroundColor = ''; });
  li.addEventListener('drop', e => {
    e.preventDefault();
    li.style.backgroundColor = '';
    const groupName = e.dataTransfer.getData('text/plain');
    if (groupName && storageData.groups[groupName]) {
      moveGroupToFolder(groupName, folderName);
      const folderList = document.getElementById('folder-list');
      if (folderList) renderFolders(folderList);
      const groupList = document.getElementById('group-list');
      if (groupList) renderGroups(groupList);
    }
  });

  return li;
}

function createGroupListItemForFolderPanel(folderName, groupName, tabs) {
  const li = document.createElement('li');

  const expandedSet = getExpandedFolderGroups(folderName);
  const isExpanded = expandedSet.has(groupName);

  const headerRow = document.createElement('div');
  headerRow.classList.add('header-row');

  const caret = document.createElement('span');
  caret.textContent = isExpanded ? '▼' : '▶';
  caret.className = 'caret';
  caret.style.userSelect = 'none';
  caret.addEventListener('click', e => {
    e.stopPropagation();
    if (expandedSet.has(groupName)) expandedSet.delete(groupName);
    else expandedSet.add(groupName);
    const folderList = document.getElementById('folder-list');
    if (folderList) renderFolders(folderList);
  });
  headerRow.appendChild(caret);

  const nameSpan = document.createElement('span');
  nameSpan.textContent = groupName;
  nameSpan.classList.add('name');
  nameSpan.addEventListener('click', e => {
    e.stopPropagation();
    if (expandedSet.has(groupName)) expandedSet.delete(groupName);
    else expandedSet.add(groupName);
    const folderList = document.getElementById('folder-list');
    if (folderList) renderFolders(folderList);
  });
  headerRow.appendChild(nameSpan);

  const buttonsDiv = document.createElement('div');
  buttonsDiv.classList.add('buttons');

  const openBtn = document.createElement('button');
  openBtn.textContent = chrome.i18n.getMessage('openButtonText');
  openBtn.classList.add('open-btn');
  openBtn.title = chrome.i18n.getMessage('openAllTabsGroupTitle', [groupName]);
  openBtn.addEventListener('click', e => {
    e.stopPropagation();
    tabs.forEach(tab => chrome.tabs.create({ url: tab.url }));
  });
  buttonsDiv.appendChild(openBtn);

  // Rename inside folder panel
  const renameBtn = document.createElement('button');
  renameBtn.className = 'rename-btn';
  renameBtn.textContent = 'Rename';
  renameBtn.title = 'Rename group';
  renameBtn.addEventListener('click', e => {
    e.stopPropagation();
    const parent = nameSpan.parentElement;
    const input = createInlineEditor(groupName, (newName) => {
      if (!newName) {
        alert(chrome.i18n.getMessage('enterGroupName'));
        const folderList = document.getElementById('folder-list');
        if (folderList) renderFolders(folderList);
        return;
      }
      const success = renameGroup(groupName, newName);
      if (success) {
        const folderList = document.getElementById('folder-list');
        const groupList = document.getElementById('group-list');
        if (folderList) renderFolders(folderList);
        if (groupList) renderGroups(groupList);
      } else {
        const folderList = document.getElementById('folder-list');
        if (folderList) renderFolders(folderList);
      }
    }, () => {
      const folderList = document.getElementById('folder-list');
      if (folderList) renderFolders(folderList);
    });
    parent.replaceChild(input, nameSpan);
    input.focus();
    input.select();
  });
  buttonsDiv.appendChild(renameBtn);

  const removeBtn = document.createElement('button');
  removeBtn.textContent = chrome.i18n.getMessage('removeButtonText');
  removeBtn.className = 'remove-btn';
  removeBtn.title = chrome.i18n.getMessage('removeGroupFromFolderTitle', [folderName]);
  removeBtn.addEventListener('click', e => {
    e.stopPropagation();
    removeGroupFromFolder(groupName, folderName);
    const expandedSetLocal = getExpandedFolderGroups(folderName);
    expandedSetLocal.delete(groupName);
    const folderList = document.getElementById('folder-list');
    if (folderList) renderFolders(folderList);
  });
  buttonsDiv.appendChild(removeBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = chrome.i18n.getMessage('deleteButtonText');
  deleteBtn.className = 'delete-group-btn delete-btn';
  deleteBtn.title = chrome.i18n.getMessage('deleteGroupCompletelyTitle', [groupName]);
  deleteBtn.addEventListener('click', e => {
    e.stopPropagation();
    deleteGroup(groupName);
    const groupList = document.getElementById('group-list');
    if (groupList) renderGroups(groupList);
    const folderList = document.getElementById('folder-list');
    if (folderList) renderFolders(folderList);
  });
  buttonsDiv.appendChild(deleteBtn);

  headerRow.appendChild(buttonsDiv);
  li.appendChild(headerRow);

  // Dropdown of tabs if expanded
  if (isExpanded) {
    const tabUL = document.createElement('ul');
    tabUL.className = 'nested';
    tabs.forEach(tab => {
      const tabLI = document.createElement('li');
      const tabRow = document.createElement('div');
      tabRow.classList.add('header-row');

      const titleSpan = document.createElement('span');
      titleSpan.textContent = tab.title || tab.url || chrome.i18n.getMessage('untitledTabText');
      titleSpan.classList.add('name');
      tabRow.appendChild(titleSpan);

      const buttonsDivTab = document.createElement('div');
      buttonsDivTab.classList.add('buttons');

      const openTabBtn = document.createElement('button');
      openTabBtn.textContent = chrome.i18n.getMessage('openButtonText');
      openTabBtn.classList.add('open-btn');
      openTabBtn.title = chrome.i18n.getMessage('openTabTitle');
      openTabBtn.addEventListener('click', e => {
        e.stopPropagation();
        chrome.tabs.create({ url: tab.url });
      });
      buttonsDivTab.appendChild(openTabBtn);

      const deleteTabBtn = document.createElement('button');
      deleteTabBtn.textContent = chrome.i18n.getMessage('deleteButtonText');
      deleteTabBtn.classList.add('delete-btn');
      deleteTabBtn.title = chrome.i18n.getMessage('removeTabFromGroupTitle');
      deleteTabBtn.addEventListener('click', e => {
        e.stopPropagation();
        const groupTabs = storageData.groups[groupName];
        const idx = groupTabs.findIndex(t => t.url === tab.url);
        if (idx !== -1) {
          groupTabs.splice(idx, 1);
          saveChangesAndRender();
        }
      });
      buttonsDivTab.appendChild(deleteTabBtn);

      tabRow.appendChild(buttonsDivTab);
      tabLI.appendChild(tabRow);
      tabUL.appendChild(tabLI);
    });
    li.appendChild(tabUL);
  }

  return li;
}

/* ---------------------------
   Save and re-render helper
   --------------------------- */
function saveChangesAndRender() {
  saveStorage();
  const groupList = document.getElementById('group-list');
  const folderList = document.getElementById('folder-list');
  if (groupList) renderGroups(groupList);
  if (folderList) renderFolders(folderList);
}
