/**
 * @module ui-render
 * Contains DOM rendering logic for groups, folders, and tabs.
 */

import { storageData, saveStorage } from '../background/storage.js';
import { deleteGroup, deleteFolder, removeGroupFromFolder, moveGroupToFolder } from '../background/tabManager.js';

/**
 * Keeps track of expanded groups and folders state for UI.
 */
const expandedGroups = new Set();
const expandedFolderGroups = new Map();  // folderName => Set of expanded groupNames
const expandedFolders = new Set();

function getExpandedFolderGroups(folderName) {
  if (!expandedFolderGroups.has(folderName)) {
    expandedFolderGroups.set(folderName, new Set());
  }
  return expandedFolderGroups.get(folderName);
}

/**
 * Renders the list of open tabs in the popup.
 * @param {HTMLElement} tabListElement 
 */
export function renderOpenTabs(tabListElement) {
  tabListElement.innerHTML = '';
  chrome.tabs.query({ currentWindow: true }, tabs => {
    tabs.forEach(tab => {
      const li = document.createElement('li');
      li.textContent = tab.title || tab.url;
      li.setAttribute('draggable', 'true');

      const tabObj = { title: tab.title || tab.url, url: tab.url };
      li.dataset.tab = JSON.stringify(tabObj);

      li.addEventListener('dragstart', e => {
        e.dataTransfer.setData('application/json', li.dataset.tab);
      });
      tabListElement.appendChild(li);
    });
  });
}

/** Render all groups in the main groups panel */
export function renderGroups(groupListElement) {
  groupListElement.innerHTML = '';
  Object.keys(storageData.groups).sort().forEach(groupName => {
    const li = createGroupListItemForGroupsPanel(groupName, storageData.groups[groupName]);
    groupListElement.appendChild(li);
  });
}

/** Render all folders in the folders panel */
export function renderFolders(folderListElement) {
  folderListElement.innerHTML = '';
  Object.keys(storageData.folders).sort().forEach(folderName => {
    const li = createFolderListItem(folderName, storageData.folders[folderName]);
    folderListElement.appendChild(li);
  });
}

/**
 * Create a group list item (standalone/groups panel).
 * @param {string} groupName 
 * @param {Array} tabs 
 * @returns {HTMLElement}
 */
function createGroupListItemForGroupsPanel(groupName, tabs) {
  const li = document.createElement('li');

  // Header row
  const headerRow = document.createElement('div');
  headerRow.classList.add('header-row');

  // Caret for expand/collapse groups panel
  const caret = document.createElement('span');
  caret.textContent = expandedGroups.has(groupName) ? '▼' : '▶';
  caret.className = 'caret';
  caret.style.userSelect = 'none';
  caret.addEventListener('click', e => {
    e.stopPropagation();
    if (expandedGroups.has(groupName)) expandedGroups.delete(groupName);
    else expandedGroups.add(groupName);
    // Always re-render the top-level group list
    const groupList = document.getElementById('group-list');
    if (groupList) renderGroups(groupList);
  });
  headerRow.appendChild(caret);

  // Group name clickable
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

  // Buttons container
  const buttonsDiv = document.createElement('div');
  buttonsDiv.classList.add('buttons');

  // Open group button (open all tabs)
  const openBtn = document.createElement('button');
  openBtn.className = 'open-btn';
  openBtn.textContent = chrome.i18n.getMessage('openButtonText');
  openBtn.title = chrome.i18n.getMessage('openAllTabsGroupTitle', [groupName]);
  openBtn.addEventListener('click', e => {
    e.stopPropagation();
    tabs.forEach(tab => chrome.tabs.create({ url: tab.url }));
  });
  buttonsDiv.appendChild(openBtn);

  // Delete group button
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

  // Make group draggable (to folders)
  headerRow.setAttribute('draggable', 'true');
  headerRow.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', groupName);
    e.dataTransfer.effectAllowed = 'move';
  });

  li.appendChild(headerRow);

  // Dropdown list of tabs (if expanded)
  if (expandedGroups.has(groupName)) {
    const tabUL = document.createElement('ul');
    tabUL.className = 'nested';

    tabs.forEach(tab => {
      const tabLI = document.createElement('li');

      // Tab row
      const tabRow = document.createElement('div');
      tabRow.classList.add('header-row');

      const titleSpan = document.createElement('span');
      titleSpan.textContent = tab.title || tab.url || chrome.i18n.getMessage('untitledTabText');
      titleSpan.classList.add('name');
      tabRow.appendChild(titleSpan);

      // Tab buttons container
      const buttonsDivTab = document.createElement('div');
      buttonsDivTab.classList.add('buttons');

      // Open tab button
      const openTabBtn = document.createElement('button');
      openTabBtn.textContent = chrome.i18n.getMessage('openButtonText');
      openTabBtn.classList.add('open-btn');
      openTabBtn.title = chrome.i18n.getMessage('openTabTitle');
      openTabBtn.addEventListener('click', e => {
        e.stopPropagation();
        chrome.tabs.create({ url: tab.url });
      });
      buttonsDivTab.appendChild(openTabBtn);

      // Delete tab button
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

  // Accept drag of tabs onto group to add tab objects
  li.addEventListener('dragover', e => e.preventDefault());
  li.addEventListener('drop', e => {
    e.preventDefault();
    let tabObj;
    try {
      tabObj = JSON.parse(e.dataTransfer.getData('application/json'));
    } catch {
      return;
    }
    if (tabObj && tabObj.url && !tabs.some(t => t.url === tabObj.url)) {
      storageData.groups[groupName].push(tabObj);
      saveChangesAndRender();
    }
  });

  return li;
}

/**
 * Create a folder list item.
 * @param {string} folderName 
 * @param {Array<string>} groupNames 
 * @returns {HTMLElement}
 */
function createFolderListItem(folderName, groupNames) {
  const li = document.createElement('li');

  // Header row
  const headerRow = document.createElement('div');
  headerRow.classList.add('header-row');

  // Caret for expand/collapse folder
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

  // Folder name clickable
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

  // Buttons container
  const buttonsDiv = document.createElement('div');
  buttonsDiv.classList.add('buttons');

  // Open folder button: open tabs of all groups inside folder
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

  // Delete folder button
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

  // Dropdown listing groups in folder, with their own dropdowns
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

  // Drag and drop folder accepts dragged groups
  li.addEventListener('dragover', e => {
    e.preventDefault();
    li.style.backgroundColor = '#d0e7ff';
  });
  li.addEventListener('dragleave', e => {
    li.style.backgroundColor = '';
  });
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

/**
 * Create a group list item inside folder panel.
 * @param {string} folderName 
 * @param {string} groupName 
 * @param {Array} tabs 
 * @returns {HTMLElement}
 */
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

  // Open group button
  const openBtn = document.createElement('button');
  openBtn.textContent = chrome.i18n.getMessage('openButtonText');
  openBtn.classList.add('open-btn');
  openBtn.title = chrome.i18n.getMessage('openAllTabsGroupTitle', [groupName]);
  openBtn.addEventListener('click', e => {
    e.stopPropagation();
    tabs.forEach(tab => chrome.tabs.create({ url: tab.url }));
  });
  buttonsDiv.appendChild(openBtn);

  // Remove group from folder
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

  // Delete group completely
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

  // Dropdown tabs if expanded
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

/**
 * Save changes, then re-render groups and folders.
 */
function saveChangesAndRender() {
  saveStorage();
  const groupList = document.getElementById('group-list');
  const folderList = document.getElementById('folder-list');
  if (groupList) renderGroups(groupList);
  if (folderList) renderFolders(folderList);
}
