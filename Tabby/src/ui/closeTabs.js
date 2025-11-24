export function renderOpenTabs(tabListElement) {
  tabListElement.innerHTML = '';
  chrome.tabs.query({ currentWindow: true }, tabs => {
    tabs.forEach(tab => {
      const li = document.createElement('li');
      li.setAttribute('draggable', 'true');
      li.classList.add('tab-item'); // optional, for CSS

      const tabObj = { id: tab.id, title: tab.title || tab.url, url: tab.url };
      li.dataset.tab = JSON.stringify(tabObj);

      // make the li flex row
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.justifyContent = 'space-between';

      // Title
      const titleSpan = document.createElement('span');
      titleSpan.textContent = tabObj.title;
      titleSpan.style.overflow = 'hidden';
      titleSpan.style.textOverflow = 'ellipsis';
      titleSpan.style.flexGrow = '1';
      li.appendChild(titleSpan);

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.marginLeft = '8px';
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
