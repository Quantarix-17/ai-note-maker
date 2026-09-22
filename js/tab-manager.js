// ========================================================================
// TAB MANAGER - Multi‑tab workspace with isolated state per tab
// ========================================================================

// Per-tab live File object maps (cannot be JSON-serialized to localStorage)
const TAB_FILE_OBJECTS = new Map();

function syncCurrentTabFileObjects() {
  try {
    const id = (typeof TAB_MANAGER !== 'undefined' && TAB_MANAGER.activeId) ? TAB_MANAGER.activeId : null;
    if (!id) return;
    TAB_FILE_OBJECTS.set(id, { ...(window.APP_STATE?.fileObjects || {}) });
  } catch (e) {
    console.warn('syncCurrentTabFileObjects failed:', e);
  }
}

const TAB_MANAGER = {
  tabs: [],
  activeId: null,
  nextId: 1,
  _initialized: false,

  _generateId() {
    return 'tab_' + (this.nextId++);
  },

  _getTabNameFromHtml(html) {
    if (!html) return 'Untitled';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const h1 = temp.querySelector('h1, h2, h3');
    if (h1 && h1.innerText.trim() && !h1.innerText.includes('Start typing here')) {
      return h1.innerText.trim().slice(0, 24);
    }
    return 'Untitled';
  },

  _createBlankState() {
    return {
      htmlContent: `<h1 style="text-align: center; margin-top: 30%; color: #9ca3af; font-family: 'Inter', sans-serif; font-weight:400;">Start typing here...<br><span style="font-size: 14pt;">Or ask AI on the left to generate notes, MCQ Quizzes, or charts!</span></h1>`,
      chatHistory: [],
      attachedFiles: {},
      undoStack: [],
      redoStack: [],
      selectedPage: null,
      projectVersion: 0,
      scrollPosition: 0
    };
  },

  _captureCurrentState(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;
    const html = typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '';
    tab.htmlContent = html || tab.htmlContent;
    tab.name = this._getTabNameFromHtml(html);
    tab.chatHistory = Array.isArray(window.APP_STATE?.chatHistory) ? [...window.APP_STATE.chatHistory] : [];
    tab.attachedFiles = { ...(window.APP_STATE?.attachedFiles || {}) };
    syncCurrentTabFileObjects();
    tab.undoStack = Array.isArray(window.HISTORY?.undoStack) ? [...window.HISTORY.undoStack] : [];
    tab.redoStack = Array.isArray(window.HISTORY?.redoStack) ? [...window.HISTORY.redoStack] : [];
    tab.selectedPage = window.APP_STATE?.selectedPage || null;
    tab.projectVersion = window.APP_STATE?.projectVersion || 0;
    tab.scrollPosition = document.getElementById('document-view-container')?.scrollTop || 0;
    tab.theme = window.APP_STATE?.theme || 'light';
    tab.pdfVisualFormat = window.APP_STATE?.pdfVisualFormat || (typeof getActivePDFVisualFormat === 'function' ? getActivePDFVisualFormat() : 'default');
    tab.pdfTextFormat = window.APP_STATE?.pdfTextFormat || (typeof getActivePDFTextFormat === 'function' ? getActivePDFTextFormat() : 'default');
    tab.pdfLanguageFormat = window.APP_STATE?.pdfLanguageFormat || (typeof getActivePDFLanguageFormat === 'function' ? getActivePDFLanguageFormat() : 'default');
    tab.photocopyMode = document.body.classList.contains('photocopy-mode');
  },

  _loadStateIntoUI(tab) {
    if (!tab) return;

    // Clear and restore the chat pane
    const chatHistoryArea = document.getElementById('chat-history');
    if (chatHistoryArea) {
      chatHistoryArea.innerHTML = '';
      const restoredChat = Array.isArray(tab.chatHistory) ? tab.chatHistory : [];
      if (window.APP_STATE) window.APP_STATE.chatHistory = [...restoredChat];
      restoredChat.forEach(msg => {
        if (msg && msg.content != null) {
          if (typeof appendChatMessageToUI === 'function') {
            appendChatMessageToUI(msg.role === 'user' ? 'user' : 'ai', msg.content, false);
          }
        }
      });
      if (restoredChat.length === 0) {
        // Keep this in sync with index.html's own #chat-empty-state markup.
        // This used to be missing the suggestion-chips block that the static
        // HTML has, so on load the page would briefly show the full empty
        // state (from index.html) and then, the moment tab restoration ran,
        // silently swap it for this shorter version — chips popping in and
        // then disappearing a beat later, which is what looked like
        // something overlapping/duplicating in the AI panel during refresh.
        chatHistoryArea.innerHTML = `
          <div id="chat-empty-state" class="chat-empty-state">
            <span class="chat-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7A2.5 2.5 0 0 1 17.5 15H11l-4.5 4v-4.6A2.5 2.5 0 0 1 4 12.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            </span>
            <div class="chat-empty-title">AI Chat</div>
            <div class="chat-empty-desc">Ask the AI to create notes, generate a PDF, or edit this document. Type below to get started.</div>
          </div>`;
      }
    }

    const html = tab.htmlContent || this._createBlankState().htmlContent;
    if (typeof setDocumentHTMLAndPaginate === 'function') {
      try {
        setDocumentHTMLAndPaginate(html, false);
      } catch (e) {
        console.error('Tab switch: failed to paginate document content', e);
      }
    }
    const docContainer = document.getElementById('document-view-container');
    if (docContainer) docContainer.scrollTop = tab.scrollPosition || 0;

    if (window.APP_STATE) {
      window.APP_STATE.attachedFiles = tab.attachedFiles && typeof tab.attachedFiles === 'object' ? { ...tab.attachedFiles } : {};
      window.APP_STATE.fileObjects = TAB_FILE_OBJECTS.has(tab.id) ? TAB_FILE_OBJECTS.get(tab.id) : {};
    }
    if (typeof renderAttachmentBar === 'function') renderAttachmentBar();

    if (window.HISTORY) {
      window.HISTORY.undoStack = Array.isArray(tab.undoStack) ? [...tab.undoStack] : [];
      window.HISTORY.redoStack = Array.isArray(tab.redoStack) ? [...tab.redoStack] : [];
    }

    if (window.APP_STATE) {
      window.APP_STATE.projectVersion = tab.projectVersion || 0;
    }

    if (tab.theme && window.APP_STATE) {
      window.APP_STATE.theme = tab.theme;
      if (typeof applyCurrentTheme === 'function') applyCurrentTheme();
    }
    if (tab.pdfVisualFormat && typeof applyPDFVisualFormat === 'function') {
      window.APP_STATE.pdfVisualFormat = tab.pdfVisualFormat;
      applyPDFVisualFormat(tab.pdfVisualFormat);
    }
    if (tab.pdfTextFormat && typeof applyPDFTextFormat === 'function') {
      window.APP_STATE.pdfTextFormat = tab.pdfTextFormat;
      applyPDFTextFormat(tab.pdfTextFormat);
    }
    if (tab.pdfLanguageFormat && typeof applyPDFLanguageFormat === 'function') {
      window.APP_STATE.pdfLanguageFormat = tab.pdfLanguageFormat;
      applyPDFLanguageFormat(tab.pdfLanguageFormat);
    }
    if (tab.photocopyMode) {
      document.body.classList.add('photocopy-mode');
    } else {
      document.body.classList.remove('photocopy-mode');
    }
    if (typeof updateModeButtonText === 'function') updateModeButtonText();
    if (typeof applyMonochromeDocumentStyles === 'function') applyMonochromeDocumentStyles();

    if (window.APP_STATE) window.APP_STATE.selectedPage = null;
    if (window.APP_STATE) window.APP_STATE.selectedCommands = [];
    if (typeof renderSelectedCommandChips === 'function') renderSelectedCommandChips();
    if (typeof closeAtCommandMenu === 'function') closeAtCommandMenu();
    if (typeof forceRenderAllEquations === 'function') forceRenderAllEquations();

    if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
  },

  _persist() {
    try {
      if (this.activeId) this._captureCurrentState(this.activeId);

      const compactTabs = this.tabs.map(t => {
        const attachedFiles = {};
        const sourceFiles = (t.attachedFiles && typeof t.attachedFiles === 'object') ? t.attachedFiles : {};
        Object.entries(sourceFiles).forEach(([id, f]) => {
          if (!f) return;
          const rawContent = String(f.content || '');
          const maxPersistChars = 18000;
          attachedFiles[id] = {
            name: f.name || 'file',
            content: rawContent.length > maxPersistChars ? rawContent.slice(0, maxPersistChars) + '\n...[PERSISTENCE PREVIEW ONLY]' : rawContent,
            sent: !!f.sent,
            status: f.status || (rawContent ? 'ready' : 'queued'),
            sourceMode: 'ocr',
            order: Number.isFinite(f.order) ? f.order : 0,
            needsVision: !!f.needsVision,
            visionDataUrls: Array.isArray(f.visionDataUrls) ? f.visionDataUrls : []
          };
        });

        return {
          id: t.id,
          name: t.name || 'Untitled',
          htmlContent: t.htmlContent || '',
          attachedFiles,
          selectedPage: t.selectedPage ?? null,
          projectVersion: t.projectVersion || 0,
          scrollPosition: t.scrollPosition || 0,
          theme: t.theme || 'light',
          pdfVisualFormat: t.pdfVisualFormat || window.APP_STATE?.pdfVisualFormat || 'default',
          pdfTextFormat: t.pdfTextFormat || window.APP_STATE?.pdfTextFormat || 'default',
          pdfLanguageFormat: t.pdfLanguageFormat || window.APP_STATE?.pdfLanguageFormat || 'default',
          photocopyMode: !!t.photocopyMode
        };
      });

      const data = {
        version: 2,
        compact: true,
        tabs: compactTabs,
        activeId: this.activeId,
        nextId: this.nextId
      };

      const payload = JSON.stringify(data);
      const approxMB = payload.length / (1024 * 1024);
      if (approxMB > 3.6) {
        this._persistEmergencyMetadata();
        return;
      }

      localStorage.setItem(TAB_STORAGE_KEY, payload);
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    } catch (e) {
      console.warn('Failed to persist compact tabs:', e);
      this._persistEmergencyMetadata();
    }
  },

  _persistEmergencyMetadata() {
    try {
      const data = {
        version: 3,
        compact: true,
        tabs: this.tabs.map(t => ({
          id: t.id,
          name: t.name || 'Untitled',
          htmlContent: t.id === this.activeId ? String(t.htmlContent || '').slice(0, 180000) : '',
          selectedPage: t.selectedPage ?? null,
          projectVersion: t.projectVersion || 0,
          scrollPosition: t.scrollPosition || 0,
          theme: t.theme || 'light',
          pdfVisualFormat: t.pdfVisualFormat || 'default',
          pdfTextFormat: t.pdfTextFormat || 'default',
          pdfLanguageFormat: t.pdfLanguageFormat || 'default',
          photocopyMode: !!t.photocopyMode
        })),
        activeId: this.activeId,
        nextId: this.nextId
      };
      const payload = JSON.stringify(data);
      localStorage.setItem(TAB_STORAGE_KEY, payload);
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    } catch (e2) {
      console.warn('Emergency tab persistence skipped because browser storage is unavailable:', e2);
    }
  },

  _restore() {
    try {
      const raw = localStorage.getItem(TAB_STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data.tabs || !Array.isArray(data.tabs) || data.tabs.length === 0) return false;

      this.tabs = data.tabs.map(t => ({
        id: t.id || this._generateId(),
        name: t.name || 'Untitled',
        htmlContent: t.htmlContent || this._createBlankState().htmlContent,
        chatHistory: Array.isArray(t.chatHistory) ? t.chatHistory : [],
        attachedFiles: Object.fromEntries(Object.entries(t.attachedFiles || {}).map(([id, f]) => [id, { ...(f || {}), sourceMode: 'ocr' }])),
        undoStack: t.undoStack || [],
        redoStack: t.redoStack || [],
        selectedPage: t.selectedPage || null,
        projectVersion: t.projectVersion || 0,
        scrollPosition: t.scrollPosition || 0,
        theme: t.theme || 'light',
        pdfVisualFormat: t.pdfVisualFormat || 'default',
        pdfTextFormat: t.pdfTextFormat || 'default',
        pdfLanguageFormat: t.pdfLanguageFormat || 'default',
        photocopyMode: t.photocopyMode !== undefined ? t.photocopyMode : false
      }));

      this.activeId = data.activeId || (this.tabs[0] ? this.tabs[0].id : null);
      this.nextId = data.nextId || this.tabs.length + 1;
      return true;
    } catch (e) { return false; }
  },

  createTab(name, htmlContent, stateOverrides, insertAtStart) {
    const state = stateOverrides || this._createBlankState();
    const tab = {
      id: this._generateId(),
      name: name || this._getTabNameFromHtml(state.htmlContent) || 'Untitled',
      htmlContent: htmlContent || state.htmlContent || this._createBlankState().htmlContent,
      chatHistory: state.chatHistory ? [...state.chatHistory] : [],
      attachedFiles: state.attachedFiles ? { ...state.attachedFiles } : {},
      undoStack: state.undoStack ? [...state.undoStack] : [],
      redoStack: state.redoStack ? [...state.redoStack] : [],
      selectedPage: state.selectedPage || null,
      projectVersion: state.projectVersion || 0,
      scrollPosition: state.scrollPosition || 0,
      theme: state.theme || window.APP_STATE?.theme || 'light',
      photocopyMode: state.photocopyMode !== undefined ? state.photocopyMode : document.body.classList.contains('photocopy-mode')
    };
    if (insertAtStart === false) {
      this.tabs.push(tab);
    } else {
      this.tabs.unshift(tab);
    }
    this._persist();
    return tab;
  },

  duplicateActiveTab() {
    if (this.tabs.length === 0) {
      const tab = this.createTab('Untitled');
      this.switchTo(tab.id);
      return;
    }
    const active = this.getActive();
    if (!active) {
      const tab = this.createTab('Untitled');
      this.switchTo(tab.id);
      return;
    }
    this._captureCurrentState(this.activeId);
    const newTab = this.createTab(
      active.name + ' (copy)',
      active.htmlContent, {
        htmlContent: active.htmlContent,
        chatHistory: [],
        attachedFiles: {},
        undoStack: [],
        redoStack: [],
        selectedPage: null,
        projectVersion: 0,
        scrollPosition: 0,
        theme: active.theme || window.APP_STATE?.theme || 'light',
        photocopyMode: active.photocopyMode !== undefined ? active.photocopyMode : document.body.classList.contains('photocopy-mode')
      }
    );
    this.switchTo(newTab.id);
    if (typeof displayToastNotification === 'function') displayToastNotification(`✅ New tab: "${newTab.name}"`);
  },

  closeAllTabsWithConfirm() {
    this.tabs = [];
    this.activeId = null;
    TAB_FILE_OBJECTS.clear();
    if (window.APP_STATE) {
      window.APP_STATE.activeSessionId = (window.APP_STATE.activeSessionId || 0) + 1;
      window.APP_STATE.fileObjects = {};
    }

    const state = this._createBlankState();
    const tab = this.createTab('Untitled', state.htmlContent, state, false);
    TAB_FILE_OBJECTS.set(tab.id, {});
    this.activeId = tab.id;
    this._loadStateIntoUI(tab);
    this._persist();
    this.renderTabBar();
    if (typeof displayToastNotification === 'function') displayToastNotification("✅ All tabs closed");
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => { if (typeof fitEditorPagesToScreen === 'function') fitEditorPagesToScreen(); });
    }
  },

  createBlankTab() {
    if (window.APP_STATE) {
      window.APP_STATE.activeSessionId = (window.APP_STATE.activeSessionId || 0) + 1;
      window.APP_STATE.fileObjects = {};
    }
    const state = this._createBlankState();
    const tab = this.createTab('Blank', state.htmlContent, state);
    TAB_FILE_OBJECTS.set(tab.id, {});
    this.switchTo(tab.id);
    if (typeof displayToastNotification === 'function') displayToastNotification(`✅ New blank tab`);
  },

  switchTo(tabId) {
    if (!tabId) return;
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    if (this.activeId) {
      this._captureCurrentState(this.activeId);
    }

    if (window.APP_STATE) {
      window.APP_STATE.activeSessionId = (window.APP_STATE.activeSessionId || 0) + 1;
    }

    this.activeId = tabId;
    this._loadStateIntoUI(tab);
    this._persist();
    this.renderTabBar();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => { if (typeof fitEditorPagesToScreen === 'function') fitEditorPagesToScreen(); });
    }
    if (typeof isMobileDeviceLayout === 'function' && isMobileDeviceLayout()) {
      const currentView = window.APP_STATE?.currentMobileView || 'editor';
      if (typeof setMobileView === 'function') setMobileView(currentView);
    }
  },

  deleteTab(tabId) {
    if (this.tabs.length <= 1) {
      if (typeof displayToastNotification === 'function') {
        displayToastNotification("⚠️ Cannot delete the last tab. Start a new document if you need a fresh one.");
      }
      return;
    }
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;
    if (!confirm(`Delete tab "${tab.name}"? This will discard all its content.`)) return;

    const wasActive = this.activeId === tabId;
    const index = this.tabs.indexOf(tab);
    this.tabs.splice(index, 1);

    if (wasActive) {
      const newActive = this.tabs[Math.min(index, this.tabs.length - 1)];
      this.activeId = newActive.id;
      this._loadStateIntoUI(newActive);
    } else if (this.activeId === tabId) {
      this.activeId = this.tabs[0] ? this.tabs[0].id : null;
      if (this.activeId) this._loadStateIntoUI(this.tabs[0]);
    }
    this._persist();
    this.renderTabBar();
    if (typeof displayToastNotification === 'function') displayToastNotification(`🗑️ Tab "${tab.name}" deleted`);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => { if (typeof fitEditorPagesToScreen === 'function') fitEditorPagesToScreen(); });
    }
  },

  getActive() {
    if (!this.activeId) return this.tabs[0] || null;
    return this.tabs.find(t => t.id === this.activeId) || this.tabs[0] || null;
  },

  ensureTab() {
    if (this.tabs.length === 0) {
      const tab = this.createTab('Untitled');
      this.activeId = tab.id;
      this._loadStateIntoUI(tab);
      this._persist();
      return tab;
    }
    return this.getActive();
  },

  renderTabBar() {
    const bar = document.getElementById('tab-bar');
    if (!bar) return;
    const active = this.getActive();

    bar.innerHTML = '';

    // "New tab" button - fixed on the left
    const newBtn = document.createElement('button');
    newBtn.id = 'tab-new-btn';
    newBtn.innerHTML = '▢';
    newBtn.title = 'New tab (duplicate current)';
    newBtn.setAttribute('aria-label', 'New tab');
    newBtn.onclick = () => this.duplicateActiveTab();
    bar.appendChild(newBtn);

    const scrollWrap = document.createElement('div');
    scrollWrap.id = 'tab-items-scroll';

    this.tabs.forEach(tab => {
      const isActive = tab.id === (active ? active.id : null);
      const item = document.createElement('div');
      item.className = 'tab-item' + (isActive ? ' active' : '');
      item.setAttribute('data-tab-id', tab.id);
      item.title = tab.name;

      const dot = document.createElement('span');
      dot.className = 'tab-dot';
      item.appendChild(dot);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'tab-name';
      nameSpan.textContent = tab.name || 'Untitled';
      item.appendChild(nameSpan);

      if (this.tabs.length > 1) {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'tab-close';
        closeBtn.innerHTML = typeof renderCommandIcon === 'function' ? renderCommandIcon('close') : '×';
        closeBtn.setAttribute('aria-label', `Close tab ${tab.name || 'Untitled'}`);
        closeBtn.title = 'Close tab';
        closeBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.deleteTab(tab.id);
        };
        item.appendChild(closeBtn);
      }

      item.onclick = (e) => {
        if (e.target.closest('.tab-close')) return;
        if (tab.id !== (active ? active.id : null)) {
          this.switchTo(tab.id);
        }
      };

      scrollWrap.appendChild(item);
    });

    bar.appendChild(scrollWrap);

    const fab = document.getElementById('topbar-newtab-fab-btn');
    if (fab) {
      fab.style.display = (typeof isMobileDeviceLayout === 'function' && isMobileDeviceLayout()) ? 'flex' : 'none';
    }
  },

  init() {
    if (this._initialized) return;
    this._initialized = true;

    const restored = this._restore();

    if (!restored || this.tabs.length === 0) {
      const currentHtml = typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '';
      const state = this._createBlankState();
      state.htmlContent = currentHtml || state.htmlContent;
      state.chatHistory = window.APP_STATE?.chatHistory ? [...window.APP_STATE.chatHistory] : [];
      state.attachedFiles = { ...(window.APP_STATE?.attachedFiles || {}) };
      state.undoStack = window.HISTORY?.undoStack ? [...window.HISTORY.undoStack] : [];
      state.redoStack = window.HISTORY?.redoStack ? [...window.HISTORY.redoStack] : [];
      state.projectVersion = window.APP_STATE?.projectVersion || 0;
      state.theme = window.APP_STATE?.theme || 'light';
      state.photocopyMode = document.body.classList.contains('photocopy-mode');

      const tab = this.createTab(
        this._getTabNameFromHtml(state.htmlContent) || 'Untitled',
        state.htmlContent,
        state,
        false
      );
      this.activeId = tab.id;
      this._persist();
      this._loadStateIntoUI(tab);
    } else {
      const active = this.getActive();
      if (active) {
        this._loadStateIntoUI(active);
      } else {
        const tab = this.tabs[0];
        this.activeId = tab.id;
        this._loadStateIntoUI(tab);
      }
    }

    this.renderTabBar();
    const fab = document.getElementById('topbar-newtab-fab-btn');
    if (fab) {
      fab.style.display = (typeof isMobileDeviceLayout === 'function' && isMobileDeviceLayout()) ? 'flex' : 'none';
    }
  }
};

// ===== TAB-AWARE SAVE/LOAD FUNCTIONS =====
window.saveProjectFile = function() {
  if (TAB_MANAGER.activeId) TAB_MANAGER._captureCurrentState(TAB_MANAGER.activeId);
  TAB_MANAGER._persist();

  const projectData = {
    htmlContent: typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '',
    chatHistory: window.APP_STATE?.chatHistory || [],
    theme: window.APP_STATE?.theme || 'light',
    photocopyMode: document.body.classList.contains('photocopy-mode'),
    attachedFiles: window.APP_STATE?.attachedFiles || {},
    selectedPage: window.APP_STATE?.selectedPage || null,
    projectVersion: window.APP_STATE?.projectVersion || 0,
    tabId: TAB_MANAGER.activeId,
    tabName: TAB_MANAGER.getActive() ? TAB_MANAGER.getActive().name : 'Untitled'
  };
  const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = (projectData.tabName || 'Document') + '.aipdf';
  link.click();
  URL.revokeObjectURL(link.href);
  if (typeof displayToastNotification === 'function') {
    displayToastNotification(`💾 Saved Project (tab: ${projectData.tabName})`);
  }
};

window.loadProjectFromFile = function(fileList) {
  if (!fileList || fileList.length === 0) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const parsedData = JSON.parse(event.target.result);
      const state = TAB_MANAGER._createBlankState();
      state.htmlContent = parsedData.htmlContent || state.htmlContent;
      state.chatHistory = Array.isArray(parsedData.chatHistory) ? parsedData.chatHistory : [];
      state.attachedFiles = parsedData.attachedFiles && typeof parsedData.attachedFiles === 'object' ? parsedData.attachedFiles : {};
      state.selectedPage = parsedData.selectedPage || null;
      state.projectVersion = Number.isFinite(parsedData.projectVersion) ? parsedData.projectVersion : 0;
      state.theme = parsedData.theme || 'light';
      state.photocopyMode = !!parsedData.photocopyMode;
      state.undoStack = [];
      state.redoStack = [];

      const tab = TAB_MANAGER.createTab(
        parsedData.tabName || 'Loaded',
        state.htmlContent,
        state
      );
      TAB_MANAGER.switchTo(tab.id);
      if (typeof displayToastNotification === 'function') {
        displayToastNotification(`📂 Loaded project into new tab: "${tab.name}"`);
      }
    } catch (e) {
      if (typeof displayToastNotification === 'function') {
        displayToastNotification('Error Invalid project format.');
      }
    }
  };
  if (fileList[0]) reader.readAsText(fileList[0]);
  const input = document.getElementById('project-load-input');
  if (input) input.value = '';
};

// ===== START NEW PROJECT =====
function startNewProject() {
  if (TAB_MANAGER.tabs.length > 0) {
    const html = typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '';
    const hasContent = html && !html.includes('Start typing here');
    if (hasContent && !confirm('Start a new blank document? This will create a new tab with a fresh document.')) {
      return;
    }
  }
  TAB_MANAGER.createBlankTab();
  if (typeof displayToastNotification === 'function') displayToastNotification("✅ New blank tab created!");
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => { if (typeof fitEditorPagesToScreen === 'function') fitEditorPagesToScreen(); });
  }
}

// ===== LEGACY COMPATIBILITY =====
window.saveStateToLocalStorage = function() {
  // Legacy compatibility shim - TAB_MANAGER is the single persistence owner
  return true;
};// ============================================================
// WINDOW EXPOSURE – Tab Manager
// ============================================================
window.TAB_MANAGER = TAB_MANAGER;
window.startNewProject = startNewProject;
window.saveProjectFile = saveProjectFile;
window.loadProjectFromFile = loadProjectFromFile;
// TAB_MANAGER এর মেথডগুলো ইতিমধ্যেই window.TAB_MANAGER এর মাধ্যমে অ্যাক্সেসযোগ্য