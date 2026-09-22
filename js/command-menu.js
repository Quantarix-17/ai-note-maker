// ========================================================================
// COMMAND MENU - @ command system for intent selection and chips
// ========================================================================

// ===== STATE =====
const AT_MENU_STATE = {
  open: false,
  mode: 'button',
  triggerStart: -1,
  highlightIndex: 0,
  section: 'commands',
  filtered: getOrderedAtCommands(AT_COMMANDS),
  query: '',
  expandedGroup: null
};

// ===== COMMANDS TAB — INTENT GROUPS =====
// The 9 intent-category commands used to render as one flat list with no
// distinction between "pick one of these" (create_pdf/add/edit/refine/
// refine_equation/redesign_diagram/beautify/chat) and "fine-tune the pick"
// (long_pdf/short_pdf/page/language/canvas) — everything looked like the
// same kind of button. Grouping close relatives under one card (with the
// real, underlying commands one tap deeper) cuts the top-level choice down
// to 4 without touching what each command actually does or how app.js
// tells them apart — every click here still calls the exact same
// chooseAtCommandFromMenu(realCommand) as before, just from a different
// entry point. refine_pagination is intentionally not shown at all: it is
// meant to be a background auto-fix, not something someone picks by hand.
const AT_UI_INTENT_GROUPS = [
  { key: 'chat', label: 'Chat', icon: 'chat', members: ['chat'] },
  { key: 'create', label: 'Create', icon: 'document', members: ['create_pdf', 'add'] },
  { key: 'edit_fix', label: 'Edit / fix', icon: 'edit', members: ['edit', 'refine', 'refine_equation', 'redesign_diagram'] },
  { key: 'beautify', label: 'Beautify', icon: 'beautify', members: ['beautify'] }
];
const AT_SUBSCOPE_LABELS = {
  create_pdf: 'New document',
  add: 'Add to existing',
  edit: 'Everything',
  refine: 'Text',
  refine_equation: 'Equation',
  redesign_diagram: 'Diagram'
};
const AT_RECENTS_KEY = 'atCommandRecents_v1';
function _recordRecentAtCommand(id) {
  try {
    let recents = JSON.parse(localStorage.getItem(AT_RECENTS_KEY) || '[]');
    if (!Array.isArray(recents)) recents = [];
    recents = [id, ...recents.filter(x => x !== id)].slice(0, 5);
    localStorage.setItem(AT_RECENTS_KEY, JSON.stringify(recents));
  } catch (_) { /* best-effort only */ }
}
function _getRecentAtCommandIds() {
  try {
    const recents = JSON.parse(localStorage.getItem(AT_RECENTS_KEY) || '[]');
    return Array.isArray(recents) ? recents : [];
  } catch (_) { return []; }
}
// A click anywhere in the new Commands tab (grid card, sub-scope chip,
// modifier chip, recent chip) goes through this one place so selection
// and recent-tracking always stay in sync, instead of duplicating both
// calls at every click site.
function _chooseAtCommandFromNewUI(cmd) {
  if (!cmd || isAtCommandDisabled(cmd)) return;
  _recordRecentAtCommand(cmd.id);
  AT_MENU_STATE.expandedGroup = null;
  chooseAtCommandFromMenu(cmd);
}

// ===== DEBUG LOGGING (toggle via localStorage key 'atCommandDebug') =====
function _atCommandDebug() {
  try { return localStorage.getItem('atCommandDebug') === '1'; } catch (_) { return false; }
}
function _atCommandLog(label, data) {
  if (!_atCommandDebug()) return;
  const el = document.getElementById('at-command-debug');
  if (!el) return;
  const ts = new Date().toLocaleTimeString();
  const text = `[${ts}] ${label}: ${typeof data === 'object' ? JSON.stringify(data) : data}`;
  el.textContent = (el.textContent || '') + '\n' + text;
  // Auto-scroll to bottom
  el.scrollTop = el.scrollHeight;
  console.log('[@Menu]', label, data);
}
window._atCommandLog = _atCommandLog;
window._atCommandDebug = _atCommandDebug;

// ===== OPEN / CLOSE =====
function toggleAtCommandMenu() {
  _atCommandLog('toggle', { open: AT_MENU_STATE.open, mode: AT_MENU_STATE.mode });
  if (AT_MENU_STATE.open) {
    closeAtCommandMenu();
  } else {
    openAtCommandMenu('button');
    if (!isMobilePreviewMode()) {
      const ta = document.getElementById('chat-input-textarea');
      if (ta) ta.focus();
    }
  }
}

function openAtCommandMenu(mode) {
  AT_MENU_STATE.open = true;
  AT_MENU_STATE.mode = mode || 'button';
  AT_MENU_STATE.filtered = getOrderedAtCommands(AT_COMMANDS);
  AT_MENU_STATE.highlightIndex = 0;
  AT_MENU_STATE.query = '';
  AT_MENU_STATE.expandedGroup = null;
  const btn = document.getElementById('at-command-btn');
  if (btn) btn.classList.add('active');
  const menu = document.getElementById('at-command-menu');
  const backdrop = document.getElementById('at-command-menu-backdrop');
  if (menu) menu.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
  renderAtCommandMenuList();
  _atCommandLog('open', { mode: AT_MENU_STATE.mode, filteredCount: AT_MENU_STATE.filtered.length, section: AT_MENU_STATE.section });
}

function closeAtCommandMenu() {
  AT_MENU_STATE.open = false;
  AT_MENU_STATE.mode = 'button';
  AT_MENU_STATE.triggerStart = -1;
  const btn = document.getElementById('at-command-btn');
  if (btn) btn.classList.remove('active');
  const menu = document.getElementById('at-command-menu');
  const backdrop = document.getElementById('at-command-menu-backdrop');
  if (menu) menu.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
  _atCommandLog('close', {});
}

function setAtCommandMenuSection(section) {
  if (!['commands', 'theme', 'format'].includes(section)) return;
  AT_MENU_STATE.section = section;
  renderAtCommandMenuList();
  _atCommandLog('section', { section });
}

// ===== KEYBOARD / POINTER DISMISSAL =====
if (!window.__atCommandDismissalInstalled) {
  window.__atCommandDismissalInstalled = true;
  document.addEventListener('keydown', (e) => {
    if (!AT_MENU_STATE.open) return;
    if (e.code === 'Space' || e.key === ' ') {
      const target = e.target;
      const isMenuControl = target && (target.closest?.('#at-command-menu') || target.closest?.('#at-command-btn'));
      if (!isMenuControl) {
        e.preventDefault();
        e.stopPropagation();
        closeAtCommandMenu();
      }
    }
  }, true);
  document.addEventListener('pointerdown', (e) => {
    if (!AT_MENU_STATE.open) return;
    const target = e.target;
    if (!target || target.closest?.('#at-command-menu') || target.closest?.('#at-command-btn')) return;
    closeAtCommandMenu();
  }, true);
}

// ===== COMMAND HELPERS =====
function getCommandAutoParent(cmd) {
  return cmd && cmd.autoParent ? getAtCommandById(cmd.autoParent) : null;
}

function hasSelectedCommand(id) {
  if (!window.APP_STATE) return false;
  return window.APP_STATE.selectedCommands.some(c => c.id === id);
}

function hasDocumentContentForAtCommands() {
  try {
    const pages = Array.from(document.querySelectorAll('.doc-page-canvas'));
    if (!pages.length) return false;
    const text = pages.map(p => (p.innerText || '').trim()).join('\n').trim();
    return !!text && !/^Start typing here\s*$/i.test(text);
  } catch (e) {
    return false;
  }
}

function getPrimaryIntent(sel = window.APP_STATE?.selectedCommands || []) {
  return sel.find(c => c.category === 'intent' && !['chat'].includes(c.id) && !c.implicit) ||
         sel.find(c => c.category === 'intent' && !['chat'].includes(c.id)) || null;
}

function isDocumentOperationIntent(id) {
  return ['add', 'edit', 'refine', 'refine_equation', 'redesign_diagram', 'beautify', 'refine_pagination'].includes(id);
}

// ===== DEPENDENCY MANAGEMENT (no exam/MCQ logic) =====
function ensureCommandDependencies(cmd, { silent = false } = {}) {
  if (!cmd) return false;
  if (!window.APP_STATE) return false;
  const sel = window.APP_STATE.selectedCommands;
  const hasChat = sel.some(c => c.id === 'chat');

  if (cmd.id === 'chat') {
    window.APP_STATE.selectedCommands = [{
      id: 'chat', category: 'intent', label: 'Chat', icon: 'chat', param: null, implicit: false
    }];
    return true;
  }
  if (hasChat) {
    if (!silent) showAtCommandToast('Remove @Chat before selecting a document command.');
    return false;
  }

  // No exam/MCQ auto-parent logic; only handle create_pdf parent for length commands
  if (cmd.requiresDocument && !hasDocumentContentForAtCommands()) {
    if (!silent) showAtCommandToast(`@${cmd.label} requires an existing document first.`);
    return false;
  }

  const parent = getCommandAutoParent(cmd);
  if (parent && !sel.some(c => c.id === parent.id)) {
    window.APP_STATE.selectedCommands.push({
      id: parent.id, category: parent.category, label: parent.label,
      icon: parent.icon, param: null, implicit: true
    });
    if (!silent) displayToastNotification(`Settings @${parent.label} enabled for @${cmd.label}`);
  }
  return true;
}

function normalizeAtCommandSelection() {
  if (!window.APP_STATE) return;
  const sel = window.APP_STATE.selectedCommands;
  const primary = getPrimaryIntent(sel);
  if (!primary) return;
  const parent = getCommandAutoParent(primary);
  if (parent && !sel.some(c => c.id === parent.id)) {
    sel.unshift({
      id: parent.id, category: parent.category, label: parent.label, icon: parent.icon,
      param: null, implicit: true
    });
  }
}

function getAtCommandDisabledReason(cmd) {
  if (!window.APP_STATE) return 'Application state unavailable';
  const sel = window.APP_STATE.selectedCommands;
  const hasChat = sel.some(c => c.id === 'chat');
  const primary = getPrimaryIntent(sel);
  const hasExistingDocument = hasDocumentContentForAtCommands();

  if (hasChat) return cmd.id === 'chat' ? null : 'Remove @Chat first — @Chat is standalone';
  if (cmd.id === 'chat' && sel.length > 0) return 'Remove the current command(s) first — @Chat is standalone';

  if (cmd.category === 'intent' && !['chat'].includes(cmd.id)) {
    if (primary && primary.id !== cmd.id) {
      return `Remove @${primary.label} first — only one primary action is allowed`;
    }
    if (cmd.requiresDocument && !hasExistingDocument) return 'Create/open a document first';
  }

  if (cmd.category === 'length') {
    if (!sel.some(c => c.id === 'create_pdf')) return 'Select @Create PDF first';
    const other = sel.find(c => c.category === 'length' && c.id !== cmd.id);
    if (other) return `Remove @${other.label} first — choose one length`;
  }

  if (cmd.category === 'target') {
    if (!hasExistingDocument) return 'Create/open a document first';
    if (!primary || !isDocumentOperationIntent(primary.id)) {
      return 'Select @Edit, @Refine, @Refine Equation, @Redesign Diagram, @Beautify, or @Refine Pagination first';
    }
  }

  if (cmd.category === 'language') {
    if (!primary) return 'Select @Create PDF or a document-editing action first';
    const same = sel.find(c => c.category === 'language' && c.id !== cmd.id);
    if (same) return `Remove @${same.label} first`;
  }

  if (cmd.category === 'visual') {
    if (!sel.some(c => c.id === 'create_pdf')) return 'Select @Create PDF first';
  }

  if (hasChat && sel.length > 0) {
    if (cmd.id === 'chat') return null;
    return 'Remove @Chat first — @Chat is standalone';
  }

  return null;
}

function isAtCommandDisabled(cmd) {
  if (!cmd) return true;
  return !!getAtCommandDisabledReason(cmd);
}

// ===== MENU ITEM SELECTION =====
function chooseAtCommandFromMenu(cmd) {
  const ta = document.getElementById('chat-input-textarea');
  if (!cmd) return;
  const disabledReason = getAtCommandDisabledReason(cmd);
  if (disabledReason) {
    _atCommandLog('choose-blocked', { id: cmd.id, reason: disabledReason });
    showAtCommandToast(disabledReason);
    return;
  }

  _atCommandLog('choose-start', { id: cmd.id, label: cmd.label, hasParam: !!cmd.hasParam, mode: AT_MENU_STATE.mode });
  if (cmd && !cmd.hasParam && cmd.id !== 'edit' && !ensureCommandDependencies(cmd, { silent: false })) return;

  if (ta && AT_MENU_STATE.mode === 'type' && AT_MENU_STATE.triggerStart > -1) {
    const cursorPos = ta.selectionStart;
    const before = ta.value.slice(0, AT_MENU_STATE.triggerStart);
    const after = ta.value.slice(cursorPos);
    ta.value = before + after;
    ta.selectionStart = ta.selectionEnd = before.length;
  }

  // Special handling for @edit: open page selection modal if no pageTarget yet
  if (cmd.id === 'edit') {
    if (!ensureCommandDependencies(cmd, { silent: false })) return;
    const existing = window.APP_STATE.selectedCommands.find(c => c.id === 'edit');
    if (existing && existing.param) {
      attemptAddAtCommand(cmd, existing.param);
      renderAtCommandMenuList();
      if (ta) { autoResizeTextarea(ta);
        if (!isMobilePreviewMode()) ta.focus(); }
      return;
    }
    openEditPageModal().then(pages => {
      if (pages && pages.length > 0) {
        const pageString = pages.join(' ');
        const existingCmd = window.APP_STATE.selectedCommands.find(c => c.id === 'edit');
        if (existingCmd) {
          existingCmd.param = pageString;
        } else {
          attemptAddAtCommand(cmd, pageString);
        }
        renderSelectedCommandChips();
        renderAtCommandMenuList();
        if (ta) { autoResizeTextarea(ta);
          if (!isMobilePreviewMode()) ta.focus(); }
      } else {
        if (ta) ta.focus();
      }
    });
    return;
  }

  if (cmd.hasParam) {
    if (!ensureCommandDependencies(cmd, { silent: false })) return;
    if (ta) {
      const pos = ta.selectionStart;
      const before = ta.value.slice(0, pos);
      const after = ta.value.slice(pos);
      ta.value = before + cmd.insertText + after;
      const newPos = pos + cmd.insertText.length;
      ta.selectionStart = ta.selectionEnd = newPos;
      autoResizeTextarea(ta);
    }
    closeAtCommandMenu();
    if (cmd.id === 'refine_pagination') {
      displayToastNotification('Please type only the page number in English digits (e.g. 5)');
    }
    if (ta) ta.focus();
    return;
  }

  attemptAddAtCommand(cmd, null);
  if (cmd.id === 'chat') {
    closeAtCommandMenu();
  } else {
    const menu = document.getElementById('at-command-menu');
    const preservedScrollTop = menu ? menu.scrollTop : 0;
    renderAtCommandMenuList();
    requestAnimationFrame(() => {
      const currentMenu = document.getElementById('at-command-menu');
      if (currentMenu) currentMenu.scrollTop = preservedScrollTop;
      AT_MENU_STATE.highlightIndex = 0;
    });
  }
  if (ta) {
    autoResizeTextarea(ta);
    if (!isMobilePreviewMode() || AT_MENU_STATE.mode === 'type') ta.focus();
  }
}

function showAtCommandToast(msg) {
  displayToastNotification(msg);
  const btn = document.getElementById('at-command-btn');
  if (btn) {
    btn.style.animation = 'none';
    void btn.offsetWidth;
    btn.style.animation = 'shakeError 0.4s var(--ease)';
  }
}

function shakeChatInputField() {
  const ta = document.getElementById('chat-input-textarea');
  if (!ta) return;
  ta.classList.remove('shake-error');
  void ta.offsetWidth;
  ta.classList.add('shake-error');
  setTimeout(() => ta.classList.remove('shake-error'), 450);
}

// ===== ADD / REMOVE COMMANDS =====
function attemptAddAtCommand(cmd, param, options = {}) {
  if (!cmd || !window.APP_STATE) return false;
  let sel = window.APP_STATE.selectedCommands;

  if (cmd.id === 'chat') {
    const hasNonChat = sel.some(c => c.id !== 'chat');
    if (hasNonChat) {
      showAtCommandToast('@Chat cannot be combined with document commands. Remove the current commands first.');
      return false;
    }
    if (!sel.some(c => c.id === 'chat')) {
      sel.push({ id: cmd.id, category: cmd.category, label: cmd.label, icon: cmd.icon, param: null, implicit: false });
    }
    renderSelectedCommandChips();
    return true;
  }

  if (sel.some(c => c.id === 'chat')) {
    showAtCommandToast('@Chat cannot be combined with document commands.');
    return false;
  }

  if (!ensureCommandDependencies(cmd, { silent: options.silentParent !== false })) return false;

  sel = window.APP_STATE.selectedCommands;

  if (cmd.category === 'intent') {
    const existingPrimary = sel.find(c => c.category === 'intent' && c.id !== cmd.id && c.id !== cmd.autoParent);
    if (existingPrimary) {
      window.APP_STATE.selectedCommands = sel.filter(c => c.id !== existingPrimary.id);
      sel = window.APP_STATE.selectedCommands;
    }
  }

  if (cmd.category !== 'content') {
    const existingSameCategory = sel.find(c => c.category === cmd.category && c.id !== cmd.id && !c.implicit);
    if (existingSameCategory) {
      const idx = sel.indexOf(existingSameCategory);
      if (idx > -1) sel.splice(idx, 1);
      displayToastNotification(`Replaced '@${existingSameCategory.label}' with '@${cmd.label}'`);
    }
  }

  const already = sel.find(c => c.id === cmd.id);
  const normalizedParam = param != null ? String(param) : null;
  if (already) {
    if (param != null) already.param = normalizedParam;
    already.implicit = already.implicit && param == null ? true : false;
  } else {
    sel.push({
      id: cmd.id, category: cmd.category, label: cmd.label, icon: cmd.icon,
      param: normalizedParam, implicit: false
    });
  }

  normalizeAtCommandSelection();
  pruneDependentAtCommandSelections();
  renderSelectedCommandChips();
  return true;
}

function pruneDependentAtCommandSelections() {
  if (!window.APP_STATE) return;
  let sel = window.APP_STATE.selectedCommands.slice();
  const removed = [];

  if (sel.some(c => c.id === 'chat')) {
    const chat = sel.find(c => c.id === 'chat');
    const extras = sel.filter(c => c.id !== 'chat');
    if (extras.length) removed.push(...extras);
    sel = [chat];
  }

  // Only keep length/visual/language if create_pdf is present
  const hasCreatePdf = sel.some(c => c.id === 'create_pdf');
  if (!hasCreatePdf) {
    const invalid = sel.filter(c => c.category === 'length' || c.id === 'canvas' || c.id === 'language');
    if (invalid.length) removed.push(...invalid);
    sel = sel.filter(c => c.category !== 'length' && c.id !== 'canvas' && c.id !== 'language');
  }

  const docOp = sel.find(c => c.category === 'intent' && isDocumentOperationIntent(c.id));
  const hasDoc = hasDocumentContentForAtCommands();
  if (sel.some(c => c.category === 'target') && (!hasDoc || !docOp)) {
    const targets = sel.filter(c => c.category === 'target');
    removed.push(...targets);
    sel = sel.filter(c => c.category !== 'target');
  }

  window.APP_STATE.selectedCommands = sel;
  if (removed.length) {
    const names = [...new Map(removed.filter(Boolean).map(c => [c.id || c.label, '@' + (c.label || c.id)])).values()];
    displayToastNotification(`Removed ${names.slice(0, 3).join(', ')} because its required mode was not active.`);
  }
}

function removeSelectedAtCommand(id) {
  if (!window.APP_STATE) return;
  window.APP_STATE.selectedCommands = window.APP_STATE.selectedCommands.filter(c => c.id !== id);
  pruneDependentAtCommandSelections();
  normalizeAtCommandSelection();
  renderSelectedCommandChips();
  if (AT_MENU_STATE.open) renderAtCommandMenuList();
}

// ===== RENDER CHIPS =====
function renderSelectedCommandChips() {
  const wrap = document.getElementById('at-command-chips');
  if (!wrap) return;
  wrap.innerHTML = '';
  const selectedCommands = window.APP_STATE?.selectedCommands || [];
  const commandButton = document.getElementById('at-command-btn');
  if (commandButton) {
    const hasSelection = selectedCommands.length > 0;
    commandButton.classList.toggle('has-selection', hasSelection);
    commandButton.setAttribute('aria-pressed', hasSelection ? 'true' : 'false');
    commandButton.setAttribute('aria-label', hasSelection ? `Selected ${selectedCommands.map(c => '@' + c.label).join(', ')}` : 'Select intent');
  }
  if (!window.APP_STATE) return;
  selectedCommands.forEach(c => {
    const chip = document.createElement('span');
    chip.className = 'at-chip';
    const labelText = c.param ? `@${c.label.replace(/\s*\[.*?\]/, '')}:${c.param}` : `@${c.label}`;
    if (c.implicit) chip.classList.add('at-chip-implicit');
    const labelSpan = document.createElement('span');
    labelSpan.innerHTML = `<span class="at-chip-icon">${renderCommandIcon(c.icon)}</span><span>${labelText}</span>`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'at-chip-remove';
    removeBtn.setAttribute('aria-label', `Remove ${c.label}`);
    removeBtn.textContent = '×';
    removeBtn.onclick = () => removeSelectedAtCommand(c.id);
    chip.appendChild(labelSpan);
    chip.appendChild(removeBtn);
    wrap.appendChild(chip);
  });
}

// ===== COMMANDS TAB — NEW UI BUILDERS =====
function _makeAtCommandIconEl(iconName) {
  const span = document.createElement('span');
  span.className = 'at-intent-icon';
  span.innerHTML = renderCommandIcon(iconName);
  return span;
}

function _buildAtCommandSearchRow() {
  const wrap = document.createElement('div');
  wrap.className = 'at-command-search-wrap';
  const icon = document.createElement('span');
  icon.className = 'at-command-search-icon';
  icon.innerHTML = renderCommandIcon('search');
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'at-command-search-input';
  input.className = 'at-command-search-input';
  input.placeholder = 'Search commands...';
  input.autocomplete = 'off';
  input.value = AT_MENU_STATE.query;
  input.oninput = (e) => {
    AT_MENU_STATE.query = e.target.value;
    filterAtCommandMenu(e.target.value);
  };
  wrap.appendChild(icon);
  wrap.appendChild(input);
  return wrap;
}

function _buildAtCommandRecentRow() {
  if (AT_MENU_STATE.query) return null;
  const ids = _getRecentAtCommandIds();
  const cmds = ids.map(id => getAtCommandById(id)).filter(Boolean).slice(0, 3);
  if (!cmds.length) return null;
  const row = document.createElement('div');
  row.className = 'at-recent-row';
  const label = document.createElement('span');
  label.className = 'at-recent-icon';
  label.innerHTML = renderCommandIcon('history');
  row.appendChild(label);
  cmds.forEach(cmd => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'at-recent-chip';
    chip.textContent = '@' + cmd.label;
    if (isAtCommandDisabled(cmd)) chip.disabled = true;
    chip.onclick = () => _chooseAtCommandFromNewUI(cmd);
    row.appendChild(chip);
  });
  return row;
}

function _buildAtIntentGrid() {
  const filteredIds = new Set(AT_MENU_STATE.filtered.map(c => c.id));
  const groups = AT_UI_INTENT_GROUPS.filter(g => g.members.some(id => filteredIds.has(id)));
  if (!groups.length) return null;

  const grid = document.createElement('div');
  grid.className = 'at-intent-grid';

  groups.forEach(group => {
    const memberCmds = group.members.map(id => getAtCommandById(id)).filter(Boolean);
    const selectedMember = memberCmds.find(c => hasSelectedCommand(c.id));
    const allDisabled = memberCmds.every(c => isAtCommandDisabled(c));
    const card = document.createElement('div');
    card.className = 'at-intent-card' +
      (selectedMember ? ' selected' : '') +
      (AT_MENU_STATE.expandedGroup === group.key ? ' expanded' : '') +
      (allDisabled ? ' disabled' : '');
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', selectedMember ? 'true' : 'false');
    if (allDisabled) {
      card.title = getAtCommandDisabledReason(memberCmds[0]) || '';
    } else {
      card.onclick = () => {
        if (memberCmds.length === 1) {
          _chooseAtCommandFromNewUI(memberCmds[0]);
        } else {
          AT_MENU_STATE.expandedGroup = AT_MENU_STATE.expandedGroup === group.key ? null : group.key;
          renderAtCommandMenuList();
        }
      };
    }
    card.appendChild(_makeAtCommandIconEl(group.icon));
    const label = document.createElement('p');
    label.className = 'at-intent-label';
    label.textContent = group.label;
    card.appendChild(label);
    grid.appendChild(card);
  });

  return grid;
}

function _buildAtSubscopePanel() {
  if (!AT_MENU_STATE.expandedGroup) return null;
  const group = AT_UI_INTENT_GROUPS.find(g => g.key === AT_MENU_STATE.expandedGroup);
  if (!group || group.members.length < 2) return null;
  const filteredIds = new Set(AT_MENU_STATE.filtered.map(c => c.id));
  const memberCmds = group.members.map(id => getAtCommandById(id)).filter(c => c && filteredIds.has(c.id));
  if (!memberCmds.length) return null;

  const panel = document.createElement('div');
  panel.className = 'at-subscope-panel';
  const label = document.createElement('p');
  label.className = 'at-subscope-label';
  label.textContent = group.key === 'create' ? 'Create what?' : 'Fix what exactly?';
  panel.appendChild(label);

  const row = document.createElement('div');
  row.className = 'at-subscope-row';
  memberCmds.forEach(cmd => {
    const disabled = isAtCommandDisabled(cmd);
    const selected = hasSelectedCommand(cmd.id);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'at-subscope-chip' + (selected ? ' selected' : '') + (disabled ? ' disabled' : '');
    chip.textContent = AT_SUBSCOPE_LABELS[cmd.id] || cmd.label;
    if (disabled) {
      chip.title = getAtCommandDisabledReason(cmd) || '';
      chip.disabled = true;
    } else {
      chip.onclick = () => _chooseAtCommandFromNewUI(cmd);
    }
    row.appendChild(chip);
  });
  panel.appendChild(row);
  return panel;
}

function _buildAtModifierRow() {
  const modifierCmds = AT_MENU_STATE.filtered.filter(c => ['length', 'target', 'language', 'visual'].includes(c.category));
  if (!modifierCmds.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'at-modifier-wrap';
  const label = document.createElement('p');
  label.className = 'at-modifier-label';
  label.textContent = 'Fine-tune (optional)';
  wrap.appendChild(label);

  const row = document.createElement('div');
  row.className = 'at-modifier-row';
  modifierCmds.forEach(cmd => {
    const disabled = isAtCommandDisabled(cmd);
    const selectedEntry = window.APP_STATE && window.APP_STATE.selectedCommands.find(c => c.id === cmd.id);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'at-modifier-chip' + (selectedEntry ? ' selected' : '') + (disabled ? ' disabled' : '');
    chip.textContent = selectedEntry && selectedEntry.param ? `${cmd.label.replace(/\s*\[.*?\]/, '')}: ${selectedEntry.param}` : cmd.label;
    if (disabled) {
      chip.title = getAtCommandDisabledReason(cmd) || '';
      chip.disabled = true;
    } else if (selectedEntry) {
      chip.onclick = () => removeSelectedAtCommand(cmd.id);
    } else {
      chip.onclick = () => _chooseAtCommandFromNewUI(cmd);
    }
    row.appendChild(chip);
  });
  wrap.appendChild(row);
  return wrap;
}

// ===== RENDER MENU LIST =====
function renderAtCommandMenuList() {
  const menu = document.getElementById('at-command-menu');
  if (!menu) return;
  const preservedScrollTop = menu.scrollTop;
  // menu.innerHTML = '' below rebuilds every element from scratch, which
  // would otherwise silently drop focus out of the search input on every
  // single keystroke (filterAtCommandMenu re-renders on each oninput) —
  // capture it here and restore it after rebuilding.
  const activeEl = document.activeElement;
  const wasSearchFocused = !!(activeEl && activeEl.id === 'at-command-search-input');
  const searchCaret = wasSearchFocused ? activeEl.selectionStart : null;
  menu.innerHTML = '';

  _atCommandLog('render', {
    section: AT_MENU_STATE.section,
    filteredCount: AT_MENU_STATE.filtered.length,
    highlightIndex: AT_MENU_STATE.highlightIndex,
    selectedCommands: (window.APP_STATE?.selectedCommands || []).map(c => c.id)
  });

  const closeBtn = document.createElement('button');
  closeBtn.id = 'at-command-menu-close';
  closeBtn.setAttribute('aria-label', 'Close menu');
  closeBtn.innerHTML = renderCommandIcon('close');
  closeBtn.onclick = () => closeAtCommandMenu();
  menu.appendChild(closeBtn);

  const sectionNav = document.createElement('nav');
  sectionNav.className = 'at-command-section-nav';
  [
    { id: 'commands', label: 'Commands' },
    { id: 'theme', label: 'Theme' },
    { id: 'format', label: 'Format' }
  ].forEach(section => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'at-command-section-tab' + (AT_MENU_STATE.section === section.id ? ' active' : '');
    button.textContent = section.label;
    button.setAttribute('aria-selected', AT_MENU_STATE.section === section.id ? 'true' : 'false');
    button.onclick = () => setAtCommandMenuSection(section.id);
    sectionNav.appendChild(button);
  });
  menu.appendChild(sectionNav);

  // Note: AT_MENU_STATE.filtered only drives the Commands tab's search — a
  // no-results search there must not blank out the Theme/Format tabs too
  // (they don't use `filtered` at all), so the empty case is handled
  // per-section below (inside the Commands section) instead of here.

  const commandSection = document.createElement('section');
  commandSection.className = 'at-command-section';
  commandSection.hidden = AT_MENU_STATE.section !== 'commands';

  commandSection.appendChild(_buildAtCommandSearchRow());

  const recentRow = _buildAtCommandRecentRow();
  if (recentRow) commandSection.appendChild(recentRow);

  const intentLabel = document.createElement('p');
  intentLabel.className = 'at-intent-section-label';
  intentLabel.textContent = 'What do you want to do?';
  commandSection.appendChild(intentLabel);

  const grid = _buildAtIntentGrid();
  if (grid) {
    commandSection.appendChild(grid);
    const subscope = _buildAtSubscopePanel();
    if (subscope) commandSection.appendChild(subscope);
  } else {
    const empty = document.createElement('div');
    empty.className = 'at-command-empty';
    empty.textContent = 'No matching commands';
    commandSection.appendChild(empty);
  }

  const modifierRow = _buildAtModifierRow();
  if (modifierRow) commandSection.appendChild(modifierRow);

  menu.appendChild(commandSection);

  // Theme section (PDF design and typography formats)
  const formatWrap = document.createElement('div');
  formatWrap.className = 'at-format-section at-theme-section';
  formatWrap.hidden = AT_MENU_STATE.section !== 'theme';

  const formatTitle = document.createElement('div');
  formatTitle.className = 'at-command-section-title';
  formatTitle.textContent = 'Theme & Typography';
  formatWrap.appendChild(formatTitle);

  const visualTitle = document.createElement('div');
  visualTitle.className = 'at-format-title';
  visualTitle.textContent = 'Design';
  formatWrap.appendChild(visualTitle);

  const currentFormat = typeof getActivePDFVisualFormat === 'function' ? getActivePDFVisualFormat() : 'default';
  [
    { id: 'default', label: 'Default', desc: 'Original PDF appearance' },
    { id: 'aurora', label: 'Aurora Flow', desc: 'Teal · fresh · modern' },
    { id: 'editorial', label: 'Editorial', desc: 'Cream · terracotta · book style' },
    { id: 'midnight', label: 'Midnight Canvas', desc: 'Indigo · modern · high contrast' },
    { id: 'blueprint', label: 'Blueprint Grid', desc: 'Technical · grid · structured' },
    { id: 'sage', label: 'Sage Minimal', desc: 'Soft green · calm · clean' },
    { id: 'minimal', label: 'Minimal Paper', desc: 'Quiet white · refined spacing' },
    { id: 'rose', label: 'Rose Studio', desc: 'Soft rose · editorial warmth' },
    { id: 'ocean', label: 'Ocean Depth', desc: 'Blue · crisp · focused' },
    { id: 'highcontrast', label: 'High Contrast', desc: 'Bold black · vivid accents' }
  ].forEach(f => {
    const row = document.createElement('div');
    row.className = 'at-format-item at-visual-format-item' + (currentFormat === f.id ? ' active' : '');
    row.onclick = () => {
      if (typeof choosePDFVisualFormat === 'function') choosePDFVisualFormat(f.id);
    };
    const sw = document.createElement('span');
    sw.className = 'at-format-swatch ' + f.id;
    const info = document.createElement('span');
    info.className = 'at-cmd-text';
    const label = document.createElement('span');
    label.className = 'at-cmd-label';
    label.textContent = f.label;
    const desc = document.createElement('span');
    desc.className = 'at-cmd-desc';
    desc.textContent = f.desc;
    info.append(label, desc);
    row.append(sw, info);
    formatWrap.appendChild(row);
  });

  const textTitle = document.createElement('div');
  textTitle.className = 'at-format-title';
  textTitle.style.marginTop = '8px';
  textTitle.textContent = 'Text font';
  formatWrap.appendChild(textTitle);

  const currentTextFormat = typeof getActivePDFTextFormat === 'function' ? getActivePDFTextFormat() : 'default';
  [
    { id: 'default', label: 'Default', desc: 'Original text styling' },
    { id: 'academic', label: 'Academic', desc: 'Serif · formal · spacious' },
    { id: 'modern', label: 'Modern', desc: 'Sans-serif · bold · clean' },
    { id: 'compact', label: 'Compact', desc: 'Tighter text · space efficient' }
  ].forEach(f => {
    const row = document.createElement('div');
    row.className = 'at-format-item at-text-format-item' + (currentTextFormat === f.id ? ' active' : '');
    row.onclick = () => {
      if (typeof choosePDFTextFormat === 'function') choosePDFTextFormat(f.id);
    };
    const sw = document.createElement('span');
    sw.className = 'at-text-swatch ' + f.id;
    sw.textContent = 'Aa';
    const info = document.createElement('span');
    info.className = 'at-cmd-text';
    const label = document.createElement('span');
    label.className = 'at-cmd-label';
    label.textContent = f.label;
    const desc = document.createElement('span');
    desc.className = 'at-cmd-desc';
    desc.textContent = f.desc;
    info.append(label, desc);
    row.append(sw, info);
    formatWrap.appendChild(row);
  });

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'at-format-reset';
  resetBtn.textContent = 'Reset all formats to Default';
  resetBtn.onclick = () => {
    if (typeof applyPDFVisualFormat === 'function') applyPDFVisualFormat('default');
    if (typeof applyPDFTextFormat === 'function') applyPDFTextFormat('default');
    if (typeof applyPDFLanguageFormat === 'function') applyPDFLanguageFormat('default');
    renderAtCommandMenuList();
    displayToastNotification('PDF background and text restored to Default');
  };
  formatWrap.appendChild(resetBtn);
  menu.appendChild(formatWrap);

  const languageWrap = document.createElement('div');
  languageWrap.className = 'at-format-section at-language-section';
  languageWrap.hidden = AT_MENU_STATE.section !== 'format';
  const languageTitle = document.createElement('div');
  languageTitle.className = 'at-command-section-title';
  languageTitle.textContent = 'Format';
  languageWrap.appendChild(languageTitle);

  const currentLanguageFormat = typeof getActivePDFLanguageFormat === 'function' ? getActivePDFLanguageFormat() : 'default';
  [
    { id: 'default', label: 'Default', desc: 'Follow the language of your request' },
    { id: 'english', label: 'English only', desc: 'Write everything in English' },
    { id: 'bengali', label: 'Bengali only', desc: 'Write everything in Bengali' },
    { id: 'english_bengali', label: 'English then Bengali', desc: 'English first, Bengali translation second' },
    { id: 'bengali_english', label: 'Bengali then English', desc: 'Bengali first, English translation second' }
  ].forEach(f => {
    const row = document.createElement('div');
    row.className = 'at-format-item' + (currentLanguageFormat === f.id ? ' active' : '');
    row.onclick = () => {
      if (typeof choosePDFLanguageFormat === 'function') choosePDFLanguageFormat(f.id);
    };
    const sw = document.createElement('span');
    sw.className = 'at-language-swatch ' + f.id;
    sw.textContent = f.id === 'default' ? 'Aa' : f.id === 'english' ? 'EN' : f.id === 'bengali' ? 'BN' : f.id === 'english_bengali' ? 'EN/BN' : 'BN/EN';
    const info = document.createElement('span');
    info.className = 'at-cmd-text';
    const label = document.createElement('span');
    label.className = 'at-cmd-label';
    label.textContent = f.label;
    const desc = document.createElement('span');
    desc.className = 'at-cmd-desc';
    desc.textContent = f.desc;
    info.append(label, desc);
    row.append(sw, info);
    languageWrap.appendChild(row);
  });
  menu.appendChild(languageWrap);

  menu.scrollTop = preservedScrollTop;
  requestAnimationFrame(() => { menu.scrollTop = preservedScrollTop; });
  if (wasSearchFocused) {
    const si = document.getElementById('at-command-search-input');
    if (si) {
      si.focus();
      if (searchCaret != null) { try { si.setSelectionRange(searchCaret, searchCaret); } catch (_) {} }
    }
  }
}

// ===== FILTER =====
function filterAtCommandMenu(query) {
  const q = (query || '').toLowerCase();
  AT_MENU_STATE.filtered = !q ? getOrderedAtCommands(AT_COMMANDS) :
    getOrderedAtCommands(AT_COMMANDS.filter(c => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)));
  AT_MENU_STATE.highlightIndex = 0;
  renderAtCommandMenuList();
  _atCommandLog('filter', { query: q, count: AT_MENU_STATE.filtered.length });
}

function moveAtCommandHighlight(delta) {
  if (!AT_MENU_STATE.filtered.length) return;
  AT_MENU_STATE.highlightIndex = (AT_MENU_STATE.highlightIndex + delta + AT_MENU_STATE.filtered.length) % AT_MENU_STATE.filtered.length;
  renderAtCommandMenuList();
}

function chooseHighlightedAtCommand() {
  const cmd = AT_MENU_STATE.filtered[AT_MENU_STATE.highlightIndex];
  if (cmd && !isAtCommandDisabled(cmd)) chooseAtCommandFromMenu(cmd);
}

// ===== CHAT INPUT HANDLING =====
function handleChatInputChanged(ta, event) {
  autoResizeTextarea(ta);
  const cursorPos = ta.selectionStart;
  const textBeforeCursor = ta.value.slice(0, cursorPos);
  const atMatch = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z_]*)$/);
  if (atMatch) {
    const query = atMatch[1];
    const triggerIdx = cursorPos - query.length - 1;
    AT_MENU_STATE.mode = 'type';
    AT_MENU_STATE.triggerStart = triggerIdx;
    if (!AT_MENU_STATE.open) openAtCommandMenu('type');
    filterAtCommandMenu(query);
  } else if (AT_MENU_STATE.open && AT_MENU_STATE.mode === 'type') {
    closeAtCommandMenu();
  }
}

// ===== PARSE INLINE COMMAND TOKENS =====
function parseAndStripInlineCommandTokens(text) {
  let result = text;
  const pageCmd = getAtCommandById('page');
  const pageMatch = result.match(pageCmd.paramPattern);
  if (pageMatch) {
    attemptAddAtCommand(pageCmd, pageMatch[1].replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim());
    result = result.replace(pageCmd.paramPattern, '').trim();
  }
  const langCmd = getAtCommandById('language');
  const langMatch = result.match(langCmd.paramPattern);
  if (langMatch) {
    attemptAddAtCommand(langCmd, langMatch[1]);
    result = result.replace(langCmd.paramPattern, '').trim();
  }
  const refineAlias = /@refine\b/i;
  if (refineAlias.test(result) && !/@refine_(equation|pagination)\b/i.test(result)) {
    attemptAddAtCommand(getAtCommandById('refine'), null, { silentParent: true });
    result = result.replace(refineAlias, '').trim();
  }
  const refinePagCmd = getAtCommandById('refine_pagination');
  const refinePagMatch = result.match(refinePagCmd.paramPattern);
  if (refinePagMatch) {
    attemptAddAtCommand(refinePagCmd, refinePagMatch[1]);
    result = result.replace(refinePagCmd.paramPattern, '').trim();
  }
  return result;
}

// ===== BUILD INTENT PAYLOAD =====
function buildIntentPayload() {
  if (!window.APP_STATE) return null;
  const sel = window.APP_STATE.selectedCommands;
  const findCat = cat => sel.find(c => c.category === cat);
  const intentCmd = sel.find(c => c.category === 'intent' && !c.implicit) || findCat('intent');
  if (!intentCmd) return null;
  const lengthCmd = findCat('length');
  const targetCmd = findCat('target');
  const languageCmd = findCat('language');
  const visualCmd = findCat('visual');

  const pageNumbers = (targetCmd && targetCmd.param ? targetCmd.param : '')
    .split(/[\s,]+/).map(n => parseInt(n, 10)).filter(n => Number.isInteger(n) && n > 0);
  let pageTarget = pageNumbers.length ? pageNumbers[0] : null;
  if (intentCmd.id === 'edit' && intentCmd.param) {
    const parts = intentCmd.param.split(/\s+/).filter(p => p.length > 0);
    const nums = parts.map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0);
    if (nums.length > 0) {
      pageTarget = nums[0];
      pageNumbers.push(...nums.slice(1));
    }
  }

  return {
    intent: intentCmd.id,
    length: lengthCmd ? lengthCmd.id : null,
    pageTarget: pageTarget,
    language: (languageCmd && languageCmd.param) ? languageCmd.param : null,
    visual: visualCmd ? visualCmd.id : null,
    sectionMode: typeof getSectionModeEnabled === 'function' ? getSectionModeEnabled() : false,
    refinePaginationPage: (intentCmd.id === 'refine_pagination' && intentCmd.param) ? parseInt(intentCmd.param, 10) : null,
    pageNumbers: [...new Set(pageNumbers)],
    editPages: intentCmd.id === 'edit' ? [...new Set(pageNumbers)] : null
  };
}

// ===== BUILD INSTRUCTION TEXT =====
function buildAtCommandInstructionText(intentPayload) {
  if (!intentPayload || !intentPayload.intent) return '';
  const intentLabels = {
    add: 'ADD — append new notes/content/pages requested by the user; never replace existing content',
    chat: 'CHAT — plain conversation, reply with action "chat_reply" only, do NOT edit the document',
    create_pdf: 'CREATE PDF — create a new document/note.',
    edit: 'EDIT — edit/modify the current canvas content',
    refine: 'REFINE — inspect the requested part and improve it while preserving useful information',
    refine_equation: 'REFINE EQUATION — fix ONLY the equation/KaTeX portions, leave everything else untouched',
    beautify: 'BEAUTIFY — improve styling/formatting only, do NOT change the actual wording/content',
    redesign_diagram: 'REDESIGN DIAGRAM — redesign the chart/diagram/flowchart',
    refine_pagination: 'REFINE PAGINATION — fix ONLY the pagination/page-break of the specified page, leave all actual content and wording untouched'
  };
  const parts = [`INTENT: ${intentLabels[intentPayload.intent] || intentPayload.intent}`];
  parts.push(intentPayload.sectionMode === false ?
    'GENERATION STRUCTURE MODE: DIRECT — do NOT split the response into separately generated sections. Produce the requested document as one continuous generation flow; the user is controlling the structure manually.' :
    'GENERATION STRUCTURE MODE: SECTIONED — when the request benefits from it, use the approved section-by-section generation workflow.');

  if (intentPayload.intent === 'refine_pagination' && intentPayload.refinePaginationPage) {
    parts.push(`TARGET PAGE FOR PAGINATION FIX: ${intentPayload.refinePaginationPage}`);
  }
  if (intentPayload.intent === 'edit') {
    parts.push('EDIT SAFETY: Never append, prepend, replace_all, or recreate the document. Use update_page for one selected page or update_pages for multiple selected pages. Preserve every unselected page exactly.');
    if (intentPayload.editPages && intentPayload.editPages.length) parts.push(`SELECTED EDIT PAGES: ${intentPayload.editPages.join(', ')}.`);
  }
  if (intentPayload.intent === 'add') {
    parts.push('ADD SAFETY: Append the requested new material. Never replace or delete existing content. If pages are selected, preserve their existing content while adding to those pages; create continuation pages when needed.');
  }
  if (intentPayload.intent === 'redesign_diagram') {
    parts.push('REDESIGN SAFETY: Create a genuinely new visual design and replace the old diagram with the new complete diagram. Do not return a partial patch or preserve the old layout unchanged.');
  }

  if (intentPayload.length === 'long_pdf') {
    parts.push('LENGTH: LONG — produce a genuinely long, comprehensive document with full depth, detail and examples. Do not shorten or summarize.');
  } else if (intentPayload.length === 'short_pdf') {
    parts.push('LENGTH: SHORT — produce a compact document covering only essential concepts and examples. Avoid unnecessary elaboration.');
  }

  if (intentPayload.pageNumbers && intentPayload.pageNumbers.length && intentPayload.intent !== 'edit' && intentPayload.intent !== 'refine_pagination') {
    parts.push(`TARGET PAGES: Apply this action only to pages ${intentPayload.pageNumbers.join(', ')}. Preserve all other pages exactly as-is.`);
  }

  if (intentPayload.language) {
    parts.push(`LANGUAGE: Write the entire output in "${intentPayload.language}". Do not mix in other languages unless technical terms require it.`);
  }

  if (intentPayload.visual === 'canvas') {
    parts.push('VISUAL SUPPORT: CANVAS — increase useful visual elements (tables, diagrams, concept maps) wherever they genuinely help understanding.');
  }

  return `\n\n=== USER EXPLICIT @ COMMAND SELECTION (SOURCE OF TRUTH — follow exactly, do NOT guess intent from free text) ===\nUser explicitly selected: ${parts.join('; ')}.\n=== END @ COMMAND SELECTION ===\n`;
}

// ============================================================
// WINDOW EXPOSURE – Command Menu
// ============================================================
window.toggleAtCommandMenu = toggleAtCommandMenu;
window.closeAtCommandMenu = closeAtCommandMenu;
window.renderAtCommandMenuList = renderAtCommandMenuList;
window.chooseAtCommandFromMenu = chooseAtCommandFromMenu;
window.filterAtCommandMenu = filterAtCommandMenu;
window.moveAtCommandHighlight = moveAtCommandHighlight;
window.chooseHighlightedAtCommand = chooseHighlightedAtCommand;
window.parseAndStripInlineCommandTokens = parseAndStripInlineCommandTokens;
window.buildIntentPayload = buildIntentPayload;
window.buildAtCommandInstructionText = buildAtCommandInstructionText;
window.renderSelectedCommandChips = renderSelectedCommandChips;
window.attemptAddAtCommand = attemptAddAtCommand;
window.removeSelectedAtCommand = removeSelectedAtCommand;
window.getAtCommandDisabledReason = getAtCommandDisabledReason;
window.isAtCommandDisabled = isAtCommandDisabled;
window.handleChatInputChanged = handleChatInputChanged;
window.showAtCommandToast = showAtCommandToast;
window.shakeChatInputField = shakeChatInputField;
window.pruneDependentAtCommandSelections = pruneDependentAtCommandSelections;
window.normalizeAtCommandSelection = normalizeAtCommandSelection;
window.ensureCommandDependencies = ensureCommandDependencies;
window.getCommandAutoParent = getCommandAutoParent;
window.hasSelectedCommand = hasSelectedCommand;
window.hasDocumentContentForAtCommands = hasDocumentContentForAtCommands;
window.getPrimaryIntent = getPrimaryIntent;
window.isDocumentOperationIntent = isDocumentOperationIntent;