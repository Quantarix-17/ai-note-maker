// ========================================================================
// APP - Main Application: State, Chat, AI Calls, Document Generation, Init
// ========================================================================

// ===== APPLICATION STATE =====
let APP_STATE = {
  chatHistory: [],
  attachedFiles: {},
  isAIGenerating: false,
  theme: 'light',
  currentMobileView: 'chat',
  selectedPage: null,
  _sendDebounce: false,
  projectVersion: 0,
  fileObjects: {},
  activeSessionId: 0,
  selectedCommands: [],
  pdfLanguageFormat: 'default',
  suppressDocumentAIChat: false,
  pendingEditPages: null
};
window.APP_STATE = APP_STATE;

// ===== RUNTIME STATE ACCESS LAYER =====
function getActiveTabIdSafe() {
  return APP_STATE?.activeTabId || APP_STATE?.activeTab || (typeof TAB_MANAGER !== 'undefined' ? TAB_MANAGER?.activeId : null) || null;
}

function getActiveTabStateSafe() {
  const id = getActiveTabIdSafe();
  if (!id || typeof TAB_MANAGER === 'undefined' || !TAB_MANAGER?.tabs) return null;
  return Array.isArray(TAB_MANAGER.tabs) ? (TAB_MANAGER.tabs.find(t => t.id === id) || null) : null;
}

function commitRuntimeStateSafe() {
  const id = getActiveTabIdSafe();
  if (!id || typeof syncCurrentTabFileObjects !== 'function') return;
  syncCurrentTabFileObjects();
}

// ===== SECTION MODE TOGGLE =====
function getSectionModeEnabled() {
  return false; // Always off - documents generate directly
}
window.getSectionModeEnabled = getSectionModeEnabled;

// ===== TOAST HELPER =====
function showAtCommandToast(msg) {
  if (typeof displayToastNotification === 'function') displayToastNotification(msg);
  const btn = document.getElementById('at-command-btn');
  if (btn) {
    btn.style.animation = 'none';
    void btn.offsetWidth;
    btn.style.animation = 'shakeError 0.4s var(--ease)';
  }
}

// ===== SANITIZATION HELPERS =====
function sanitizeHTML(rawHtml) {
  if (!rawHtml) return '';

  let html = String(rawHtml)
    .replace(/<\s*(?:html|head|body)\b[^>]*>/gi, '')
    .replace(/<\/\s*(?:html|head|body)\s*>/gi, '')
    .replace(/<\s*title\b[^>]*>[\s\S]*?<\/\s*title\s*>/gi, '')
    .replace(/<\s*style\b[^>]*>[\s\S]*?<\/\s*style\s*>/gi, '')
    .replace(/<\s*meta\b[^>]*>/gi, '')
    .replace(/<\s*link\b[^>]*>/gi, '');

  const template = document.createElement('template');
  template.innerHTML = html;

  Array.from(template.content.querySelectorAll('*')).forEach(el => {
    if (SANITIZE_DISALLOWED_TAGS.includes(el.tagName)) {
      el.remove();
      return;
    }
    Array.from(el.attributes).forEach(attr => {
      const name = attr.name.toLowerCase(),
        value = attr.value.trim();
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && /^\s*(javascript|vbscript):/i.test(value))) {
        el.removeAttribute(attr.name);
      }
    });
  });

  // Also strip any remaining full wrappers that may still be present as literal tags.
  html = template.innerHTML
    .replace(/<\s*(?:html|head|body)\b[^>]*>/gi, '')
    .replace(/<\/\s*(?:html|head|body)\s*>/gi, '')
    .replace(/<\s*title\b[^>]*>[\s\S]*?<\/\s*title\s*>/gi, '')
    .replace(/<\s*style\b[^>]*>[\s\S]*?<\/\s*style\s*>/gi, '');

  if (typeof stripEmojiFromNode === 'function') {
    const temp = document.createElement('template');
    temp.innerHTML = html;
    stripEmojiFromNode(temp.content);
    html = temp.innerHTML;
  }

  return html.trim();
}

function isSafeHTMLUrl(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return true;
  return /^(https?:|mailto:|tel:|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(v) ||
    v.startsWith('#') || v.startsWith('/') || v.startsWith('./') || v.startsWith('../');
}

function sanitizeAttributeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase().replace(/[\u0000-\u001f\u007f\s]+/g, '');
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('file:') ||
    lower.startsWith('blob:') || lower.startsWith('data:text/html') || lower.startsWith('data:application/xhtml')) {
    return '';
  }
  return raw;
}

// ===== CONVERT TEXT TO DOCUMENT HTML =====
function extractLeakedJsonHtmlContent(raw) {
  const m = raw.match(/"html_content"\s*:\s*"([\s\S]*)"\s*\}?\s*$/);
  if (!m) return null;
  let inner = m[1];
  inner = inner.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
  return inner.trim() || null;
}

function convertTextToDocumentHTML(text) {
  if (text == null) return '';
  let raw = String(text).replace(/\r\n?/g, '\n').trim();
  if (!raw) return '';

  if (raw.startsWith('{') && raw.includes('"html_content"')) {
    const extracted = extractLeakedJsonHtmlContent(raw);
    if (extracted) raw = extracted;
  }

  if (/<(?:h[1-6]|p|div|table|ul|ol|li|blockquote|figure|svg|img|br)\b/i.test(raw)) {
    return sanitizeHTML(raw);
  }

  const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const lines = raw.split('\n');
  const out = [];
  let paragraph = [];
  let listType = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const textHtml = escape(paragraph.join(' ')).replace(/\s{2,}/g, ' ');
    out.push(`<p>${textHtml}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listType) { out.push(`</${listType}>`);
      listType = null; }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph();
      closeList(); continue; }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { flushParagraph();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${escape(heading[2])}</h${level}>`);
      continue; }
    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || numbered) { flushParagraph();
      const desired = bullet ? 'ul' : 'ol';
      if (listType !== desired) { closeList();
        out.push(`<${desired}>`);
        listType = desired; }
      out.push(`<li>${escape((bullet || numbered)[1])}</li>`);
      continue; }
    closeList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  closeList();
  return out.join('');
}

// ===== CHAT UI HELPERS =====
function appendChatMessageToUI(role, messageText, recordHistory = true) {
  const chatHistoryArea = document.getElementById('chat-history');
  if (!chatHistoryArea) return { isConnected: false, remove() {} };
  const emptyState = document.getElementById('chat-empty-state');
  if (emptyState) emptyState.remove();
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}`;
  const messageValue = String(messageText || '');
  messageDiv.innerHTML = role === 'user' ? `<div class="message-role-label">You</div>${messageValue.replace(/\n/g, '<br>')}` : messageText;
  if (role === 'user') {
    messageDiv.dataset.prompt = messageValue;
    messageDiv.dataset.commandState = JSON.stringify((APP_STATE.selectedCommands || []).map(command => ({
      id: command.id,
      param: command.param || null,
      implicit: !!command.implicit
    })));

    const actions = document.createElement('div');
    actions.className = 'chat-message-actions';
    [
      ['retry', 'Retry'],
      ['edit', 'Edit'],
      ['copy', 'Copy']
    ].forEach(([action, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `chat-message-action action-${action}`;
      button.textContent = label;
      button.setAttribute('aria-label', `${label} message`);
      button.addEventListener('click', event => {
        event.stopPropagation();
        handleChatMessageAction(action, messageDiv);
      });
      actions.appendChild(button);
    });
     messageDiv.appendChild(actions);
     messageDiv.addEventListener('click', () => {
       const isTouchDevice = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
       const isMobileLayout = typeof isMobileDeviceLayout === 'function' && isMobileDeviceLayout();
       if (isTouchDevice || isMobileLayout) {
         const isOpen = messageDiv.classList.contains('actions-open');
         document.querySelectorAll('.chat-message.actions-open').forEach(el => el.classList.remove('actions-open'));
         if (!isOpen) messageDiv.classList.add('actions-open');
       }
     });
     // Close all open message actions when tapping outside any message (mobile UX)
     if (!window.__chatMessageActionDismissInstalled) {
       window.__chatMessageActionDismissInstalled = true;
       document.addEventListener('click', (e) => {
         const target = e.target;
         if (target && (target.closest?.('.chat-message') || target.closest?.('.chat-message-actions'))) return;
         document.querySelectorAll('.chat-message.actions-open').forEach(el => el.classList.remove('actions-open'));
       });
     }
  }
  chatHistoryArea.appendChild(messageDiv);
  chatHistoryArea.scrollTop = chatHistoryArea.scrollHeight;
  if (recordHistory && (role === 'user' || role === 'ai')) {
    APP_STATE.chatHistory.push({ role: role === 'user' ? 'user' : 'assistant', content: messageText });
    if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
    if (typeof TAB_MANAGER !== 'undefined' && TAB_MANAGER.activeId) {
      TAB_MANAGER._captureCurrentState(TAB_MANAGER.activeId);
      TAB_MANAGER._persist();
    }
  }
  return messageDiv;
}

function restoreChatMessageCommandState(messageDiv) {
  if (!messageDiv || !window.APP_STATE) return;
  let saved = [];
  try { saved = JSON.parse(messageDiv.dataset.commandState || '[]'); } catch (_) {}
  if (!Array.isArray(saved)) saved = [];
  if (typeof getAtCommandById !== 'function') return;
  APP_STATE.selectedCommands = saved.map(savedCommand => {
    const command = getAtCommandById(savedCommand.id);
    return command ? {
      id: command.id,
      category: command.category,
      label: command.label,
      icon: command.icon,
      param: savedCommand.param || null,
      implicit: !!savedCommand.implicit
    } : null;
  }).filter(Boolean);
  if (typeof renderSelectedCommandChips === 'function') renderSelectedCommandChips();
}

async function copySentChatMessage(messageDiv) {
  const text = messageDiv?.dataset.prompt || '';
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else throw new Error('Clipboard API unavailable');
    if (typeof displayToastNotification === 'function') displayToastNotification('✅ Message copied');
  } catch (_) {
    if (typeof displayToastNotification === 'function') displayToastNotification('⚠️ Could not copy the message.');
  }
}

function editSentChatMessage(messageDiv) {
  const input = document.getElementById('chat-input-textarea');
  if (!input) return;
  restoreChatMessageCommandState(messageDiv);
  input.value = messageDiv?.dataset.prompt || '';
  if (typeof autoResizeTextarea === 'function') autoResizeTextarea(input);
  input.focus();
}

function retrySentChatMessage(messageDiv) {
  const input = document.getElementById('chat-input-textarea');
  if (!input || APP_STATE.isAIGenerating) return;
  const blankState = typeof TAB_MANAGER !== 'undefined' && typeof TAB_MANAGER._createBlankState === 'function' ? TAB_MANAGER._createBlankState() : null;
  const blankHTML = blankState?.htmlContent || '<h1>Start typing here...</h1>';
  if (typeof setDocumentHTMLAndPaginate === 'function') setDocumentHTMLAndPaginate(blankHTML, false);
  if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
  restoreChatMessageCommandState(messageDiv);
  input.value = messageDiv?.dataset.prompt || '';
  if (typeof autoResizeTextarea === 'function') autoResizeTextarea(input);
  if (typeof displayToastNotification === 'function') displayToastNotification('↻ Document reset — retrying request');
  triggerChatSend();
}

function handleChatMessageAction(action, messageDiv) {
  if (action === 'retry') retrySentChatMessage(messageDiv);
  else if (action === 'edit') editSentChatMessage(messageDiv);
  else if (action === 'copy') copySentChatMessage(messageDiv);
}

function handleChatFormSubmit(event) {
  event.preventDefault();
  triggerChatSend();
}

function triggerChatSend() {
  if (APP_STATE._sendDebounce) return;
  APP_STATE._sendDebounce = true;
  setTimeout(() => { APP_STATE._sendDebounce = false; }, 300);
  sendChatPromptToAI();
}

// ===== AI HELPERS =====
function sanitizeJsonStringLiterals(text) {
  let out = '',
    inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && inString) {
      const next = text[i + 1];
      if (next === '"' || next === '\\' || next === '/') { out += ch + next;
        i++; continue; }
      if (next === 'u' && /^[0-9a-fA-F]{4}/.test(text.slice(i + 2, i + 6))) { out += text.slice(i, i + 6);
        i += 5; continue; }
      if ('bfnrt'.includes(next) && !/[a-zA-Z]/.test(text[i + 2] || '')) { out += ch + next;
        i++; continue; }
      out += '\\\\';
      continue;
    }
    if (ch === '"') { inString = !inString;
      out += ch; continue; }
    if (inString) {
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
    }
    out += ch;
  }
  return out;
}

function safeParseAIJson(rawText, fallback) {
  if (!rawText) return fallback;
  let text = rawText.replace(/```(?:json)?\s*([\s\S]*?)```/, '$1').trim();
  text = sanitizeJsonStringLiterals(text);
  try { return JSON.parse(text); } catch (e) {}
  const firstBrace = text.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0,
      inString = false,
      escape = false,
      lastValidEnd = -1;
    for (let i = firstBrace; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--;
        if (depth === 0) { lastValidEnd = i; break; } }
    }
    if (lastValidEnd !== -1) {
      try { return JSON.parse(text.slice(firstBrace, lastValidEnd + 1)); } catch (e) {}
    }
    let repaired = text.slice(firstBrace);
    let strCount = 0;
    for (let i = 0; i < repaired.length; i++) {
      if (repaired[i] === '\\') { i++; continue; }
      if (repaired[i] === '"') strCount++;
    }
    if (strCount % 2 === 1) repaired += '"';
    repaired = repaired.replace(/,\s*$/, '');
    const openBraces = (repaired.match(/{/g) || []).length - (repaired.match(/}/g) || []).length;
    repaired += '}'.repeat(Math.max(openBraces, 0));
    try { return JSON.parse(repaired); } catch (e) {}
  }
  return fallback;
}

function attemptRepairAndParse(rawText) {
  if (!rawText) return null;
  let parsed = safeParseAIJson(rawText, null);
  if (parsed) return parsed;

  const latexCommands = ['frac', 'dfrac', 'tfrac', 'cfrac', 'sqrt', 'binom', 'left', 'right', 'text', 'mathrm', 'mathbf', 'mathit', 'mathbb',
    'operatorname', 'vec', 'overline', 'underline', 'bar', 'hat', 'tilde', 'dot', 'ddot', 'widetilde', 'widehat',
    'sum', 'prod', 'int', 'iint', 'iiint', 'oint', 'lim', 'log', 'ln', 'exp', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'arcsin', 'arccos', 'arctan', 'cdot', 'times', 'div', 'pm', 'mp', 'leq', 'geq', 'neq', 'approx', 'equiv', 'sim',
    'propto', 'infty', 'partial', 'nabla', 'forall', 'exists', 'in', 'notin', 'subset', 'subseteq', 'supset', 'supseteq',
    'cup', 'cap', 'setminus', 'emptyset', 'to', 'mapsto', 'implies', 'iff', 'rightarrow', 'leftarrow', 'leftrightarrow',
    'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'uparrow', 'downarrow', 'updownarrow', 'cdots', 'ldots', 'vdots', 'ddots',
    'dots', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa',
    'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi',
    'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
    'degree', 'circ', 'prime', 'quad', 'qquad', 'hspace', 'vspace', 'boxed', 'mathcal', 'mathscr', 'mathsf', 'mathtt',
    'pmb', 'cancel', 'overbrace', 'underbrace', 'overset', 'underset', 'substack', 'textbf', 'textit', 'begin', 'end',
    'cases', 'aligned', 'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix'
  ];
  const commandPattern = new RegExp(`\\\\(${latexCommands.join('|')})(?![a-zA-Z])`, 'g');
  let repaired = rawText.replace(/(?<!\\)\\(?=[a-zA-Z])/g, '\\\\');
  try { return JSON.parse(repaired); } catch (e) {}
  return safeParseAIJson(repaired, null);
}

function isJsonModeUnsupportedError(status, detail) {
  return status === 400 || status === 422;
}

function detectTruncatedContent(content, maxTokens) {
  if (!content) return false;
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let depth = 0,
      inString = false,
      escape = false;
    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
    }
    if (depth > 0) return true;
    const lastNonSpace = content.replace(/\s+$/, '');
    if (lastNonSpace.endsWith(',') || lastNonSpace.endsWith(':')) return true;
  }
  const tagMatch = content.match(/<[a-zA-Z][a-zA-Z0-9]*$/);
  if (tagMatch) return true;
  const attrMatch = content.match(/<[a-zA-Z][a-zA-Z0-9]*\s+[a-zA-Z][a-zA-Z0-9]*\s*=\s*["']?[^"'>]*$/);
  if (attrMatch) return true;
  if (content.includes('<!--') && !content.includes('-->')) return true;

  if (maxTokens && maxTokens > 0) {
    const estimatedChars = maxTokens * 3.5;
    if (content.length > estimatedChars * 0.90) {
      const lastChar = content[content.length - 1];
      const naturalStops = ['.', '!', '?', '\n', ' ', '}', ']', '"', "'", ';'];
      if (!naturalStops.includes(lastChar) && lastChar !== '>') return true;
    }
  }
  return false;
}

function normalizeAIContent(rawContent) {
  if (typeof rawContent === 'string') return rawContent;
  if (Array.isArray(rawContent)) {
    return rawContent.map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part.text === 'string') return part.text;
      return '';
    }).join('');
  }
  return rawContent ? String(rawContent) : '';
}

// ===== AI API CALL WITH FAILOVER =====
const THINKING_RUNTIME = window.__AI_THINKING_RUNTIME__ || (window.__AI_THINKING_RUNTIME__ = {
  requestGate: Promise.resolve(),
  requestInFlight: 0,
  modelFailures: new Map(),
  cooldownUntil: 0
});

function getThinkingCooldownRemaining() {
  return Math.max(0, THINKING_RUNTIME.cooldownUntil - Date.now());
}
function isThinkingCooldownActive() {
  return getThinkingCooldownRemaining() > 0;
}
function showThinkingCooldownToast() {
  const remaining = Math.ceil(getThinkingCooldownRemaining() / 1000);
  if (remaining > 0 && typeof displayToastNotification === 'function') {
    displayToastNotification(`Model cooldown active — retrying is blocked for ${remaining}s.`);
  }
}
function startThinkingCooldown(reason = '') {
  THINKING_RUNTIME.cooldownUntil = Date.now() + THINKING_COOLDOWN_MS;
  console.warn(`[Thinking] All model failover cycles exhausted; cooldown started for ${THINKING_COOLDOWN_MS / 1000}s${reason ? `: ${reason}` : ''}`);
  try {
    if (typeof ProgressUI !== 'undefined' && ProgressUI.setLabel) {
      ProgressUI.setLabel(`All AI models failed — cooldown ${THINKING_COOLDOWN_MS / 1000}s`);
    }
  } catch (e) {}
  if (typeof displayToastNotification === 'function') {
    displayToastNotification(`All configured AI models failed. Cooldown started for ${THINKING_COOLDOWN_MS / 1000}s.`);
  }
  showThinkingCooldownToast();
}
async function waitForThinkingCooldown() {
  while (isThinkingCooldownActive()) {
    showThinkingCooldownToast();
    const remaining = getThinkingCooldownRemaining();
    await new Promise(r => setTimeout(r, Math.min(1000, Math.max(100, remaining))));
  }
}

async function acquireThinkingRequestSlot() {
  let release;
  const previous = THINKING_RUNTIME.requestGate;
  THINKING_RUNTIME.requestGate = new Promise(resolve => { release = resolve; });
  await previous;
  await waitForThinkingCooldown();
  THINKING_RUNTIME.requestInFlight++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    THINKING_RUNTIME.requestInFlight = Math.max(0, THINKING_RUNTIME.requestInFlight - 1);
    release();
  };
}

async function guardedFetch(url, options) {
  const release = await acquireThinkingRequestSlot();
  try {
    if (isCancellationRequested || options?.signal?.aborted) {
      const err = new Error('Request cancelled.');
      err.kind = 'cancelled';
      err.name = 'AbortError';
      throw err;
    }
    await waitForThinkingCooldown();
    if (isCancellationRequested || options?.signal?.aborted) {
      const err = new Error('Request cancelled.');
      err.kind = 'cancelled';
      err.name = 'AbortError';
      throw err;
    }
    return await fetch(url, options);
  } finally {
    release();
  }
}

function getModelFallbackCandidates(startCfg) {
  const models = Array.isArray(AI_MODELS_STATE.models) ? AI_MODELS_STATE.models : [];
  if (!startCfg || !models.length) return [];
  const startIdx = models.findIndex(m => m.id === startCfg.id);
  if (startIdx < 0) return [];
  const ordered = [];
  for (let i = 0; i < models.length; i++) {
    ordered.push(models[(startIdx + i) % models.length]);
  }
  return ordered;
}

function shouldFallbackToNextModel(err) {
  if (!err || err.noModelConfigured) return false;
  return classifyAIError(err).shouldFallback;
}

async function callAIAPIRawWithLocalRetry(messages, opts, cfg, modelsUsedSet) {
  let attempt = 0;
  while (true) {
    try {
      return await callAIAPIRaw(messages, { ...opts, modelConfig: cfg, modelsUsedSet });
    } catch (err) {
      if (isCancellationRequested || err?.kind === 'cancelled' || err?.name === 'AbortError') throw err;
      attempt++;
      const info = classifyAIError(err);
      if (!info.retryableLocally || attempt > THINKING_POLICY.MAX_LOCAL_RETRIES) {
        throw err;
      }
      console.warn(`[@Thinking] "${cfg.name}" transient error — local retry ${attempt}/${THINKING_POLICY.MAX_LOCAL_RETRIES}:`, err && err.message);
      await new Promise(r => setTimeout(r, THINKING_POLICY.LOCAL_RETRY_DELAY_MS * attempt));
    }
  }
}

async function callAIAPI(messages, opts = {}) {
  const { modelConfig, modelsUsedSet } = opts;
  const startCfg = modelConfig || getActiveAIModel();
  if (!startCfg) {
    const err = new Error('No AI model has been added yet. Go to the "AI Models" button above and add at least one model.');
    err.noModelConfigured = true;
    throw err;
  }

  const autoSwitch = getAutoSwitchEnabled();
  const candidates = autoSwitch ? getModelFallbackCandidates(startCfg) : [startCfg];
  const models = candidates.length ? candidates : [startCfg];
  const maxCycles = autoSwitch ? THINKING_POLICY.MAX_CYCLES : 1;
  let lastErr = null;

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    let cycleFailures = 0;
    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
      const cfg = models[modelIndex];
      try {
        if (document.getElementById('global-progress-overlay')?.style.display !== 'none') {
          if (typeof ProgressUI !== 'undefined' && ProgressUI.setActiveModel) ProgressUI.setActiveModel(cfg.name);
        }

        if (cfg.id !== AI_MODELS_STATE.activeModelId) {
          switchActiveModelTo(cfg, AI_MODELS_STATE.models.find(m => m.id === AI_MODELS_STATE.activeModelId));
        }

        const result = await callAIAPIRawWithLocalRetry(messages, opts, cfg, modelsUsedSet);

        markModelSuccess(cfg);
        if (modelsUsedSet) modelsUsedSet.add(cfg.name);
        if (result && typeof result === 'object') {
          result.modelConfig = cfg;
          result.modelId = cfg.id;
        }
        THINKING_RUNTIME.modelFailures.delete(cfg.id);
        return result;

      } catch (err) {
        if (isCancellationRequested || err?.kind === 'cancelled' || err?.name === 'AbortError') throw err;
        lastErr = err;
        cycleFailures++;
        if (modelsUsedSet) modelsUsedSet.add(cfg.name);
        markModelFailure(cfg, err);
        const info = classifyAIError(err);
        THINKING_RUNTIME.modelFailures.set(cfg.id, { at: Date.now(), error: err, kind: info.quota || info.status === 429 ? 'quota' : 'api-error' });
        console.warn(`[@Thinking] Cycle ${cycle}/${maxCycles}: "${cfg.name}" failed:`, err);
        if (!autoSwitch) { throw err; }

        if (modelIndex > 0) {
          const previousCfg = models[modelIndex - 1];
          const previousHealth = await probeAIModelHealth(previousCfg);
          if (previousHealth?.ok) {
            if (typeof switchActiveModelTo === 'function') {
              switchActiveModelTo(previousCfg, cfg);
            }
            if (typeof displayToastNotification === 'function') {
              displayToastNotification(`⚠️ "${cfg.name}" ${describeAIErrorForToast(err)} — previous model "${previousCfg.name}" is still healthy, so the request is sent back to that model.`);
            }
            throw err;
          }
          if (typeof displayToastNotification === 'function') {
            displayToastNotification(`⚠️ "${cfg.name}" ${describeAIErrorForToast(err)} — previous model "${previousCfg.name}" probe failed, trying "${models[modelIndex + 1]?.name || 'next configured model'}"`);
          }
        }

        if (modelIndex < models.length - 1) {
          if (typeof displayToastNotification === 'function') {
            displayToastNotification(`⚠️ "${cfg.name}" ${describeAIErrorForToast(err)} — trying "${models[modelIndex + 1].name}"`);
          }
        }
      }
    }
    if (cycleFailures === models.length) {
      if (cycle < maxCycles) {
        if (typeof displayToastNotification === 'function') {
          displayToastNotification(` All ${models.length} models failed — starting failover cycle ${cycle + 1}/${maxCycles}`);
        }
        continue;
      }
      startThinkingCooldown(`All ${models.length} configured models failed in ${maxCycles} complete cycles`);
      console.warn(`[@Thinking] All ${models.length} configured models failed in ${maxCycles} complete cycles. Cooldown is active.`);
      throw lastErr || new Error(`All ${models.length} configured AI models failed after ${maxCycles} cycles.`);
    }
  }
  throw lastErr || new Error('All configured AI models failed for this request.');
}

async function callAIAPIRaw(messages, { forceJson = true, maxTokens, modelConfig, modelsUsedSet, bypassThinkingCooldown = false } = {}) {
  const cfg = modelConfig || getActiveAIModel();
  if (!cfg) {
    const err = new Error('No AI model has been added yet.');
    err.noModelConfigured = true;
    throw err;
  }

  if (document.getElementById('global-progress-overlay')?.style.display !== 'none') {
    if (typeof ProgressUI !== 'undefined' && ProgressUI.setActiveModel) ProgressUI.setActiveModel(cfg.name);
  }

  const effectiveMaxTokens = undefined;

  // --- GEMINI branch ---
  if (cfg.apiType === 'gemini') {
    const geminiUrl = cfg.apiUrl.endsWith('?key=') ? cfg.apiUrl : cfg.apiUrl + (cfg.apiUrl.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(cfg.apiKey);
    const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system');

    function toGeminiParts(content) {
      if (!Array.isArray(content)) return [{ text: String(content || '') }];
      return content.flatMap(part => {
        if (!part) return [];
        if (part.type === 'text') return [{ text: String(part.text || '') }];
        if (part.type === 'image_url') {
          const url = part.image_url?.url || '';
          const match = /^data:([^;]+);base64,(.*)$/s.exec(String(url));
          return match ? [{ inline_data: { mime_type: match[1], data: match[2] } }] : [];
        }
        return [];
      });
    }

    function buildGeminiBody(withGoogleSearch) {
      const b = {
        contents: userMessages.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: toGeminiParts(msg.content)
        })),
        generationConfig: {
          temperature: APP_CONFIG.TEMPERATURE || 0.3,
        }
      };
      if (systemInstruction) {
        b.systemInstruction = { parts: [{ text: systemInstruction }] };
      }
      if (withGoogleSearch) {
        b.tools = [{ google_search: {} }];
      }
      return b;
    }

    async function doGeminiFetch(body) {
      const controller = new AbortController();
      activeRequestAbortController = controller;
      try {
        return await (bypassThinkingCooldown ? fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        }) : guardedFetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        }));
      } catch (netErr) {
        if (netErr.name === 'AbortError') throw new Error('Request cancelled.');
        throw new Error(`Network error: ${netErr.message}`);
      }
    }

    const wantsGoogleSearch = cfg.enableGoogleSearch !== false;
    let response = await doGeminiFetch(buildGeminiBody(wantsGoogleSearch));

    if (!response.ok && wantsGoogleSearch) {
      let firstErrDetail = '';
      try { const errJson = await response.clone().json();
        firstErrDetail = errJson.error?.message || JSON.stringify(errJson); } catch (_) { try { firstErrDetail = await response.clone().text(); } catch (_2) {} }
      const toolUnsupported = response.status === 400 && /tool|google_search|search grounding|not supported|unknown name/i.test(firstErrDetail || '');
      if (toolUnsupported) {
        console.warn(`[${cfg.name}] Google Search grounding not supported by this model/endpoint, retrying without it:`, firstErrDetail);
        response = await doGeminiFetch(buildGeminiBody(false));
      }
    }

    if (!response.ok) {
      let detail = '';
      try { const errJson = await response.json();
        detail = errJson.error?.message || JSON.stringify(errJson); } catch (_) { detail = await response.text(); }
      throw new Error(`Gemini API error (${response.status}): ${detail}`);
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates.length) {
      throw new Error('Gemini returned no candidates.');
    }
    const content = data.candidates[0].content?.parts?.map(p => p.text).join('') || '';
    const finishReason = data.candidates[0].finishReason || 'stop';
    const groundingMeta = data.candidates[0].groundingMetadata || null;
    return { content, finishReason, groundingMetadata: groundingMeta };
  }

  // --- Original OpenAI-compatible branch ---
  const wantsJson = forceJson && cfg.supportsJson !== false;
  let requestControllerForRestore = null;
  let previousAbortController = null;

  async function doRequest(useJsonMode) {
    if (isCancellationRequested) {
      const cancelErr = new Error('Request cancelled.');
      cancelErr.kind = 'cancelled';
      cancelErr.name = 'AbortError';
      throw cancelErr;
    }
    const requestController = new AbortController();
    previousAbortController = activeRequestAbortController;
    requestControllerForRestore = requestController;
    activeRequestAbortController = requestController;
    const body = {
      model: cfg.modelId,
      messages,
      temperature: APP_CONFIG.TEMPERATURE
    };
    if (useJsonMode) body.response_format = { type: "json_object" };

    let response;
    try {
      response = await (bypassThinkingCooldown ? fetch(cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: requestController.signal
      }) : guardedFetch(cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: requestController.signal
      }));
    } catch (networkError) {
      if (requestController.signal.aborted || isCancellationRequested || networkError?.name === 'AbortError') {
        const err = new Error('Request cancelled.');
        err.kind = 'cancelled';
        err.name = 'AbortError';
        throw err;
      }
      console.error(`[${cfg.name}] network/CORS error:`, networkError);
      const err = new Error(`Network/CORS error: could not reach the "${cfg.name}" model's API. Check your internet connection or the API URL.`);
      err.kind = 'network';
      throw err;
    }

    if (!response.ok) {
      let detail = '';
      let errorPayload = null;
      try {
        errorPayload = await response.json();
        detail = (errorPayload && errorPayload.error && (errorPayload.error.message || errorPayload.error.type || errorPayload.error.code)) || (errorPayload ? JSON.stringify(errorPayload) : '');
      } catch (e) { try { detail = await response.text(); } catch (e2) { detail = ''; } }
      console.error(`[${cfg.name}] API HTTP error:`, response.status, detail);
      const err = new Error(`API request failed for "${cfg.name}" (HTTP ${response.status}): ${detail || 'no further details returned'}`);
      err.status = response.status;
      err.detail = detail;
      err.payload = errorPayload;
      throw err;
    }

    let data;
    try { data = await response.json(); } catch (parseError) {
      const err = new Error(`Invalid JSON response from "${cfg.name}".`);
      err.kind = 'malformed_response';
      throw err;
    }
    const choice = (data.choices && data.choices[0]) ? data.choices[0] : {};
    const rawContent = (choice.message && choice.message.content) || '';
    const content = normalizeAIContent(rawContent);
    let finishReason = choice.finish_reason || 'stop';
    if (finishReason === 'length' && detectTruncatedContent(content, undefined)) {
      // still detect but we'll continue
    }
    if (!content || !String(content).trim()) {
      const err = new Error(`Empty or unusable response from "${cfg.name}".`);
      err.kind = 'empty_response';
      throw err;
    }
    return { content, finishReason };
  }

  try {
    const result = await doRequest(wantsJson);
    if (modelsUsedSet) modelsUsedSet.add(cfg.name);
    return result;
  } catch (err) {
    if (wantsJson && isJsonModeUnsupportedError(err.status, err.detail)) {
      console.warn(`[${cfg.name}] JSON mode unsupported — retrying once without response_format.`);
      cfg.supportsJson = false;
      const stateModel = AI_MODELS_STATE.models.find(m => m.id === cfg.id);
      if (stateModel) stateModel.supportsJson = false;
      saveAIModelsState();
      try {
        const result = await doRequest(false);
        if (modelsUsedSet) modelsUsedSet.add(cfg.name);
        return result;
      } catch (retryErr) { throw retryErr; }
    }
    throw err;
  } finally {
    if (requestControllerForRestore && activeRequestAbortController === requestControllerForRestore) {
      activeRequestAbortController = previousAbortController;
    }
  }
}

// ===== BUILD SHARED RULES =====
function buildSharedRules(isMonochromeMode, outputLanguage) {
  const labels = outputLanguage === 'en' ? {
    definition: 'Definition:',
    example: 'Example:',
    important: 'Remember:',
    note: 'Note:',
    warning: 'Caution:',
    solution: 'Solution'
  } : {
    definition: 'সংজ্ঞা:',
    example: 'উদাহরণ:',
    important: 'মনে রাখবেন:',
    note: 'নোট:',
    warning: 'সতর্কতা:',
    solution: 'সমাধান'
  };

  const styleGuide = isMonochromeMode ? `
    === MONOCHROME / PRINT STYLE GUIDE ===
    The rendering engine automatically forces pure black text on a white background.
    1. Rely purely on STRUCTURE for visual hierarchy: heading levels, bold, underline, spacing, borders.
    2. STILL use the callout wrapper divs below (block-definition, block-example, block-important, block-note, block-warning, block-solution) exactly as described — they render as clean bordered boxes in black & white. When a callout should sit directly on the page with NO background fill, use the transparent accent-line style instead: <div class="block-accent block-accent-blue">...</div>.
    3. Keep generous spacing and clear section breaks for clean photocopying/printing.
  ` : `
    === MODERN COLORFUL STYLE GUIDE ===
    Make the document look like a premium, professionally-designed study note.
    1. HEADING HIERARCHY: <h1>once for the document title (centered), <h2>for each major section, <h3>for sub-topics.
    2. CALLOUT BOXES — use these liberally to create visual rhythm:
      - <div class="block-definition"><b>${labels.definition}</b> ...</div> — definitions / key terms
      - <div class="block-example"><b>${labels.example}</b> ...</div> — worked examples
      - <div class="block-important"><b>${labels.important}</b> ...</div> — key formulas / must-remember facts
      - <div class="block-note"><b>${labels.note}</b> ...</div> — side notes / extra tips
      - <div class="block-warning"><b>${labels.warning}</b> ...</div> — common mistakes / cautions
      - <div class="block-accent block-accent-blue"><b>...</b> ...</div> — transparent accent-line callout: keep the page background visible and use only a colored left bar. Available accents: blue, red, orange, green, purple, pink.
    3. Use <table>for comparisons, classifications, or side-by-side data.
    4. Keep paragraphs SHORT (3-4 lines max). Prefer <ul>/<ol>lists over long paragraphs.
    5. Use <b>to bold key terms inline — sparingly.
    6. NEVER hardcode custom inline colors/styles that fight the theme.
  `;

  const languageFormat = typeof getActivePDFLanguageFormat === 'function' ? getActivePDFLanguageFormat() : 'default';
  const languageFormatInstruction = languageFormat === 'english' ? `
    === LANGUAGE FORMAT (MANDATORY — OVERRIDES EVERYTHING ELSE ABOUT LANGUAGE) ===
    The user has explicitly selected "English only" from the format menu. Write the ENTIRE document in English only, no matter what language the user's own message/prompt is written in. Do not add Bengali translations or any Bengali text.
  ` : languageFormat === 'bengali' ? `
    === LANGUAGE FORMAT (MANDATORY — OVERRIDES EVERYTHING ELSE ABOUT LANGUAGE) ===
    The user has explicitly selected "Bengali only" from the format menu. Write the ENTIRE document in Bengali (বাংলা) only, no matter what language the user's own message/prompt is written in. Do not add English translations or any English text (keep standard mathematical/scientific notation, symbols and proper nouns as-is).
  ` : languageFormat === 'english_bengali' ? `
    === LANGUAGE FORMAT (MANDATORY — OVERRIDES EVERYTHING ELSE ABOUT LANGUAGE) ===
    The user has explicitly selected "English then Bengali" from the format menu. This applies no matter what language the user's own message/prompt is written in. Present the document bilingually: write each section in English first, followed immediately by its Bengali translation. Keep the same structure and meaning in both languages.
  ` : languageFormat === 'bengali_english' ? `
    === LANGUAGE FORMAT (MANDATORY — OVERRIDES EVERYTHING ELSE ABOUT LANGUAGE) ===
    The user has explicitly selected "Bengali then English" from the format menu. This applies no matter what language the user's own message/prompt is written in. Present the document bilingually: write each section in Bengali first, followed immediately by its English translation. Keep the same structure and meaning in both languages.
  ` : '';

  const sourceInterpretationRules = `
    === SOURCE / ATTACHMENT INTERPRETATION RULES ===
    When attached files are provided, distinguish substantive subject matter from document-control metadata.
    Page numbers, page labels, repeated running headers/footers, OCR markers, publisher/navigation text and similar artifacts are NOT automatically content to answer with.
    Use metadata only to identify the source or topic. For explain, summarize, teach, analyze, or answer-from-file tasks, answer from the substantive material and ignore navigation/formatting artifacts unless explicitly asked.
    Never treat a page number, filename, book title, or repeated header as the requested explanation merely because it appears in the extracted source.
  `;

  const superFigureRules = `
    === SUPER-HIGH-QUALITY FIGURE / DRAWING ENGINE (MANDATORY) ===
    Treat every requested figure, drawing, diagram, chart, graph, illustration, schematic, timeline, process map, anatomy figure, geometry figure, concept map, mind map, or visual explanation as a PROFESSIONAL FIGURE — never as a crude placeholder.

    1. OUTPUT FORMAT:
      - Prefer self-contained inline SVG for diagrams, scientific figures, charts, schematics and explanatory drawings.
      - Wrap every major visual in:
       <figure class="figure-pro">
        <div class="figure-title">...</div>
        <div class="figure-frame"><svg viewBox="0 0 W H" ...>...</svg></div>
        <figcaption class="figure-caption"><span class="figure-number">Figure N.</span> ...</figcaption>
       </figure>
      - Use a stable, generous viewBox (normally 900–1200 wide) and let CSS scale it responsively.
      - Never use a tiny fixed-width SVG that becomes unreadable when printed.
      - Never create a visual using plain text/ASCII characters when an actual SVG can represent it.

    2. VISUAL DESIGN QUALITY:
      - Use a clear visual hierarchy: title → major objects → labels → annotations → caption.
      - Use consistent stroke widths, corner radii, spacing, typography and arrowheads.
      - Keep generous whitespace; NEVER overlap labels, arrows, nodes, legends, axes or shapes.
      - Align objects to an invisible grid.
      - Use balanced composition and optical centering, not random placement.
      - Use restrained colors with strong contrast; do not use a rainbow palette unless the subject genuinely requires categorical colors.
      - Use at most 5–7 principal colors in a single figure.
      - Important objects may use subtle fills; secondary objects should be visually quieter.
      - Text must remain readable at normal A4 print size.
      - Freely choose whatever palette best fits the subject — bright, muted, monochrome-with-one-accent, whatever communicates best. Nothing about color choice is fixed or forced.
      - NEVER fill a labeled box/rect/node with solid black (or near-black) as its background. A dark box paired with light text looks fine on screen but turns into a solid black rectangle (text and all) once the document is printed, photocopied, or viewed in monochrome/print mode. If a node needs to stand out, use a colored or light fill with dark text instead — never a black-background + light-text combo.

    3. TECHNICAL SVG QUALITY:
      - Include <defs>for reusable arrowheads, gradients only when useful, and markers.
      - Give every marker a UNIQUE id inside the SVG (e.g. arrow-fig-1), because multiple SVGs may coexist.
      - Use vector-effect="non-scaling-stroke" on important strokes.
      - Use shape-rendering="geometricPrecision" and text-rendering="geometricPrecision".
      - Avoid unnecessary filters, blur, huge shadows, raster screenshots, base64 images, or external assets.
      - Never rely on external fonts, images, CSS files or JavaScript for the figure to render.
      - Escape XML-sensitive text correctly (&amp;, &lt;, &gt;).
      - Do not place text directly on top of busy lines/shapes; use callout boxes or whitespace.

    4. LABELS AND ANNOTATIONS:
      - Every important object must have a concise label.
      - Long labels should wrap conceptually across multiple <text>/<tspan>lines rather than overflow outside nodes.
      - Connector labels must sit beside connectors with sufficient whitespace.
      - For scientific diagrams, label parts AND show directional relationships where useful.
      - For charts, include title, axes, units, legend and meaningful data labels only where they improve comprehension.
      - Never invent numerical values merely to make a chart look complete. If values are illustrative, explicitly label them "Illustrative".

    5. SUBJECT-SPECIFIC QUALITY:
      - FLOWCHART: use clear start/end, process, decision and connector shapes; avoid crossing lines; preserve logical order.
      - CONCEPT/MIND MAP: central concept + balanced branches; use relationship labels where useful; avoid a single boring vertical tree.
      - SCIENTIFIC/ANATOMICAL: use clean schematic shapes, leader lines and numbered callouts; prioritize correctness and legibility over decoration.
      - MATHEMATICS/GEOMETRY: use accurate proportions when possible, dimension lines, angle marks, arrows and LaTeX-style labels; never distort a geometric relationship without marking it schematic.
      - STATISTICAL CHART: axes, units, scale and legend must be internally consistent; no misleading truncated axes unless explicitly requested.
      - TIMELINE: consistent spacing, chronological direction, dates and event hierarchy.
      - PROCESS/SYSTEM SCHEMATIC: show inputs → transformations → outputs and label interfaces.
      - COMPARISON: use aligned columns/panels and visually encode similarities/differences.
      - TABLE-TO-FIGURE: if a table can be better understood visually, create a figure as well as preserving the source table.

    6. HIGH-DENSITY VISUAL REQUESTS:
      When the user asks for "detailed", "professional", "high quality", "super high", "advanced", "beautiful", "complete", "publication quality", "diagram", "figure", or similar:
      - Increase information density intelligently, NOT by making text tiny.
      - Include secondary annotations, legend, relationships, units, callouts and a useful caption when relevant.
      - Prefer one excellent figure over several repetitive weak figures.
      - If a topic has multiple complementary relationships, create 2–3 coordinated figures rather than one overcrowded figure.
      - Each figure must remain independently understandable.

    7. FULL CREATIVE FREEDOM — NOT LIMITED TO TEMPLATES:
      - The categories in section 5 are common cases, not a fixed menu. You are never limited to a "standard diagram look" — if a subject is better served by a custom illustration, icon set, artistic cross-section, stylized scene, annotated photo-realistic-style drawing, or any other original visual you can construct in SVG, build it.
      - You have the full SVG toolkit available: paths, curves, gradients, patterns, clipPaths, masks, multiple coordinated shapes — use whatever combination best explains the idea, not just rectangles and arrows.
      - When a figure would genuinely help understanding and no existing template fits well, invent the visual that fits rather than forcing the content into the closest template or skipping the visual.

    8. FINAL VISUAL QA BEFORE RETURNING HTML:
      Check mentally that:
      - no text is clipped;
      - no labels overlap;
      - no arrows terminate inside the wrong node;
      - no connector crosses unrelated content;
      - all referenced legend items exist;
      - all SVG ids are unique within the document;
      - viewBox contains every object with safe margins;
      - font sizes remain readable when printed;
      - figure title/caption match the actual content;
      - no placeholder such as "insert diagram here" remains.
  `;

  const conceptMapRules = `
    === CONCEPT MAPS / MIND MAPS / RELATIONSHIP DIAGRAMS ===
    When the user asks for a concept map, mind map, graph, relationship diagram, comparison diagram, or similar visual:
    - You MUST include an SVG diagram in the output — never skip it or describe it in text only.
    - Layout: central topic node in the middle/upper-center, with 3-6 child nodes branching outward (not just top-to-bottom).
    - Use the same <div class="fc-wrapper"><div class="fc-svg-wrapper"><svg viewBox="0 0 700 H" class="fc-svg"> ... </svg></div></div>pattern.
    - Box style: <rect class="fc-node-rect" x="..." y="..." width="..." height="..." rx="8" ry="8" />
    - Text: <text class="fc-node-text" x="..." y="..." text-anchor="middle" dominant-baseline="middle">Label</text>
    - Connectors: <line class="fc-line" x1="..." y1="..." x2="..." y2="..." marker-end="url(#arrow)" />
    - Arrowhead marker definition (include once per SVG):
     <defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#475569"/></marker></defs>
  `;

  const jsonEscapeRule = `
    === CRITICAL JSON ESCAPING RULE ===
    Every backslash inside a JSON string value must be doubled (\\\\) so it stays valid JSON — this applies to EVERY LaTeX command without exception: \\frac → \\\\frac, \\left → \\\\left, \\right → \\\\right, \\times → \\\\times, \\text → \\\\text, etc. Before finalizing your JSON output, mentally re-verify that no single unescaped backslash remains inside any string value.
  `;

  const detailInstruction = `
    === ABSOLUTE REQUIREMENT: COMPREHENSIVE, DETAILED, UNTRUNCATED OUTPUT ===
    You MUST produce the FULL, COMPLETE document as requested by the user. There is NO token limit or length restriction.
    - Cover every subtopic, every example, every explanation, every formula, every application, every comparison, every table, every diagram, and every useful visual that the user's request implies.
    - Do NOT shorten, summarize, or abbreviate any part of the content.
    - Do NOT omit any requested section, concept, or detail.
    - If the user asks for a "detailed PDF", you MUST generate a very long, thorough document that leaves no relevant aspect untouched.
    - The output must be self-contained and complete; do not assume the user knows anything about the topic.
    - Include multiple examples, step-by-step derivations, side notes, and practical applications where appropriate.
    - Use all the formatting and structural elements (headings, lists, tables, callouts, diagrams) to create a professional, high-quality document.
    - The user's instruction (e.g., "create a detailed PDF on quantum mechanics") must be fully realized in the content – the document must be about quantum mechanics with all necessary details, not a brief overview.
  `;

  return `
    ${detailInstruction}
    === CORE PHILOSOPHY: COMPLETENESS OVER BREVITY ===
    Quality > Brevity | Completeness > Shortness | Clarity > Compression.
    Default behavior: UNDERSTAND → EXTRACT → PRESERVE → ORGANIZE → EXPLAIN.
    Never delete useful information just to make output shorter.
    Never compress a user-requested document merely to reduce tokens, request size, API calls, or page count.
    When the task requests detail, depth and completeness take priority over brevity.

    === RESPONSE LANGUAGE RULE ===
    ${languageFormat !== 'default' ? `A LANGUAGE FORMAT has been explicitly selected by the user from the format menu (see the "LANGUAGE FORMAT" section below) — follow that format exactly for the document's language, regardless of what language the user's own message is written in. The rule below ("detect the user's language") only applies when no such format is selected.` : `Detect the language of the user's LATEST message (Bengali, English, or mixed) and reply in that SAME language.
    If the user explicitly asks for a specific language in their message, follow that instruction instead.`}

    === WHEN TO EDIT THE DOCUMENT VS. JUST REPLY ===
    Produce a document-editing action (append_content, prepend_content, update_section, replace_all, update_page) any time the user is asking to write, add, create, generate, insert, update, fix, correct, revise, edit, modify, expand, continue, improve, shorten, or otherwise change notes/content/a section/the document. For greetings, small talk, thanks, or questions about the app, respond with {"action": "chat_reply", "message": "..."}.

    ${sourceInterpretationRules}
    ${languageFormatInstruction}
    ${styleGuide}
    ${conceptMapRules}
    ${superFigureRules}
    ${jsonEscapeRule}

    === UNIVERSAL MATH DELIMITER RULE (CRITICAL) ===
    Every equation, no matter how short, must be wrapped in $...$ (inline) or $$...$$ (block) with NO exceptions.
    Inline variables like x, y, z used in a math sense also count — they must be wrapped: $x$, $y$, $z$.
    Never leave raw backslash commands outside delimiters.

    === ABSOLUTE BAN ON CODING / DECISION FLOWCHARTS ===
    NEVER generate coding or algorithmic flowcharts (NO IF/ELSE, NO "Yes/No" labels). For "flowchart", generate a clean "Sequential Step-by-Step Process Flow".

    === DIAGRAM RULE: A4-PAGE FIT ===
    Set SVG viewBox="0 0 700 H". Use the existing 'fc-node-rect' class for boxes. Use 'fc-node-rect yellow' sparingly (1-2 boxes max per diagram).

    === PROFESSIONAL MATHEMATICAL SOLUTION STANDARD ===
    Every solved math problem MUST use this structure:
    <div class="block-solution">
     <span class="sol-label">${labels.solution}</span>
     <div class="sol-given"><b>Given:</b> ...</div>
     <div class="math-step">
      <span class="math-step-label">Step 1: ...</span>
      $$ ... $$
     </div>
     <!-- repeat steps -->
     <div class="math-final-answer">Final Answer: $$ ... $$</div>
    </div>

    === MATRIX RENDERING: ABSOLUTE BAN ON PLAIN BRACKET TEXT ===
    NEVER write matrices as [[...]] plain text. Always use LaTeX \\begin{bmatrix}...\\end{bmatrix} inside $$ ... $$.
  `;
}

// ===== BUILD AI USER CONTENT =====
function getDirectAIAttachmentFiles() {
  const attachedFiles = APP_STATE?.attachedFiles || {};
  const fileObjects = APP_STATE?.fileObjects || {};
  return Object.entries(attachedFiles)
    .filter(([, fileData]) => fileData && fileData.needsVision)
    .map(([fileId, fileData]) => ({
      file: fileObjects[fileId] || null,
      fileData,
      fileId
    }))
    .filter(entry => entry.file || (Array.isArray(entry.fileData.visionDataUrls) && entry.fileData.visionDataUrls.length));
}

async function readFileAsDataUrlForAI(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name} for AI upload.`));
    reader.readAsDataURL(file);
  });
}

async function buildDirectAIAttachmentParts() {
  const directFiles = getDirectAIAttachmentFiles();
  const parts = [];
  for (const { file, fileData } of directFiles) {
    const filename = String(file?.name || fileData?.name || 'attachment').replace(/[\r\n]/g, ' ').trim();
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const visionDataUrls = Array.isArray(fileData?.visionDataUrls) ? fileData.visionDataUrls.filter(Boolean) : [];
    const dataUrl = file ? await readFileAsDataUrlForAI(file) : '';
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
      parts.push({ type: 'text', text: `[VISION FALLBACK IMAGE: ${filename}] Local OCR could not read this image reliably. Read the image directly.` });
      parts.push({ type: 'image_url', image_url: { url: dataUrl } });
    } else if (visionDataUrls.length) {
      parts.push({ type: 'text', text: `[VISION FALLBACK PAGES: ${filename}] Local OCR could not read these scanned page image(s) reliably. Read each image directly.` });
      visionDataUrls.forEach(url => parts.push({ type: 'image_url', image_url: { url } }));
    } else {
      continue;
    }
    if (fileData) fileData.sent = true;
  }
  return parts;
}

async function buildAIUserContent(promptText, fileContextString, suffixText = '') {
  const directParts = await buildDirectAIAttachmentParts();
  const baseText = `Prompt: ${promptText}\n\n${fileContextString || ''}${suffixText || ''}`.trim();
  if (!directParts.length) return baseText;
  return [{ type: 'text', text: baseText }, ...directParts];
}

function buildAttachmentContextForAI(promptText, shouldUseMemory, intentPayload) {
  const attachedEntries = Object.entries(APP_STATE.attachedFiles || {});
  if (!attachedEntries.length) return '';
  const explicitFileRef = isFileReferencedRequest(promptText);
  const forceForDocumentCreation = !!(intentPayload && ['create_pdf'].includes(intentPayload.intent));
  const includeAll = shouldUseMemory || explicitFileRef || forceForDocumentCreation;
  if (!includeAll) return '';
  const blocks = [];
  for (const [fileId, fileData] of attachedEntries) {
    if (!fileData) continue;
    if (fileData.sourceMode === 'ai' && !fileData.content) continue;
    if (!fileData.content) continue;
    const cleaned = cleanAttachmentSourceForAI(fileData.content);
    if (!cleaned) continue;
    const name = String(fileData.name || 'attached source').replace(/[\r\n]+/g, ' ').trim();
    blocks.push(`\n[SOURCE FILE ${blocks.length + 1}]\nFILE METADATA (do not treat as subject matter): filename = ${name}\nSOURCE CONTENT (use this as the substantive basis for the task):\n${cleaned}\nEND SOURCE FILE\n`);
    fileData.sent = true;
  }
  if (!blocks.length) return '';
  return blocks.join('\n') +
    '\n[SOURCE-CONTENT INTERPRETATION RULES]\n' +
    '- Treat SOURCE CONTENT as the authoritative basis for file-based questions.\n' +
    '- Ignore file names, page numbers, page labels, repeated headers/footers, OCR control markers, and other document-navigation metadata unless the user explicitly asks about them.\n' +
    '- A book title, chapter title, running header, author name, publisher line, or page number is not automatically the answer to a content question. Use such metadata only when relevant to identifying the source or topic.\n' +
    '- Do not answer with metadata merely because it appears prominently in the extracted text. Answer the substantive question using actual subject matter from the source.\n' +
    '- Preserve source wording, terminology, organization, framing, and level of detail when answering from the file. Do not silently replace unsupported source content with outside knowledge.\n' +
    '[/SOURCE-CONTENT INTERPRETATION RULES]\n';
}

function isFileReferencedRequest(promptText) {
  const text = String(promptText || '').trim();
  if (!text) return false;
  return /(\b(?:file|files|pdf|document|documents|book|books|chapter|chapters|image|images|photo|photos|attachment|attached|source|page)\b|\b(?:explain|summarize|summary|read|study|analyze|analyse|from this|from the file|from the attached|what does this say|what is in this|describe|answer from)\b|(?:ফাইল|পিডিএফ|ডকুমেন্ট|বই|অধ্যায়|পৃষ্ঠা|ছবি|ছবিগুলো|সংযুক্ত|এটা|এইটা|এখান থেকে|ব্যাখ্যা|সারাংশ|পড়|পড়ো|বিশ্লেষণ|বোঝাও))/i.test(text);
}

function cleanAttachmentSourceForAI(rawContent) {
  let text = String(rawContent || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  if (!text.trim()) return '';
  const lines = text.split('\n').map(line => line.trimEnd());
  const counts = new Map();
  for (const line of lines) {
    const normalized = line.replace(/\s+/g, ' ').trim();
    if (!normalized || normalized.length > 140) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) { if (out.length && out[out.length - 1] !== '') out.push('');
      continue; }
    if (/^\s*(?:[-_=]{2,}\s*)?page\s+\d+(?:\s*(?:of|\/|এর)\s*\d+)?\s*(?:[-_=]{2,})?\s*$/i.test(t)) continue;
    if (/^\s*(?:[-_=]{2,}\s*)?পৃষ্ঠা\s*\d+(?:\s*(?:\/|এর|মোট)\s*\d+)?\s*(?:[-_=]{2,})?\s*$/i.test(t)) continue;
    if (/^\[OCR reading applied to .*\]$/i.test(t)) continue;
    if (/^\.\.\.\[TRUNCATED\]$/i.test(t)) continue;
    if (/^\[?(?:end of )?page\s*\d+\]?$/i.test(t)) continue;
    const normalized = t.replace(/\s+/g, ' ');
    if ((counts.get(normalized) || 0) >= 3 && normalized.length <= 100 && !/[.!?;:।]$/.test(normalized)) continue;
    out.push(line);
  }
  while (out[0] === '') out.shift();
  while (out[out.length - 1] === '') out.pop();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function detectOutputLanguage(promptText) {
  const text = (promptText || '').toString();
  if (/\b(in\s+english|everything\s+(should\s+be\s+)?in\s+english|english\s+only|reply\s+in\s+english|write\s+in\s+english)\b/i.test(text)) return 'en';
  if (/(বাংলায়|বাংলা\s*ভাষায়)/i.test(text)) return 'bn';
  const bengaliChars = (text.match(/[\u0980-\u09FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return bengaliChars > latinChars ? 'bn' : 'en';
}

// ===== DOCUMENT GENERATION FUNCTIONS =====
let intentPayloadForGeneration = null;
let _topicPlan = null;
let _topicPlanDetails = [];
let _topicPlanMeta = { docTitle: 'Document', depth: 'standard', estimatedPages: 0, estimatedTokens: 0, useSections: false, reason: '' };
let _currentTopicIndex = 0;
let _accumulatedHTML = '';
let _lastModelResponse = '';
let _originalSystemPrompt = '';
let _originalUserMessages = [];
let _generationLockedModelConfig = null;

// ===== LIVE PAGE NUMBER UPDATE (NO CONTENT PREVIEW) =====
function _updateLivePageNumberFromCurrentDocument() {
  try {
    const container = document.getElementById('document-view-container');
    if (!container) return;
    const pages = container.querySelectorAll('.doc-page-canvas');
    if (!pages.length) return;
    const total = pages.length;
    const current = total;
    if (typeof ProgressUI !== 'undefined' && ProgressUI.updateLivePageNumber) {
      ProgressUI.updateLivePageNumber(current, total);
    }
  } catch (e) {
    console.warn('Live page number update failed:', e);
  }
}

function isDeepSeekModelConfig(cfg) {
  if (!cfg) return false;
  const haystack = [cfg.id, cfg.name, cfg.modelId, cfg.apiUrl].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes('deepseek');
}

function normalizeGeneratedSectionHTML(html, sectionTitle) {
  let value = String(html || '').trim();
  if (!value) return '';
  value = value.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const safeTitle = escapeHTML(String(sectionTitle || '').trim());
  const firstHeading = value.match(/^\s*<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/i);
  if (firstHeading) {
    const headingText = firstHeading[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (headingText.toLowerCase() === String(sectionTitle || '').trim().toLowerCase()) {
      return value;
    }
  }
  return `<h2>${safeTitle}</h2>${value}`;
}

async function generateHtmlContentWithAutoContinue(promptText, htmlSoFar, finishReason, modelsUsedSet, maxLoops = APP_CONFIG.CONTINUATION_MAX_LOOPS, lockedModelConfig = null) {
  let loops = 0;

  function getOverlapLength(tail, head) {
    const normalize = str => str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const normTail = normalize(tail);
    const normHead = normalize(head);
    const maxLen = Math.min(normTail.length, normHead.length);
    if (maxLen < 20) return 0;
    for (let len = Math.min(maxLen, 400); len > 20; len--) {
      if (normTail.slice(-len) === normHead.slice(0, len)) return len;
    }
    const threshold = Math.max(20, Math.min(100, maxLen * 0.8));
    if (normTail.length > threshold && normHead.length > threshold) {
      const tailSuffix = normTail.slice(-100);
      if (normHead.startsWith(tailSuffix) && tailSuffix.length > 20) return 100;
    }
    return 0;
  }

  while (finishReason === 'length' && loops < maxLoops) {
    if (isCancellationRequested) break;
    loops++;
    if (typeof displayToastNotification === 'function') {
      displayToastNotification(`🔃 Token limit reached — continuing generation (part ${loops + 1})...`);
    }
    if (typeof ProgressUI !== 'undefined' && ProgressUI.setLabel) {
      ProgressUI.setLabel(`Token limit reached — continuing generation (part ${loops + 1} of up to ${maxLoops + 1})...`);
      ProgressUI._setPercent(Math.min(90, 10 + (loops / maxLoops) * 80));
    }
    const continuationMessages = [
      { role: 'system', content: `You are continuing an HTML document generation that was cut off because it hit the output length limit. Continue the raw HTML fragment EXACTLY from where it stopped — do not repeat any earlier text, do not restart from the beginning, do not add any explanation, JSON wrapper, or markdown code fences. Output ONLY the next chunk of raw HTML that continues seamlessly from the given tail text.` },
      { role: 'user', content: `Original request: ${promptText}\n\nHere is the tail end of what has been generated so far (continue directly after this — do NOT repeat it):\n\n${htmlSoFar.slice(-1500)}` }
    ];
    try {
      const cont = await callAIAPI(continuationMessages, {
        forceJson: false,
        modelConfig: lockedModelConfig || _generationLockedModelConfig || undefined,
        modelsUsedSet: modelsUsedSet
      });
      if (cont && cont.modelConfig) _generationLockedModelConfig = cont.modelConfig;
      let chunk = (cont.content || '').replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
      if (!chunk) break;
      const tail = htmlSoFar.slice(-400);
      let overlapLen = 0;
      for (let len = Math.min(tail.length, chunk.length); len > 20; len--) {
        if (tail.slice(-len) === chunk.slice(0, len)) { overlapLen = len; break; }
      }
      if (overlapLen < 20) {
        const fuzzyLen = getOverlapLength(tail, chunk);
        if (fuzzyLen > 20) overlapLen = fuzzyLen;
      }
      if (overlapLen > 20) chunk = chunk.slice(overlapLen);
      if (!chunk) break;
      htmlSoFar += chunk;
      finishReason = cont.finishReason;
    } catch (e) { break; }
  }
  return htmlSoFar;
}

async function generateTopicPlan(promptText, fileContextString, isMonochromeMode, intentPayload, modelsUsedSet) {
  const explicitLong = intentPayload && intentPayload.length === 'long_pdf';
  const explicitShort = intentPayload && intentPayload.length === 'short_pdf';
  const outputLanguage = intentPayload && intentPayload.language ? intentPayload.language : detectOutputLanguage(promptText);
  const maxSections = explicitLong ? APP_CONFIG.LONG_PDF_MAX_SECTIONS : (explicitShort ? APP_CONFIG.STEP_MODE_SHORT_MAX_SECTIONS : APP_CONFIG.STEP_MODE_STANDARD_MAX_SECTIONS);

  const systemPromptForPlan =
    `You are the document-generation architecture decision-maker. Analyze the user's request BEFORE writing document text.\n` +
    `Decide how deep the final document genuinely needs to be and choose the least expensive strategy that still gives a complete, high-quality study document.\n` +
    `Do not confuse a single coherent topic with a small document. Detailed/comprehensive notes may need many pages even when they cover one coherent subject.\n` +
    `Consider requested depth words, number of concepts, formulas/theorems, examples, comparisons, exercises, attached-source coverage, and natural topic complexity.\n` +
    `${explicitLong ? `LONG PDF is explicit: use sections. There is NO fixed page target and NO page ceiling to aim for — decide the true length purely from how much genuine depth this exact subject supports: thorough explanations, derivations, multiple worked/solved math examples per concept, applications, comparisons, common mistakes, and exercises. A topic with real depth may need far more than a "typical" long document; a narrower topic should not be padded just to look long. Never pad or repeat to inflate length.` : ''}\n` +
    `${explicitShort ? 'SHORT PDF is explicit: keep it compact and complete, normally about 2–5 A4 pages.' : ''}\n` +
    `${!explicitLong && !explicitShort ? 'DEFAULT mode: use_sections=false only when the complete requested note can safely fit in one generation response. Otherwise use_sections=true and provide a useful outline.' : ''}\n` +
    `Never create sections merely to increase length. Each section must cover a distinct useful part of the request.\n` +
    `Return ONLY valid JSON:\n` +
    `{"doc_title":"title","depth":"compact|standard|detailed|very_detailed","use_sections":true|false,"estimated_pages":number,"estimated_output_tokens":number,"sections":[{"title":"...","needed":true,"estimated_pages":number,"target_depth":"normal|deep|very_deep","visual":"diagram|table|example|formula|none"}],"reason":"very short reason"}\n` +
    `For sectioned DEFAULT documents use roughly ${APP_CONFIG.STEP_MODE_STANDARD_MIN_SECTIONS}-${APP_CONFIG.STEP_MODE_STANDARD_MAX_SECTIONS} meaningful sections. For LONG use at least ${APP_CONFIG.LONG_PDF_MIN_SECTIONS} meaningful sections whenever the subject supports them, and more if the subject genuinely has more distinct sub-areas — do not collapse a broad/comprehensive request into a handful of generic sections. Each long section's estimated_pages should reflect how much real depth (derivations, multiple worked math examples, applications) that specific section needs — do not default every section to the same small number. For single-shot documents, sections must be [].\n` +
    `Language: ${outputLanguage}.`;

  const messages = [{ role: 'system', content: systemPromptForPlan }, { role: 'user', content: await buildAIUserContent(promptText, fileContextString || '(none)') }];
  const planBudget = explicitLong ? APP_CONFIG.PLAN_MAX_OUTPUT_TOKENS : APP_CONFIG.ROUTER_MAX_OUTPUT_TOKENS;
  let planResult = await callAIAPI(messages, { forceJson: true, modelsUsedSet, maxTokens: planBudget });
  let planJson = safeParseAIJson(planResult.content, null);
  if (!planJson && planResult.finishReason === 'length') {
    const retryBudget = Math.min(3000, planBudget * 2);
    planResult = await callAIAPI(messages, { forceJson: true, modelsUsedSet, maxTokens: retryBudget });
    planJson = safeParseAIJson(planResult.content, null) || attemptRepairAndParse(planResult.content);
  }

  if (!planJson) {
    const fallbackUseSections = explicitLong && getSectionModeEnabled();
    planJson = {
      doc_title: promptText.slice(0, 80) || 'Document',
      depth: explicitLong ? 'very_detailed' : (explicitShort ? 'compact' : 'detailed'),
      use_sections: fallbackUseSections,
      estimated_pages: explicitLong ? APP_CONFIG.LONG_PDF_MIN_PAGES : 4,
      estimated_output_tokens: explicitLong ? (fallbackUseSections ? APP_CONFIG.PDF_TOKEN_BUDGETS.LONG_BATCH : APP_CONFIG.PDF_TOKEN_BUDGETS.LONG_DIRECT) : APP_CONFIG.PDF_TOKEN_BUDGETS.DEFAULT_SINGLE,
      sections: explicitLong ? [{ title: promptText.slice(0, 80) || 'Document', needed: true, estimated_pages: APP_CONFIG.LONG_PDF_MIN_PAGES, target_depth: 'very_deep', visual: 'none' }] : [],
      reason: 'Planner recovery'
    };
  }

  const docTitle = planJson.doc_title || promptText.slice(0, 80) || 'Document';
  const depth = ['compact', 'standard', 'detailed', 'very_detailed'].includes(planJson.depth) ? planJson.depth : (explicitShort ? 'compact' : (explicitLong ? 'very_detailed' : 'detailed'));
  let estimatedPages = Number(planJson.estimated_pages) || (explicitLong ? APP_CONFIG.LONG_PDF_MIN_PAGES : 4);
  // No artificial floor here: the planner's own depth-based estimate stands as-is
  // (only guarded against a degenerate near-zero value from a parsing glitch).
  // Real length is ultimately driven by expandLongDocumentUntilMinimumPages(), which
  // keeps adding depth for as long as the topic genuinely supports it.
  if (explicitLong) estimatedPages = Math.max(3, estimatedPages);
  const estimatedTokens = Number(planJson.estimated_output_tokens) || 0;

  let sections = (Array.isArray(planJson.sections) ? planJson.sections : []).map(item => {
    if (typeof item === 'string') return { title: item.trim(), estimatedPages: 1, targetDepth: 'normal', visual: 'none' };
    if (!item || typeof item !== 'object' || item.needed === false) return null;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) return null;
    return {
      title,
      estimatedPages: Math.max(0.5, Number(item.estimated_pages) || 1),
      targetDepth: ['normal', 'deep', 'very_deep'].includes(item.target_depth) ? item.target_depth : 'normal',
      visual: item.visual || 'none'
    };
  }).filter(Boolean).slice(0, maxSections);

  if (explicitLong) {
    const desiredSections = Math.min(APP_CONFIG.LONG_PDF_MAX_SECTIONS, Math.max(APP_CONFIG.LONG_PDF_MIN_SECTIONS, sections.length));
    const perSectionTarget = Math.max(2, estimatedPages / Math.max(1, desiredSections));
    sections = sections.map((sec) => ({
      ...sec,
      estimatedPages: Math.max(2, Number(sec.estimatedPages) || 0, perSectionTarget),
      targetDepth: sec.targetDepth === 'normal' ? 'very_deep' : sec.targetDepth
    }));
    if (!sections.length) {
      sections = [{ title: docTitle, estimatedPages: Math.max(2, APP_CONFIG.LONG_PDF_MIN_PAGES), targetDepth: 'very_deep', visual: 'none' }];
    }
  }

  let useSections = planJson.use_sections === true;
  if (intentPayload && intentPayload.sectionMode === false) useSections = false;
  else if (explicitLong) useSections = getSectionModeEnabled();
  if (explicitShort) useSections = false;
  if (!explicitLong && !explicitShort) {
    useSections = useSections && (estimatedPages > APP_CONFIG.DEFAULT_SINGLE_MAX_PAGES || sections.length >= 2);
  }

  _topicPlan = sections.map(s => s.title);
  _topicPlanDetails = sections;
  _topicPlanMeta = { docTitle, depth, estimatedPages, estimatedTokens, useSections, reason: planJson.reason || '' };
  _currentTopicIndex = 0;
  _accumulatedHTML = '';
  _lastModelResponse = '';
  _generationLockedModelConfig = null;

  const outputLang = intentPayload && intentPayload.language ? intentPayload.language : detectOutputLanguage(promptText);
  const atCommandInstruction = typeof buildAtCommandInstructionText === 'function' ? buildAtCommandInstructionText(intentPayload) : '';
  _originalSystemPrompt = `You are an AI Document Assistant. MODE: ${isMonochromeMode ? 'MONOCHROME' : 'COLORFUL'}.\n${buildSharedRules(isMonochromeMode, outputLang)}\n${atCommandInstruction}`;
  _originalUserMessages = [{ role: 'system', content: _originalSystemPrompt }, { role: 'user', content: await buildAIUserContent(promptText, fileContextString) }];

  return { docTitle, depth, estimatedPages, estimatedTokens, sections: useSections ? sections.map(s => s.title) : [], sectionDetails: useSections ? sections : [], useSections, reason: planJson.reason || '' };
}

async function generateNextSection(sectionIndex, sectionTitle, modelsUsedSet) {
  if (!_topicPlan || sectionIndex >= _topicPlan.length) return null;
  const totalSections = _topicPlan.length;
  const sectionDetail = (_topicPlanDetails || [])[sectionIndex] || {};
  const plannedDepth = sectionDetail.targetDepth || (_topicPlanMeta.depth === 'very_detailed' ? 'very_deep' : 'normal');
  const plannedPages = Number(sectionDetail.estimatedPages) || 1;
  const lockedCfg = _generationLockedModelConfig || getActiveAIModel();
  const deepSeekMode = isDeepSeekModelConfig(lockedCfg);
  const sectionPrompt =
    `Write section ${sectionIndex + 1} of ${totalSections}: "${sectionTitle}" as a complete study-note section. ` +
    `Target depth=${plannedDepth}; roughly ${plannedPages} A4 page(s) of substantive material where appropriate. ` +
    `Cover all necessary subtopics, definitions, explanations, formulas/rules, examples/applications and important points relevant to this section. ` +
    `Do not compress merely to save tokens. ` +
    (intentPayloadForGeneration && intentPayloadForGeneration.length === 'long_pdf' ? `This is LONG PDF mode. There is no fixed page target for this section — develop it as deeply as the sub-topic genuinely supports, including derivations, multiple worked/solved math examples, applications, and common mistakes. Go beyond ${plannedPages} page(s) if the material truly warrants it; do not artificially stop at a round number, and do not pad if the topic is naturally short. ` : 'Keep this section complete and properly developed; do not reduce it to a short summary. ');

  const outlineContext = (_topicPlan || []).map((title, i) => `${i + 1}. ${title}${i === sectionIndex ? ' ← CURRENT SECTION' : i < sectionIndex ? ' completed' : ''}`).join('\n');
  const originalUser = _originalUserMessages.find(m => m.role === 'user')?.content || '';
  const systemContent = _originalSystemPrompt +
    `\n\nSECTION GENERATION RULES: Generate ONLY the current section "${sectionTitle}". Do not generate any other section. ` +
    `The section title must appear as the first heading. Do not include chat_summary, commentary, metadata, or explanations outside the document content.` +
    (deepSeekMode ? `\n\nDEEPSEEK COMPATIBILITY MODE: Output ONLY the raw HTML fragment for this single section. Do NOT wrap it in JSON. Do NOT use markdown fences. Keep all HTML valid and complete.` : `\n\nReturn JSON exactly in this shape: {"html_content":"<full HTML fragment for this section>"}. Do not add any other keys or prose.`);

  const messages = [{ role: 'system', content: systemContent }, { role: 'user', content: `Original request:\n${originalUser}\n\nAPPROVED DOCUMENT OUTLINE:\n${outlineContext}\n\nCURRENT SECTION:\n${sectionTitle}\n\n${sectionPrompt}` },
    ...(sectionIndex > 0 && _lastModelResponse ? [{ role: 'assistant', content: `Previous section tail for continuity only. Do not repeat it:\n${_lastModelResponse.slice(-1200)}` }] : [])
  ];

  const result = await callAIAPI(messages, {
    forceJson: !deepSeekMode,
    modelsUsedSet,
    modelConfig: lockedCfg || undefined,
    maxTokens: undefined
  });
  if (result && result.modelConfig) _generationLockedModelConfig = result.modelConfig;

  let sectionHtml = '';
  let parsed = safeParseAIJson(result.content, null);
  if (!parsed && result.content && result.finishReason === 'length') parsed = attemptRepairAndParse(result.content);
  if (parsed && typeof parsed.html_content === 'string') {
    sectionHtml = parsed.html_content;
  } else {
    sectionHtml = String(result.content || '').trim();
  }
  sectionHtml = sectionHtml.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
  if (!sectionHtml.startsWith('<') && /"html_content"\s*:/.test(sectionHtml)) {
    const recovered = attemptRepairAndParse(sectionHtml);
    if (recovered && typeof recovered.html_content === 'string') sectionHtml = recovered.html_content.trim();
  }
  sectionHtml = normalizeGeneratedSectionHTML(sectionHtml, sectionTitle);
  if (!sectionHtml || sectionHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length < 100) {
    const err = new Error(`Section "${sectionTitle}" returned too little usable content.`);
    err.kind = 'malformed_response';
    throw err;
  }
  if (result.finishReason === 'length') {
    sectionHtml = await generateHtmlContentWithAutoContinue(sectionPrompt, sectionHtml, result.finishReason, modelsUsedSet, APP_CONFIG.CONTINUATION_MAX_LOOPS, result.modelConfig || lockedCfg);
    sectionHtml = normalizeGeneratedSectionHTML(sectionHtml, sectionTitle);
  }
  _lastModelResponse = sectionHtml;
  return sectionHtml;
}

async function generateSectionBatch(startIndex, batchTitles, modelsUsedSet) {
  if (!_topicPlan || !batchTitles.length) return null;
  const totalSections = _topicPlan.length;
  const outlineContext = (_topicPlan || []).map((title, i) => {
    const inBatch = i >= startIndex && i < startIndex + batchTitles.length;
    return `${i + 1}. ${title}${inBatch ? ' ← WRITE NOW' : i < startIndex ? ' completed' : ''}`;
  }).join('\n');

  const requestedList = batchTitles.map((t, k) => {
    const detail = (_topicPlanDetails || [])[startIndex + k] || {};
    return `${startIndex + k + 1}. ${t} | target depth: ${detail.targetDepth || 'normal'} | target pages: ${Number(detail.estimatedPages) || 1}`;
  }).join('\n');

  const longPageTargetRule = intentPayloadForGeneration && intentPayloadForGeneration.length === 'long_pdf' ? `\nLONG MODE: there is no fixed page target. Develop every requested section as deeply as it genuinely supports — derivations, multiple worked math examples, applications, common mistakes. Do not compress, summarize, pad, or repeat merely to hit a length.` : '';
  const shortPageTargetRule = intentPayloadForGeneration && intentPayloadForGeneration.length === 'short_pdf' ? `\nSHORT MODE: keep the document focused and complete; do not pad or underwrite.` : '';
  const standardPageTargetRule = !intentPayloadForGeneration || !['short_pdf', 'long_pdf'].includes(intentPayloadForGeneration.length) ? `\nDEFAULT SECTIONED MODE: planner target is about ${Math.max(1, _topicPlanMeta.estimatedPages || 1)} A4 pages. Follow the planned depth for each section and do not turn sections into brief summaries.` : '';
  const batchSystemPrompt = _originalSystemPrompt +
    `\n\nIMPORTANT — MULTI-SECTION BATCH MODE: write ${batchTitles.length} consecutive sections in ONE response. ` +
    `Each requested section must be complete, deeply developed, and substantial. ` +
    `In LONG MODE, there is no fixed page target per section — write as much substantive material (derivations, worked examples, applications) as that section's sub-topic genuinely supports. ` +
    `Use multiple subheadings, definitions, explanations, derivations, formulas, worked examples, applications, comparisons, tables, callouts, exercises and relevant visuals where they materially improve the section. ` +
    `Do NOT deliberately shorten, summarize, compress or turn any requested section into a 1–3 paragraph overview merely because several sections share one request. ` +
    `Do not skip any requested section, and satisfy each section's target depth and target-page guidance from the list below. ` +
    longPageTargetRule + shortPageTargetRule + standardPageTargetRule +
    `\n{"sections":[{"title":"<exact section title as given>","html_content":"<full HTML fragment for that section>"}, ...]} — one object per requested section, in the same order they were requested.`;

  const messages = [{ role: 'system', content: batchSystemPrompt }, { role: 'user', content: `Original request:\n${_originalUserMessages.find(m => m.role === 'user')?.content || ''}\n\nAPPROVED DOCUMENT OUTLINE:\n${outlineContext}` },
    { role: 'assistant', content: `I have written ${startIndex} of ${totalSections} sections so far. Here is the last part of what I wrote (for continuity):\n\n${_lastModelResponse.slice(-1500)}` },
    { role: 'user', content: `Now write these ${batchTitles.length} section(s) in full:\n${requestedList}` }
  ];

  const result = await callAIAPI(messages, { forceJson: true, modelsUsedSet: modelsUsedSet, modelConfig: _generationLockedModelConfig || undefined, maxTokens: undefined });
  if (result && result.modelConfig) _generationLockedModelConfig = result.modelConfig;
  let parsed = safeParseAIJson(result.content, null);
  if (!parsed && result.content && result.finishReason === 'length') parsed = attemptRepairAndParse(result.content);

  let sectionsOut;
  let batchWasComplete = false;
  if (parsed && Array.isArray(parsed.sections) && parsed.sections.length) {
    sectionsOut = batchTitles.map((title, k) => {
      const match = parsed.sections[k];
      const html = match && typeof match.html_content === 'string' ? normalizeGeneratedSectionHTML(match.html_content, title) : '';
      return { title, html };
    });
    batchWasComplete = sectionsOut.every(s => s.html && s.html.length > 250);
  } else {
    console.warn('[StepByStep] Batch response was not valid section JSON; refusing to inject raw model output into the document.');
    sectionsOut = batchTitles.map(title => ({ title, html: '' }));
    batchWasComplete = false;
  }

  if (!batchWasComplete) {
    if (batchTitles.length === 1 && !batchWasComplete) {
      const retryMessages = [{ role: 'system', content: _originalSystemPrompt +
          `\n\nRECOVERY MODE: The previous structured response was malformed or truncated. Write ONLY the complete raw HTML fragment for this ONE section. Do not output JSON, markdown fences, chat_summary, commentary, or any wrapper. In LONG MODE, make this section deeply developed (normally about 2–3 A4 pages of substantive material) with full subtopics, explanations, examples/applications and useful visuals where relevant. Never compress merely because this is a recovery request. Fully complete the requested section before stopping.` }, { role: 'user', content: `Original request:\n${_originalUserMessages.find(m => m.role === 'user')?.content || ''}\n\nSection to write:\n${batchTitles[0]}\n\nApproved outline:\n${outlineContext}` }];
      try {
        const retryResult = await callAIAPI(retryMessages, { forceJson: false, modelsUsedSet: modelsUsedSet, modelConfig: result.modelConfig || _generationLockedModelConfig || undefined, maxTokens: undefined });
        if (retryResult && retryResult.modelConfig) _generationLockedModelConfig = retryResult.modelConfig;
        const rawHtml = (retryResult.content || '').replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
        if (/<[a-z][\s\S]*>/i.test(rawHtml) && rawHtml.length > 100) {
          return [{ title: batchTitles[0], html: rawHtml }];
        }
      } catch (recoveryErr) { console.warn('[StepByStep] Raw HTML recovery failed:', recoveryErr); }
    }
    if (batchTitles.length > 1) {
      const half = Math.max(1, Math.ceil(batchTitles.length / 2));
      if (half < batchTitles.length) {
        console.warn(`[StepByStep] Incomplete batch ${startIndex + 1}-${startIndex + batchTitles.length}; retrying as ${half}-section batches.`);
        const firstTitles = batchTitles.slice(0, half);
        const secondTitles = batchTitles.slice(half);
        const first = await generateSectionBatch(startIndex, firstTitles, modelsUsedSet);
        const second = secondTitles.length ? await generateSectionBatch(startIndex + half, secondTitles, modelsUsedSet) : [];
        return [...(first || []), ...(second || [])];
      }
    }
    if (result.finishReason !== 'length') {
      const err = new Error(`Incomplete batch response: expected ${batchTitles.length} full sections, received fewer.`);
      err.kind = 'empty_response';
      throw err;
    }
  }

  if (result.finishReason === 'length') {
    const joinedHtml = sectionsOut.map(s => s.html).join('');
    const extended = await generateHtmlContentWithAutoContinue(`Continue writing: ${requestedList}`, joinedHtml, result.finishReason, modelsUsedSet, APP_CONFIG.CONTINUATION_MAX_LOOPS, result.modelConfig);
    if (sectionsOut.length) sectionsOut[sectionsOut.length - 1].html += extended.slice(joinedHtml.length);
  }
  _lastModelResponse = sectionsOut.map(s => s.html).join('').slice(-1500) || _lastModelResponse;
  return sectionsOut;
}

async function expandLongDocumentUntilMinimumPages(promptText, modelsUsedSet, minPages = APP_CONFIG.LONG_PDF_MIN_PAGES, maxRounds = APP_CONFIG.LONG_EXPANSION_MAX_ROUNDS) {
  // NOTE: `minPages` is kept only for the progress-label text and as a legacy
  // parameter; it is NOT used to stop expansion early anymore. Expansion keeps
  // going — regardless of how many pages already exist — for as long as the AI
  // itself finds genuinely new, non-repetitive depth to add for this specific
  // topic (more derivations, worked/solved math examples, applications,
  // comparisons, common mistakes, exercises). It stops when the AI reports the
  // document is complete, when growth stalls for a couple of rounds in a row
  // (a sign the topic is exhausted), or when the safety ceiling is hit.
  if (!intentPayloadForGeneration || intentPayloadForGeneration.length !== 'long_pdf') return true;
  const maxLowGrowthRounds = APP_CONFIG.LONG_EXPANSION_MAX_LOW_GROWTH_ROUNDS || 2;
  let lowGrowthStreak = 0;

  for (let round = 1; round <= maxRounds; round++) {
    const currentPages = document.getElementById('document-view-container')?.querySelectorAll('.doc-page-canvas').length || 0;
    if (currentPages >= APP_CONFIG.LONG_PDF_MAX_PAGES_HARD) return true;
    await waitWhilePaused();
    if (isCancellationRequested) return false;

    if (typeof ProgressUI !== 'undefined' && ProgressUI.setLabel) {
      ProgressUI.setLabel(`Long PDF — checking for more genuine depth to add (round ${round}/${maxRounds}, currently ${currentPages} pages)...`);
    }
    const outlineContext = (_topicPlan || []).map((title, i) => `${i + 1}. ${title}`).join('\n');
    const currentHTML = typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '';
    const system = _originalSystemPrompt +
      `\n\nLONG-PDF DEPTH EXPANSION MODE: There is NO fixed page target and NO page ceiling to chase. Carefully judge, purely on merit, whether this exact topic still has real, non-repetitive depth worth adding: missing subtopics, deeper derivations, additional worked/solved math examples, applications, comparisons, common mistakes, useful tables/diagrams, or exercises. ` +
      `If genuine depth remains, add it now — do not hold back or artificially cap length. If the document already covers the topic thoroughly and anything more would just be padding or repetition, do NOT invent filler; instead return an empty html_content and set complete to true. ` +
      `Return ONLY JSON: {"html_content":"<HTML to append, or an empty string if the document is already complete>","complete":true|false}`;
    const messages = [{ role: 'system', content: system }, { role: 'user', content: `Original request:\n${promptText}\n\nAPPROVED OUTLINE:\n${outlineContext}\n\nCURRENT DOCUMENT (append only; do not repeat it):\n${currentHTML.slice(-12000)}` }];
    try {
      const result = await callAIAPI(messages, { forceJson: true, modelsUsedSet, maxTokens: undefined });
      let parsed = safeParseAIJson(result.content, null);
      if (!parsed && result.content && result.finishReason === 'length') parsed = attemptRepairAndParse(result.content);
      const html = parsed && typeof parsed.html_content === 'string' ? parsed.html_content.trim() : '';
      const modelSaysComplete = !!(parsed && parsed.complete === true);

      if (!html || html.length < 300) {
        // Nothing substantive came back — either the model explicitly says the
        // document is done, or this round just under-delivered.
        if (modelSaysComplete) return true;
        lowGrowthStreak++;
        if (lowGrowthStreak >= maxLowGrowthRounds) return true;
        continue;
      }
      lowGrowthStreak = 0;

      const previousHTML = _accumulatedHTML;
      _accumulatedHTML += html;
      if (typeof paginateDocumentCanvasAsync === 'function') await paginateDocumentCanvasAsync(_accumulatedHTML, false);
      _updateLivePageNumberFromCurrentDocument();
      const afterPages = document.getElementById('document-view-container')?.querySelectorAll('.doc-page-canvas').length || 0;
      if (afterPages > APP_CONFIG.LONG_PDF_MAX_PAGES_HARD) {
        _accumulatedHTML = previousHTML;
        if (typeof paginateDocumentCanvasAsync === 'function') await paginateDocumentCanvasAsync(_accumulatedHTML, false);
        if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
        if (typeof displayToastNotification === 'function') {
          displayToastNotification(`Long PDF reached the safe page ceiling (${APP_CONFIG.LONG_PDF_MAX_PAGES_HARD} pages); stopping expansion.`);
        }
        return true;
      }
      if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
      if (modelSaysComplete) return true;
    } catch (e) {
      console.warn('[Long PDF expansion] round failed:', e);
      lowGrowthStreak++;
      if (lowGrowthStreak >= maxLowGrowthRounds || round >= maxRounds) return true;
    }
  }
  return true;
}

async function generateComprehensiveDocumentStepByStep(promptText, fileContextString, isMonochromeMode, isEmptyCanvas, isReplaceIntent, modelsUsedSet, intentPayload, precomputedPlan = null) {
  if (!getSectionModeEnabled() || (intentPayload && intentPayload.sectionMode === false)) return false;
  const requestSessionId = APP_STATE.activeSessionId;
  if (!getSectionModeEnabled()) return false;

  if (typeof ProgressUI !== 'undefined' && ProgressUI.show) {
    ProgressUI.show(precomputedPlan ? 'Preparing document sections...' : 'Planning document outline...', precomputedPlan ? 'AI is preparing the approved structure...' : 'AI is creating the document structure...');
  }
  try {
    if (isCancellationRequested) return false;
    const plan = precomputedPlan || await generateTopicPlan(promptText, fileContextString, isMonochromeMode, intentPayload, modelsUsedSet);
    if (plan && Array.isArray(plan.sections) && plan.sections.length && typeof ProgressUI !== 'undefined' && ProgressUI.setScope) {
      ProgressUI.setScope(`Total sections: ${plan.sections.length}`);
    }
    if (!plan || !plan.useSections || !plan.sections || plan.sections.length === 0) {
      if (intentPayload && intentPayload.length === 'long_pdf') throw new Error('Long PDF planner did not produce a usable section outline.');
      return false;
    }

    const { docTitle, sections } = plan;
    intentPayloadForGeneration = intentPayload || null;
    const keepExisting = !isEmptyCanvas && !isReplaceIntent;
    const existingHTML = keepExisting ? (typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '') : '';
    const titleHTML = `<h1 style="text-align:center;">${escapeHTML(docTitle.toString())}</h1>`;
    _accumulatedHTML = existingHTML ? existingHTML + '<br><br>' + titleHTML : titleHTML;
    if (typeof paginateDocumentCanvasAsync === 'function') await paginateDocumentCanvasAsync(_accumulatedHTML, false);
    _updateLivePageNumberFromCurrentDocument();

    if (typeof ProgressUI !== 'undefined' && ProgressUI.startStepEstimate) ProgressUI.startStepEstimate(sections.length);
    if (typeof ProgressUI !== 'undefined' && ProgressUI.setLabel) ProgressUI.setLabel(`Writing section 1 of ${sections.length}: ${sections[0]}`);

    let allSectionsSuccess = true;
    for (let i = 0; i < sections.length; i++) {
      if (requestSessionId !== APP_STATE.activeSessionId) { if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide(); return false; }
      if (isCancellationRequested) break;
      await waitWhilePaused();
      if (isCancellationRequested) break;

      const title = sections[i];
      if (typeof ProgressUI !== 'undefined' && ProgressUI.setLabel) ProgressUI.setLabel(`Writing section ${i + 1} of ${sections.length}: ${title}`);
      if (typeof ProgressUI !== 'undefined' && ProgressUI.setScope) ProgressUI.setScope(`Total sections: ${sections.length}  •  Current: ${i + 1}`);

      const previousHTML = _accumulatedHTML;
      try {
        let sectionHtml = '';
        let lastError = null;
        for (let attempt = 1; attempt <= 3 && !sectionHtml; attempt++) {
          try {
            const generated = await generateNextSection(i, title, modelsUsedSet);
            if (generated && generated.trim().length >= 100) { sectionHtml = generated.trim(); } else { throw new Error('Section response was empty or too short.'); }
          } catch (e) {
            lastError = e;
            console.warn(`[StepByStep] Section ${i + 1} attempt ${attempt}/3 failed:`, e);
            if (attempt < 3) await new Promise(r => setTimeout(r, 350 * attempt));
          }
        }
        if (!sectionHtml) { throw new Error(`Section ${i + 1} could not be generated${lastError ? `: ${lastError.message}` : ''}`); }

        _accumulatedHTML = previousHTML + sectionHtml;
        if (typeof paginateDocumentCanvasAsync === 'function') await paginateDocumentCanvasAsync(_accumulatedHTML, false);
        _updateLivePageNumberFromCurrentDocument();

        if (intentPayload && intentPayload.length === 'long_pdf') {
          const currentPages = document.getElementById('document-view-container')?.querySelectorAll('.doc-page-canvas').length || 0;
          if (currentPages > APP_CONFIG.LONG_PDF_MAX_PAGES_HARD) {
            _accumulatedHTML = previousHTML;
            if (typeof paginateDocumentCanvasAsync === 'function') await paginateDocumentCanvasAsync(_accumulatedHTML, false);
            if (typeof displayToastNotification === 'function') {
              displayToastNotification(`Long PDF reached the safe page ceiling (${APP_CONFIG.LONG_PDF_MAX_PAGES_HARD} pages); the last section was not added.`);
            }
            allSectionsSuccess = false;
            break;
          }
        }

        if (typeof checkForDuplicateHeadings === 'function') checkForDuplicateHeadings();
        if (typeof ProgressUI !== 'undefined' && ProgressUI.reportStepComplete) ProgressUI.reportStepComplete(i + 1);
        _currentTopicIndex = i + 1;
        if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
        await waitWhilePaused();
        if (isCancellationRequested) break;
      } catch (e) {
        console.error(`[StepByStep] Section ${i + 1} failed:`, e);
        const reason = describeAIErrorForToast(e) || (e && e.message) || 'unknown error';
        if (typeof displayToastNotification === 'function') displayToastNotification(`⚠️ Section ${i + 1} failed — ${reason}`);
        allSectionsSuccess = false;
        if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
        break;
      }
    }

    await waitWhilePaused();
    if (isCancellationRequested) { intentPayloadForGeneration = null; return false; }
    if (allSectionsSuccess && intentPayload && intentPayload.length === 'long_pdf') {
      await expandLongDocumentUntilMinimumPages(promptText, modelsUsedSet, APP_CONFIG.LONG_PDF_MIN_PAGES, APP_CONFIG.LONG_EXPANSION_MAX_ROUNDS);
      const finalPages = document.getElementById('document-view-container')?.querySelectorAll('.doc-page-canvas').length || 0;
      if (typeof displayToastNotification === 'function') {
        displayToastNotification(`Long PDF finished at ${finalPages} pages — length was decided by how much genuine depth the topic supported.`);
      }
    }
    if (typeof ProgressUI !== 'undefined' && ProgressUI.setLabel) ProgressUI.setLabel('Checking equations & diagrams...');
    if (typeof repairEquationsInNewContent === 'function') await repairEquationsInNewContent(modelsUsedSet);
    _accumulatedHTML = typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '';
    _updateLivePageNumberFromCurrentDocument();

    if (allSectionsSuccess) {
      if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
      if (typeof ProgressUI !== 'undefined') { ProgressUI.finish();
        setTimeout(() => { if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide(); }, 500); }
      if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('ai', `✅ "${docTitle}" — notes generated!`);
      intentPayloadForGeneration = null;
      _generationLockedModelConfig = null;
      return true;
    } else {
      if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
      if (typeof ProgressUI !== 'undefined') { ProgressUI.finish();
        setTimeout(() => { if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide(); }, 500); }
      if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('ai', `✅ "${docTitle}" — partially generated (some sections skipped).`);
      intentPayloadForGeneration = null;
      return true;
    }
  } catch (error) {
    if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
    intentPayloadForGeneration = null;
    if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', `⚠️ Error: ${error.message}`);
    return false;
  }
}

// ===== GENERATE DEFAULT PDF DIRECT MODE =====
async function generateDefaultPDFDirectMode(promptText, fileContextString, isMonochromeMode, isEmptyCanvas, isReplaceIntent, modelsUsedSet, intentPayload) {
  const outputLanguage = intentPayload?.language || detectOutputLanguage(promptText);
  const existingHTML = (!isEmptyCanvas && !isReplaceIntent) ? (typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '') : '';
  const currentText = existingHTML ? (typeof getCanvasContentWithLatexSource === 'function' ? getCanvasContentWithLatexSource() : '') : '';
  const requestSessionId = APP_STATE.activeSessionId;
  const activeCfg = _generationLockedModelConfig || undefined;

  const systemPrompt =
    `You are the dedicated DEFAULT PDF document generator for AI PDF Studio.\n` +
    `Return ONLY the complete document content as raw HTML. Do NOT return JSON, markdown fences, chat commentary, an outline-only response, or an action wrapper.\n` +
    `Language: ${outputLanguage}.\n` +
    `${buildSharedRules(isMonochromeMode, outputLanguage)}\n` +
    `${typeof buildAtCommandInstructionText === 'function' ? buildAtCommandInstructionText({ intent: 'create_pdf', length: null, language: outputLanguage, sectionMode: false }) : ''}\n` +
    `DEFAULT DIRECT RULES: create the complete requested document in one continuous generation flow. Follow the user's requested scope, depth and detail. There is no fixed page target. Do not intentionally compress a detailed request, and do not pad a simple request. Use natural headings, definitions, explanations, formulas, worked examples, tables and useful visuals where they materially improve the document.\n` +
    `OUTPUT SAFETY: the result must contain substantial visible explanatory content, not just a title or outline. Use semantic HTML suitable for the existing A4 pagination engine.`;

  const userPrompt =
    `USER REQUEST:\n${promptText}\n\n` +
    (fileContextString ? `ATTACHED SOURCE CONTEXT:\n${fileContextString}\n\n` : '') +
    (currentText ? `CURRENT DOCUMENT CONTEXT (preserve only when the user did not ask to replace/rewrite):\n${currentText.slice(0, 16000)}\n\n` : '') +
    `Generate the complete DEFAULT PDF document now. Return HTML only.`;

  const extractHTML = (result) => {
    const raw = String(result?.content || '').replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
    let value = raw;
    const parsed = safeParseAIJson(raw, null) || (raw.startsWith('{') ? attemptRepairAndParse(raw) : null);
    if (parsed) {
      if (typeof parsed.html_content === 'string') value = parsed.html_content;
      else if (typeof parsed.new_html === 'string') value = parsed.new_html;
      else if (typeof parsed.message === 'string') value = parsed.message;
    }
    value = String(value || '').replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
    if (!/<[a-z][\s\S]*>/i.test(value) && value.length > 300) value = convertTextToDocumentHTML(value);
    return value;
  };
  const usableTextLength = (html) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return (tmp.innerText || tmp.textContent || '').replace(/\s+/g, ' ').trim().length;
  };

  if (typeof ProgressUI !== 'undefined' && ProgressUI.show) {
    ProgressUI.show('Generating PDF...', 'AI is writing the document…');
    ProgressUI.startAutoEstimate(APP_CONFIG.SINGLE_SHOT_ESTIMATED_SECONDS);
    // startPct 26 (not 8) so the modal's step indicator lands on "Write" for
    // this stage instead of "Plan" — this call covers the actual document
    // writing, which is most of the wait time for a single-shot (non-sectioned)
    // generation. At 8 it fell under the setStage()'s own <25 "Plan" threshold,
    // so the indicator sat frozen on "Plan" through the whole generation and
    // only jumped (skipping "Write" entirely) once the response came back —
    // looking like the modal "did nothing" until the PDF appeared all at once.
    ProgressUI.setStage('AI PDF generation in progress…', 26, 72, { indeterminate: true });
  }

  try {
    let result = await callAIAPI([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], {
      forceJson: false,
      modelsUsedSet,
      modelConfig: activeCfg,
      maxTokens: undefined
    });
    if (result && result.modelConfig) _generationLockedModelConfig = result.modelConfig;

    if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Processing AI response…', 72, 84);
    let generated = extractHTML(result);

    if (generated && generated.startsWith('{') && generated.includes('"action"')) {
      const parsedJson = safeParseAIJson(generated, null);
      if (parsedJson && parsedJson.action === 'chat_reply' && parsedJson.message) {
        generated = convertTextToDocumentHTML(parsedJson.message);
      }
    }

    if (usableTextLength(generated) < 250) {
      const retryResult = await callAIAPI([
        { role: 'system', content: systemPrompt + `\nRECOVERY RULE: The previous response was too short or incomplete. Write the actual full document now. Do not output only the title, outline or summary. Return substantive HTML only.` },
        { role: 'user', content: userPrompt + `\nIMPORTANT: The final result must contain real explanatory content suitable for a PDF, not an outline.` }
      ], {
        forceJson: false,
        modelsUsedSet,
        modelConfig: result?.modelConfig || _generationLockedModelConfig || activeCfg,
        maxTokens: undefined
      });
      if (retryResult && retryResult.modelConfig) _generationLockedModelConfig = retryResult.modelConfig;
      const retryHTML = extractHTML(retryResult);
      if (usableTextLength(retryHTML) > usableTextLength(generated)) {
        generated = retryHTML;
      }
    }

    if (requestSessionId !== APP_STATE.activeSessionId) return { ok: false, aborted: true };
    if (usableTextLength(generated) < 250) {
      const msg = 'The AI did not generate any document content. Please try a more specific request, or check your AI model settings.';
      if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', msg);
      if (typeof displayToastNotification === 'function') displayToastNotification(msg);
      return { ok: false, message: msg };
    }

    if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
    if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Rendering A4 pages…', 84, 96);
    const finalHTML = isEmptyCanvas || isReplaceIntent ? generated : `${existingHTML}<br><br>${generated}`;
    _accumulatedHTML = finalHTML;
    if (typeof setDocumentHTMLAndPaginate === 'function') setDocumentHTMLAndPaginate(finalHTML, false);
    _updateLivePageNumberFromCurrentDocument();
    if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Finalizing PDF…', 96, 99);

    const currentPages = document.getElementById('document-view-container')?.querySelectorAll('.doc-page-canvas').length || 0;
    const lastText = typeof getCanvasContentWithLatexSource === 'function' ? getCanvasContentWithLatexSource().slice(-18000) : '';
    if (currentPages > 0 && detectTruncatedContent(generated, undefined)) {
      const continuation = await callAIAPI([
        { role: 'system', content: `Continue the SAME DEFAULT PDF document. Return ONLY a new HTML fragment to append. Do not restart, repeat the title, summarize, or output JSON/markdown. Add genuinely new content needed to complete the user's request.\nUSER REQUEST: ${promptText}` },
        { role: 'user', content: `CURRENT DOCUMENT TAIL:\n${lastText}\n\nAPPEND NEW CONTENT ONLY.` }
      ], {
        forceJson: false,
        modelsUsedSet,
        modelConfig: _generationLockedModelConfig || result?.modelConfig || activeCfg,
        maxTokens: undefined
      });
      if (continuation && continuation.modelConfig) _generationLockedModelConfig = continuation.modelConfig;
      const moreHTML = extractHTML(continuation);
      if (usableTextLength(moreHTML) >= 300) {
        _accumulatedHTML += moreHTML;
        if (typeof setDocumentHTMLAndPaginate === 'function') setDocumentHTMLAndPaginate(_accumulatedHTML, false);
        _updateLivePageNumberFromCurrentDocument();
      }
    }

    if (typeof checkForDuplicateHeadings === 'function') checkForDuplicateHeadings();
    if (typeof ProgressUI !== 'undefined') {
      ProgressUI.finish();
      // FIX: "PDF created but editor looks blank until page refresh".
      // finish() only updates the progress card to its "done" state — it
      // never sets the overlay's display back to 'none'. The overlay is a
      // full-screen, blurred, z-index:9999 layer, so even though the
      // document was already paginated into the editor behind it, the
      // still-visible overlay hid everything until a refresh reset it.
      // Every other generation path (long/sectioned PDF, OCR, etc.) pairs
      // finish() with a delayed hide(); this path was missing it.
      setTimeout(() => { if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide(); }, 400);
    }
    return { ok: true };
  } catch (e) {
    console.error('[Default PDF Direct Mode] failed:', e);
    const errorMsg = (e && e.message) ? String(e.message) : 'Unknown error.';
    if (e && e.noModelConfigured) {
      if (typeof appendChatMessageToUI === 'function') {
        appendChatMessageToUI('error', '⚠️ No AI model configured. Please click the "AI Models" button in the top bar, add a model, and try again.');
      }
      if (typeof displayToastNotification === 'function') {
        displayToastNotification('⚠️ No AI model added — please configure one in AI Models.');
      }
    } else {
      if (typeof appendChatMessageToUI === 'function') {
        appendChatMessageToUI('error', `⚠️ PDF generation failed: ${errorMsg}`);
      }
      if (typeof displayToastNotification === 'function') {
        displayToastNotification(`Error: ${errorMsg}`);
      }
    }
    if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
    return { ok: false, message: errorMsg };
  }
}

async function generateExplicitLengthPDFDirectMode(promptText, fileContextString, isMonochromeMode, isEmptyCanvas, isReplaceIntent, modelsUsedSet, intentPayload) {
  const mode = intentPayload?.length === 'short_pdf' ? 'short' : 'long';
  const isLong = mode === 'long';
  // No fixed page floor for LONG anymore — depth decides length. Kept only for SHORT
  // (which is intentionally meant to be compact) and for progress-UI text/labels below.
  const minPages = isLong ? APP_CONFIG.LONG_PDF_MIN_PAGES : 2;
  const maxExpansionRounds = Math.max(3, APP_CONFIG.LONG_EXPANSION_MAX_ROUNDS || 0);
  const maxLowGrowthRounds = APP_CONFIG.LONG_EXPANSION_MAX_LOW_GROWTH_ROUNDS || 2;
  const outputLanguage = intentPayload?.language || detectOutputLanguage(promptText);
  const modeLabel = isLong ? 'LONG' : 'SHORT';

  const existingHTML = (!isEmptyCanvas && !isReplaceIntent) ? (typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '') : '';
  const currentText = existingHTML ? (typeof getCanvasContentWithLatexSource === 'function' ? getCanvasContentWithLatexSource() : '') : '';

  const systemPrompt =
    `You are the dedicated ${modeLabel} PDF document generator for AI PDF Studio.\n` +
    `Return ONLY the complete document content as raw HTML. Do NOT return JSON, markdown fences, chat commentary, an outline-only response, or an action wrapper.\n` +
    `Language: ${outputLanguage}.\n` +
    `${buildSharedRules(isMonochromeMode, outputLanguage)}\n` +
    `${typeof buildAtCommandInstructionText === 'function' ? buildAtCommandInstructionText({ intent: 'create_pdf', length: isLong ? 'long_pdf' : 'short_pdf', language: outputLanguage, sectionMode: false }) : ''}\n` +
    (isLong ? `LONG DIRECT RULES: write a genuinely comprehensive document. There is NO fixed page target — cover the full requested scope with definitions, concepts, formulas, properties, derivations, multiple worked/solved math examples per concept, applications, comparisons, common mistakes, summaries and useful tables/diagrams where appropriate. Let the true length be however many A4 pages this topic's real depth requires. Never pad with repetition, and never cut a topic short just to save space.\n` : `SHORT DIRECT RULES: produce a compact but complete document, normally about 2–5 A4 pages. Preserve the essential concepts, key formulas/facts, representative examples and a concise summary. Do not return only a title or outline.\n`) +
    `OUTPUT SAFETY: the result must contain substantial visible explanatory content. Use semantic HTML suitable for the existing A4 pagination engine.\n`;

  const userPrompt =
    `USER REQUEST:\n${promptText}\n\n` +
    (fileContextString ? `ATTACHED SOURCE CONTEXT:\n${fileContextString}\n\n` : '') +
    (currentText ? `CURRENT DOCUMENT CONTEXT (preserve only when the user did not ask to replace/rewrite):\n${currentText.slice(0, 12000)}\n\n` : '') +
    `Generate the complete ${modeLabel} PDF document now. Return HTML only.`;

  const extractHTML = (result) => {
    const raw = String(result?.content || '').replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
    let value = raw;
    const parsed = safeParseAIJson(raw, null) || (raw.startsWith('{') ? attemptRepairAndParse(raw) : null);
    if (parsed) {
      if (typeof parsed.html_content === 'string') value = parsed.html_content;
      else if (typeof parsed.new_html === 'string') value = parsed.new_html;
      else if (typeof parsed.message === 'string') value = parsed.message;
    }
    value = String(value || '').replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
    if (!/<[a-z][\s\S]*>/i.test(value) && value.length > 300) value = convertTextToDocumentHTML(value);
    return value;
  };
  const textLength = (html) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return (tmp.innerText || tmp.textContent || '').replace(/\s+/g, ' ').trim().length;
  };

  if (typeof ProgressUI !== 'undefined' && ProgressUI.show) {
    ProgressUI.show(`Generating ${modeLabel} PDF...`, isLong ? `Writing a comprehensive document — length is decided by the topic's real depth.` : 'Writing a compact complete document (target about 2–5 A4 pages).');
    ProgressUI.startAutoEstimate(isLong ? Math.max(28, APP_CONFIG.SINGLE_SHOT_ESTIMATED_SECONDS * 2) : APP_CONFIG.SINGLE_SHOT_ESTIMATED_SECONDS);
    // See the equivalent comment in generateDefaultPDFDirectMode(): startPct
    // must be >=25 so this (the actual writing stage, for both Short and Long
    // direct-mode PDFs) shows "Write" on the modal instead of "Plan".
    ProgressUI.setStage(`AI ${modeLabel} generation in progress…`, 26, 72, { indeterminate: true });
  }

  try {
    let result = await callAIAPI([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], { forceJson: false, modelsUsedSet, maxTokens: undefined });
    if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Processing AI response…', 72, 84);
    let generated = extractHTML(result);
    const minUsefulChars = isLong ? 1200 : 500;

    if (textLength(generated) < minUsefulChars) {
      if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Recovery request…', 72, 84, { indeterminate: true });
      const retry = await callAIAPI([
        { role: 'system', content: systemPrompt + `\nRECOVERY MODE: the previous response was too short or empty. Write the actual complete document now. Do not output only a title, outline, JSON, or explanation. Return substantive HTML only.` },
        { role: 'user', content: userPrompt + `\nIMPORTANT: the final result must contain substantial visible document content.` }
      ], {
        forceJson: false,
        modelsUsedSet,
        modelConfig: result?.modelConfig,
        maxTokens: undefined
      });
      const retryHTML = extractHTML(retry);
      if (textLength(retryHTML) > textLength(generated)) generated = retryHTML;
    }

    if (textLength(generated) < minUsefulChars) {
      throw new Error(`${modeLabel} PDF generation returned insufficient document content.`);
    }

    if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Rendering A4 pages…', 84, 96);
    const finalHTML = existingHTML ? `${existingHTML}<br><br>${generated}` : generated;
    if (typeof setDocumentHTMLAndPaginate === 'function') setDocumentHTMLAndPaginate(finalHTML, false);
    _updateLivePageNumberFromCurrentDocument();
    if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Finalizing PDF…', 96, 99);
    if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();

    if (isLong) {
      let lowGrowthStreak = 0;
      for (let round = 1; round <= maxExpansionRounds; round++) {
        const beforePages = document.getElementById('document-view-container')?.querySelectorAll('.doc-page-canvas').length || 0;
        if (beforePages >= APP_CONFIG.LONG_PDF_MAX_PAGES_HARD) break;
        if (isCancellationRequested) break;
        if (typeof ProgressUI !== 'undefined' && ProgressUI.setLabel) {
          ProgressUI.setLabel(`Checking for more genuine depth to add (round ${round}/${maxExpansionRounds}, currently ${beforePages} pages)...`);
        }
        try {
          const expansion = await callAIAPI([
            { role: 'system', content: systemPrompt + `\nDEPTH EXPANSION MODE: There is NO fixed page target and NO ceiling to chase. Judge purely on merit whether this exact topic still has real, non-repetitive depth left to add — missing subtopics, deeper derivations, more worked/solved math examples, applications, comparisons, exercises or useful visuals. If genuine depth remains, return ONLY that additional HTML content (nothing else). If the document is already thorough and anything more would be padding or repetition, return exactly the text [[DOCUMENT_COMPLETE]] and nothing else. Do not repeat existing material.` },
            { role: 'user', content: `Original request: ${promptText}\n\nCurrent document tail:\n${typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML().slice(-10000) : ''}\n\nAdd substantive new content only if the topic genuinely supports more, otherwise reply [[DOCUMENT_COMPLETE]].` }
          ], {
            forceJson: false,
            modelsUsedSet,
            modelConfig: result?.modelConfig,
            maxTokens: undefined
          });
          const moreHTML = extractHTML(expansion);
          if (!moreHTML || /\[\[DOCUMENT_COMPLETE\]\]/.test(moreHTML) || textLength(moreHTML) < 300) {
            lowGrowthStreak++;
            if (lowGrowthStreak >= maxLowGrowthRounds) break;
            continue;
          }
          lowGrowthStreak = 0;
          const before = typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '';
          if (typeof setDocumentHTMLAndPaginate === 'function') setDocumentHTMLAndPaginate(`${before}<br><br>${moreHTML}`, false);
          _updateLivePageNumberFromCurrentDocument();
          if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
          const afterPages = document.getElementById('document-view-container')?.querySelectorAll('.doc-page-canvas').length || 0;
          if (afterPages > APP_CONFIG.LONG_PDF_MAX_PAGES_HARD) {
            if (typeof displayToastNotification === 'function') {
              displayToastNotification(`Long PDF reached the safe page ceiling (${APP_CONFIG.LONG_PDF_MAX_PAGES_HARD} pages); stopping expansion.`);
            }
            break;
          }
        } catch (expErr) {
          console.warn(`[${modeLabel} PDF] depth expansion round failed:`, expErr);
          lowGrowthStreak++;
          if (lowGrowthStreak >= maxLowGrowthRounds) break;
        }
      }
      const finalPages = document.getElementById('document-view-container')?.querySelectorAll('.doc-page-canvas').length || 0;
      if (typeof displayToastNotification === 'function') {
        displayToastNotification(`Long PDF finished at ${finalPages} pages based on the topic's actual depth.`);
      }
    }

    if (typeof ProgressUI !== 'undefined') ProgressUI.finish();
    return true;
  } finally {
    if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
  }
}

async function generateLongPDFDirectMode(promptText, fileContextString, isMonochromeMode, isEmptyCanvas, isReplaceIntent, modelsUsedSet) {
  const requestSessionId = APP_STATE.activeSessionId;
  // Kept only as a legacy/progress-label reference — expansion below is no longer
  // gated on reaching this number; it keeps going while genuine depth remains.
  const minPages = APP_CONFIG.LONG_PDF_MIN_PAGES;
  const maxRounds = Math.max(3, APP_CONFIG.LONG_EXPANSION_MAX_ROUNDS || 0);
  const maxLowGrowthRounds = APP_CONFIG.LONG_EXPANSION_MAX_LOW_GROWTH_ROUNDS || 2;
  const activeCfg = getActiveAIModel();
  const outputLanguage = detectOutputLanguage(promptText);
  const keepExisting = !isEmptyCanvas && !isReplaceIntent;
  const existingHTML = keepExisting ? (typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '') : '';

  const directSystem =
    `You are an AI Document Assistant generating a LONG PDF in DIRECT MODE.\n` +
    `SECTION MODE IS OFF. Do not use an application-generated section planner, section objects, or separate section requests.\n` +
    `Write one continuous, coherent, comprehensive document for the user's request. Natural headings and subheadings are allowed and encouraged, but they must be part of the same document, not a section-management protocol.\n` +
    `LONG PDF REQUIREMENT: produce genuinely substantial study material. There is NO fixed page target — let the true length be however many A4 pages this specific topic's real depth requires. Never pad, repeat, or invent irrelevant material, and never cut a topic short just to save space.\n` +
    `Include necessary definitions, explanations, derivations, formulas, multiple worked/solved math examples per concept, applications, comparisons, common mistakes, tables, exercises and useful visuals where relevant.\n` +
    `Do not answer with only a title, outline, plan, summary, or table of contents. The response itself must contain the substantive document content.\n` +
    `${buildSharedRules(isMonochromeMode, outputLanguage)}\n` +
    `${typeof buildAtCommandInstructionText === 'function' ? buildAtCommandInstructionText({ intent: 'create_pdf', length: 'long_pdf', language: outputLanguage }) : ''}\n` +
    `OUTPUT FORMAT: return ONLY the document HTML fragment. Do NOT return JSON. Do NOT wrap it in markdown fences. Do NOT include chat_summary or commentary outside the HTML.`;

  const userContent = await buildAIUserContent(promptText, fileContextString || '(none)', keepExisting ? `\nCURRENT DOCUMENT (preserve useful existing content; add/expand only as requested):\n${existingHTML.slice(-18000)}` : '\nCURRENT DOCUMENT: empty — create the complete document from scratch.');

  _originalSystemPrompt = directSystem;
  _originalUserMessages = [{ role: 'system', content: directSystem }, { role: 'user', content: userContent }];
  _generationLockedModelConfig = activeCfg || null;
  intentPayloadForGeneration = { intent: 'create_pdf', length: 'long_pdf', language: outputLanguage, sectionMode: false };

  if (typeof ProgressUI !== 'undefined' && ProgressUI.show) {
    ProgressUI.show('Generating Long PDF directly...', `Sections are OFF. Writing one continuous document — length is decided by the topic's real depth.`);
    ProgressUI.startAutoEstimate(Math.max(APP_CONFIG.SINGLE_SHOT_ESTIMATED_SECONDS * 2, 28));
    // Same fix as the other direct-mode generators — startPct >=25 so this
    // shows "Write" on the modal, not "Plan".
    ProgressUI.setStage('AI LONG generation in progress…', 26, 72, { indeterminate: true });
  }

  const extractDirectHTML = (result) => {
    const raw = String(result?.content || '').replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
    let value = raw;
    const parsed = safeParseAIJson(raw, null) || (raw.startsWith('{') ? attemptRepairAndParse(raw) : null);
    if (parsed) {
      if (typeof parsed.html_content === 'string') value = parsed.html_content;
      else if (typeof parsed.new_html === 'string') value = parsed.new_html;
    }
    value = String(value || '').trim();
    if (value.startsWith('```')) value = value.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
    if (!/<[a-z][\s\S]*>/i.test(value) && value.length > 300) value = convertTextToDocumentHTML(value);
    return value;
  };

  const usableTextLength = (html) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return (tmp.innerText || tmp.textContent || '').replace(/\s+/g, ' ').trim().length;
  };

  let baseHTML = existingHTML;
  try {
    let result = await callAIAPI([{ role: 'system', content: directSystem }, { role: 'user', content: userContent }], {
      forceJson: false,
      modelsUsedSet,
      modelConfig: activeCfg || undefined,
      maxTokens: undefined
    });
    if (result && result.modelConfig) _generationLockedModelConfig = result.modelConfig;

    if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Processing AI response…', 72, 84);
    let generated = extractDirectHTML(result);
    if (usableTextLength(generated) < 1200) {
      const retryMessages = [{ role: 'system', content: directSystem + `\n\nRECOVERY RULE: Your previous response was too short. Write the actual full document now. Do not output only the title or outline. Return substantive HTML only.` }, { role: 'user', content: userContent + `\n\nIMPORTANT: The final document must contain substantial explanatory content, not just a title.` }];
      const retryResult = await callAIAPI(retryMessages, { forceJson: false, modelsUsedSet, modelConfig: result?.modelConfig || _generationLockedModelConfig || activeCfg || undefined, maxTokens: undefined });
      if (retryResult && retryResult.modelConfig) _generationLockedModelConfig = retryResult.modelConfig;
      const retryHTML = extractDirectHTML(retryResult);
      if (usableTextLength(retryHTML) > usableTextLength(generated)) generated = retryHTML;
    }

    if (requestSessionId !== APP_STATE.activeSessionId) return false;
    if (usableTextLength(generated) < 300) throw new Error('Long PDF direct generation returned no substantive document content.');

    if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Rendering A4 pages…', 84, 96);
    baseHTML = keepExisting ? `${existingHTML}<br><br>${generated}` : generated;
    _accumulatedHTML = baseHTML;
    if (typeof setDocumentHTMLAndPaginate === 'function') setDocumentHTMLAndPaginate(baseHTML, false);
    _updateLivePageNumberFromCurrentDocument();
    if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Finalizing PDF…', 96, 99);

    let lowGrowthStreak = 0;
    for (let round = 1; round <= maxRounds; round++) {
      if (requestSessionId !== APP_STATE.activeSessionId) return false;
      if (isCancellationRequested) return false;
      const currentPages = document.getElementById('document-view-container')?.querySelectorAll('.doc-page-canvas').length || 0;
      if (currentPages >= APP_CONFIG.LONG_PDF_MAX_PAGES_HARD) break;

      if (typeof ProgressUI !== 'undefined' && ProgressUI.setLabel) {
        ProgressUI.setLabel(`Checking for more genuine depth (round ${round}/${maxRounds}, currently ${currentPages} pages)...`);
      }
      const currentHTML = typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '';
      const continuationSystem =
        `You are continuing ONE continuous LONG PDF document. SECTION MODE IS OFF.\n` +
        `Do not create or discuss section-management JSON. Continue the same document directly by appending substantial NEW content only.\n` +
        `Current document is approximately ${currentPages} A4 page(s). There is NO fixed page target and NO ceiling to chase — judge purely on merit whether this exact topic still has real, non-repetitive depth left.\n` +
        `Do not repeat existing content. Add missing explanations, derivations, more worked/solved math examples, applications, comparisons, exercises, tables and useful visuals that naturally complete the user's request, ONLY if genuinely warranted.\n` +
        `If the document is already thorough and anything more would be padding or repetition, respond with EXACTLY the text [[DOCUMENT_COMPLETE]] and nothing else.\n` +
        `Otherwise return ONLY the HTML fragment to append. No JSON, no markdown fences, no commentary.\n` +
        `USER REQUEST:\n${promptText}`;
      const continuationUser = `CURRENT DOCUMENT TAIL:\n${currentHTML.slice(-18000)}\n\nAPPEND NEW CONTENT ONLY if the topic genuinely supports more; otherwise reply [[DOCUMENT_COMPLETE]]. Do not restart the document or write a title again.`;
      let continuationResult;
      try {
        continuationResult = await callAIAPI([{ role: 'system', content: continuationSystem }, { role: 'user', content: continuationUser }], {
          forceJson: false,
          modelsUsedSet,
          modelConfig: _generationLockedModelConfig || activeCfg || undefined,
          maxTokens: undefined
        });
      } catch (contErr) {
        console.warn('[Long PDF Direct Mode] continuation round failed:', contErr);
        lowGrowthStreak++;
        if (lowGrowthStreak >= maxLowGrowthRounds) break;
        continue;
      }
      if (continuationResult && continuationResult.modelConfig) _generationLockedModelConfig = continuationResult.modelConfig;
      let moreHTML = extractDirectHTML(continuationResult);

      if (!moreHTML || /\[\[DOCUMENT_COMPLETE\]\]/.test(moreHTML) || usableTextLength(moreHTML) < 500) {
        // No error here — this is the AI telling us (or effectively showing us) that
        // the topic's genuine depth has been exhausted, which is a normal, successful
        // way for depth-driven expansion to end, not a failure.
        lowGrowthStreak++;
        if (lowGrowthStreak >= maxLowGrowthRounds) break;
        continue;
      }

      const previous = _accumulatedHTML;
      _accumulatedHTML = previous + moreHTML;
      if (typeof setDocumentHTMLAndPaginate === 'function') setDocumentHTMLAndPaginate(_accumulatedHTML, false);
      _updateLivePageNumberFromCurrentDocument();
      const afterPages = document.getElementById('document-view-container')?.querySelectorAll('.doc-page-canvas').length || 0;
      if (afterPages <= currentPages) {
        // Content grew in text but not enough to add a page yet — keep it (it's
        // real content) but treat this round as low-growth for stall detection.
        lowGrowthStreak++;
        if (lowGrowthStreak >= maxLowGrowthRounds) { if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState(); break; }
      } else {
        lowGrowthStreak = 0;
      }
      if (afterPages > APP_CONFIG.LONG_PDF_MAX_PAGES_HARD) {
        if (typeof displayToastNotification === 'function') {
          displayToastNotification(`Long PDF reached the safe page ceiling (${APP_CONFIG.LONG_PDF_MAX_PAGES_HARD} pages); stopping expansion.`);
        }
        if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
        break;
      }
      if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
    }

    _accumulatedHTML = typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '';
    if (typeof repairEquationsInNewContent === 'function') await repairEquationsInNewContent(modelsUsedSet);
    _accumulatedHTML = typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '';
    _updateLivePageNumberFromCurrentDocument();
    const finalPages = document.getElementById('document-view-container')?.querySelectorAll('.doc-page-canvas').length || 0;
    if (typeof displayToastNotification === 'function') {
      displayToastNotification(`Long PDF finished at ${finalPages} pages based on the topic's actual depth.`);
    }
    if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
    if (typeof ProgressUI !== 'undefined') { ProgressUI.finish();
      ProgressUI.hide(); }
    return true;
  } catch (e) {
    console.error('[Long PDF Direct Mode] failed:', e);
    if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
    return false;
  }
}

// ===== ANALYTICS =====
async function computeDocumentAnalytics(startTimestamp, modelsUsedSet) {
  const container = document.getElementById('document-view-container');
  if (!container) return { totalPages: 0, wordCount: 0, tables: 0, equations: 0, images: 0, diagrams: 0, sections: 0, outline: [], readingTime: 0, timeTaken: '', modelsUsed: [], keyTopics: [] };
  const pages = Array.from(container.querySelectorAll('.doc-page-canvas'));
  const totalPages = pages.length;
  const cloneDoc = container.cloneNode(true);
  cloneDoc.querySelectorAll('.katex-eq').forEach(el => el.remove());
  const textContent = cloneDoc.innerText || '';
  const wordArray = textContent.split(/\s+/).filter(w => w.length > 0);
  const wordCount = wordArray.length;

  const tables = container.querySelectorAll('table').length;
  const equations = container.querySelectorAll('.katex-eq').length;
  const images = container.querySelectorAll('img').length;
  const diagramWrappers = container.querySelectorAll('.fc-wrapper').length;
  const svgOutside = container.querySelectorAll('svg:not(.fc-wrapper svg)').length;
  const diagrams = diagramWrappers + svgOutside;
  const headings = container.querySelectorAll('h1, h2, h3');
  const sections = headings.length;
  const h2s = Array.from(container.querySelectorAll('h2')).map(h => h.innerText.trim()).filter(Boolean);

  const readingTime = Math.ceil(wordCount / 200);
  const timeTaken = Date.now() - startTimestamp;
  const timeStr = timeTaken < 60000 ? (timeTaken / 1000).toFixed(1) + 's' : Math.floor(timeTaken / 60000) + 'm ' + Math.floor((timeTaken % 60000) / 1000) + 's';

  const modelNames = Array.from(modelsUsedSet || new Set()).filter(Boolean);
  let keyTopics = [];
  try {
    const bodyText = cloneDoc.innerText.substring(0, 2000);
    const headingOutline = h2s.length ? 'Outline headings: ' + h2s.join(', ') : '';
    const promptContent = headingOutline + '\n\n' + bodyText;
    const result = await callAIAPI([{ role: 'system', content: 'Given the document headings and a content sample, return ONLY JSON: {"key_topics": ["topic1", "topic2", ...]} — 3 to 8 short topic phrases in the same language as the document.' }, { role: 'user', content: promptContent.substring(0, 3000) }], { forceJson: true, modelsUsedSet: modelsUsedSet, maxTokens: undefined });
    const parsed = safeParseAIJson(result.content, null);
    if (parsed && Array.isArray(parsed.key_topics)) keyTopics = parsed.key_topics.slice(0, 8);
  } catch (e) { console.warn('Key topics AI call failed:', e);
    keyTopics = h2s.slice(0, 5); }

  return { totalPages, wordCount, tables, equations, images, diagrams, sections, outline: h2s, readingTime, timeTaken: timeStr, modelsUsed: modelNames, keyTopics };
}

function formatAnalyticsChatMessage(analytics) {
  const { totalPages, wordCount, tables, equations, images, diagrams, sections, outline, readingTime, timeTaken, modelsUsed, keyTopics } = analytics;
  let html = '<div style="background:var(--primary-light); padding:12px 16px; border-radius:var(--radius-md); margin:4px 0;">';
  html += `<div style="font-weight:700; font-size:1rem; margin-bottom:6px;">Document Analytics</div>`;
  html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; font-size:0.9rem;">`;
  html += `<span>Pages: ${totalPages}</span>`;
  html += `<span>Words: ${wordCount.toLocaleString()}</span>`;
  html += `<span>⏱ Reading: ~${readingTime} min</span>`;
  html += `<span>Sections: ${sections}</span>`;
  html += `<span>Tables: ${tables}</span>`;
  html += `<span>Equations: ${equations}</span>`;
  html += `<span>Images: ${images}</span>`;
  html += `<span>Diagrams: ${diagrams}</span>`;
  if (modelsUsed.length) html += `<span style="grid-column:1/-1;">AI models used: ${modelsUsed.join(', ')}</span>`;
  if (keyTopics && keyTopics.length) html += `<span style="grid-column:1/-1;">Key topics: ${keyTopics.slice(0, 6).join(', ')}</span>`;
  html += `<span style="grid-column:1/-1;">Working Time taken: ${timeTaken}</span>`;
  html += `</div>`;
  if (outline && outline.length) html += `<div style="margin-top:6px; font-size:0.85rem; color:var(--text-secondary);">Outline: ${outline.slice(0, 5).join(' → ')}${outline.length > 5 ? ' …' : ''}</div>`;
  html += '</div>';
  return html;
}

// ===== AI ACTION HANDLER SELF-CHECK =====
function validateAIActionHandlers() {
  const required = {
    append_content: 'setDocumentHTMLAndPaginate',
    prepend_content: 'setDocumentHTMLAndPaginate',
    replace_all: 'setDocumentHTMLAndPaginate',
    update_section: 'updateSpecificSectionByHeading',
    update_page: 'updateSpecificPageByNumber'
  };
  const missing = Object.entries(required).filter(([, name]) => typeof window[name] !== 'function').map(([action, name]) => `${action} → ${name}`);
  if (missing.length) {
    console.error('[AI Action Self-Check] Missing handlers:', missing);
    if (typeof displayToastNotification === 'function') displayToastNotification(`⚠️ AI action handler missing: ${missing[0]}`);
    return false;
  }
  return true;
}

// ============================================================
// REFINE / REFINE EQUATION HANDLERS
// ============================================================

async function handleRefineAction(promptText, intentPayload, pageContext, modelsUsedSet) {
  const isEquationRefine = intentPayload.intent === 'refine_equation';
  const targetPages = intentPayload.editPages || (intentPayload.pageTarget ? [intentPayload.pageTarget] : null);
  const isMonochromeMode = document.body.classList.contains('photocopy-mode');
  const outputLanguage = intentPayload.language || detectOutputLanguage(promptText);

  let pagesToRefine = [];
  const container = document.getElementById('document-view-container');
  if (!container) { throw new Error('No document container found.'); }
  const allPages = Array.from(container.querySelectorAll('.doc-page-canvas'));
  if (targetPages && targetPages.length) {
    pagesToRefine = targetPages.map(n => {
      const idx = n - 1;
      return idx >= 0 && idx < allPages.length ? allPages[idx] : null;
    }).filter(Boolean);
  } else {
    if (allPages.length) pagesToRefine = [allPages[0]];
  }
  if (!pagesToRefine.length) {
    throw new Error('No valid pages to refine. Please specify a page number with @page or select a page.');
  }

  let contextString = '';
  pagesToRefine.forEach((page, idx) => {
    const clone = page.cloneNode(true);
    clone.querySelectorAll('.page-footer-number').forEach(f => f.remove());
    const html = typeof convertKatexSpansToLatexSource === 'function' ? convertKatexSpansToLatexSource(clone.innerHTML) : clone.innerHTML;
    const pageNum = allPages.indexOf(page) + 1;
    contextString += `\n[PAGE ${pageNum} — EDIT THIS PAGE]\n${html}\n[/PAGE ${pageNum}]\n`;
  });

  const refineInstruction = isEquationRefine
    ? `REFINE EQUATION MODE: Focus ONLY on fixing LaTeX/KaTeX equations and math rendering. Do NOT change any wording, text, structure, or non-math content. Correct delimiter errors, missing backslashes, wrong commands, and ensure all equations render properly.`
    : `REFINE MODE: Improve the content while preserving all useful information. Fix grammar, clarity, structure, and formatting. Do NOT add new information that wasn't there; do NOT remove useful content.`;

  const systemPrompt =
    `You are a document refinement AI. ${refineInstruction}\n` +
    `Return ONLY valid JSON. For one page, use: {"action":"update_page","page_number":<number>,"new_html":"<full HTML of that page>","chat_summary":"..."}\n` +
    `For multiple pages, use: {"action":"update_pages","updates":[{"page_number":1,"new_html":"..."}, ...],"chat_summary":"..."}\n` +
    `Preserve ALL page numbers exactly as given. Do not change any content that does not need refinement. The updated HTML must be complete and self-contained for each page (including any existing headings, tables, etc.).`;

  const userMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `USER REQUEST:\n${promptText}\n\nPAGES TO REFINE:\n${contextString}` }
  ];

  const result = await callAIAPI(userMessages, {
    forceJson: true,
    modelsUsedSet: modelsUsedSet,
    maxTokens: undefined
  });

  let parsed = safeParseAIJson(result.content, null);
  if (!parsed && result.content && result.content.trim().startsWith('{')) {
    parsed = attemptRepairAndParse(result.content);
  }
  if (!parsed) throw new Error('AI response could not be parsed as JSON.');

  let applied = false;
  let summary = parsed.chat_summary || 'Refinement applied.';
  if (parsed.action === 'update_pages' && Array.isArray(parsed.updates) && parsed.updates.length) {
    const updates = parsed.updates.map(u => ({
      page_number: parseInt(u.page_number, 10),
      new_html: u.new_html
    }));
    const targetNums = pagesToRefine.map(p => allPages.indexOf(p) + 1);
    const updateNums = updates.map(u => u.page_number);
    const allCovered = targetNums.every(n => updateNums.includes(n));
    if (!allCovered) {
      throw new Error('AI did not return updates for all target pages.');
    }
    if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
    if (typeof updateSpecificPagesByNumber === 'function') {
      applied = updateSpecificPagesByNumber(updates);
    } else {
      applied = updates.every(u => {
        if (typeof updateSpecificPageByNumber === 'function') {
          return updateSpecificPageByNumber(u.page_number, u.new_html);
        }
        return false;
      });
    }
  } else if (parsed.action === 'update_page' && parsed.page_number && typeof parsed.new_html === 'string') {
    const pageNum = parseInt(parsed.page_number, 10);
    if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
    if (typeof updateSpecificPageByNumber === 'function') {
      applied = updateSpecificPageByNumber(pageNum, parsed.new_html);
    } else {
      applied = false;
    }
  } else {
    throw new Error('AI did not return a valid update action.');
  }

  if (!applied) {
    throw new Error('Could not apply refinement updates to the document.');
  }

  if (typeof processMathEquationsInContainer === 'function') processMathEquationsInContainer(container);
  if (typeof renderAllKatexVisuals === 'function') renderAllKatexVisuals(container);
  if (typeof invalidatePDFPreviewCache === 'function') invalidatePDFPreviewCache();
  if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
  _updateLivePageNumberFromCurrentDocument();

  return { applied, summary };
}

// ============================================================
// SPECIAL TEXT COMMAND: "copy"
// ============================================================
function isCopyStyleCommand(rawInputValue) {
  const stripped = typeof parseAndStripInlineCommandTokens === 'function' ?
    parseAndStripInlineCommandTokens(rawInputValue).trim() : String(rawInputValue || '').trim();
  return /^copy$/i.test(stripped);
}

async function handleCopyStyleCommand(inputField) {
  const attachedEntries = Object.entries(APP_STATE.attachedFiles || {})
    .filter(([, fileData]) => fileData && fileData.content && fileData.content.trim())
    .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

  if (!attachedEntries.length) {
    if (typeof displayToastNotification === 'function') {
      displayToastNotification('⚠️ Attach a file first, then type "copy" to restyle it.');
    }
    return;
  }
  if (APP_STATE.isAIGenerating) {
    if (typeof displayToastNotification === 'function') displayToastNotification('⏳ Please wait for the current AI task to finish first.');
    return;
  }

  inputField.value = '';
  inputField.style.height = 'auto';
  if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('user', 'copy');
  APP_STATE.selectedCommands = APP_STATE.selectedCommands.filter(c => c.id === 'chat');
  if (typeof renderSelectedCommandChips === 'function') renderSelectedCommandChips();
  if (typeof closeAtCommandMenu === 'function') closeAtCommandMenu();

  APP_STATE.isAIGenerating = true;
  const sendBtn = document.getElementById('send-message-btn');
  if (sendBtn) sendBtn.disabled = true;
  let loadingElement = typeof appendChatMessageToUI === 'function' ?
    appendChatMessageToUI('ai', `<div class="loading-dots"><span></span><span></span><span></span></div>`, false) : null;

  const modelsUsed = new Set();
  const isMonochromeMode = document.body.classList.contains('photocopy-mode');

  try {
    if (typeof ProgressUI !== 'undefined' && ProgressUI.show) {
      ProgressUI.show('Copying & restyling…', 'Reformatting the attached file content — nothing added or removed.');
      ProgressUI.setStage('AI restyling…', 8, 78, { indeterminate: true });
    }

    const sourceBlocks = attachedEntries.map(([, fileData], i) => {
      const cleaned = typeof cleanAttachmentSourceForAI === 'function' ? cleanAttachmentSourceForAI(fileData.content) : fileData.content;
      const name = String(fileData.name || `file ${i + 1}`).replace(/[\r\n]+/g, ' ').trim();
      return `\n[SOURCE FILE ${i + 1}: ${name}]\n${cleaned}\nEND SOURCE FILE ${i + 1}\n`;
    });
    const joinedSource = sourceBlocks.join('\n');
    const outputLanguage = typeof detectOutputLanguage === 'function' ? detectOutputLanguage(joinedSource) : 'en';

    const copySystem =
      `You are a pure FORMATTING engine. Your ONLY job is to take the source content below and re-present it with clean visual styling — you must NOT summarize, shorten, expand, paraphrase, correct, reorder, translate, or omit ANY piece of it.\n` +
      `${typeof buildSharedRules === 'function' ? buildSharedRules(isMonochromeMode, outputLanguage) : ''}\n` +
      `=== ABSOLUTE RULES FOR THIS "COPY" TASK ===\n` +
      `1. Every sentence, word, number, fact, name, and value from the source MUST appear in your output — nothing added, nothing removed, nothing summarized.\n` +
      `2. Do NOT add your own commentary, introduction, conclusion, or explanation that wasn't in the source.\n` +
      `3. Do NOT fix, correct, or change the source's actual wording/content — only apply visual structure (headings, paragraphs, lists, tables, callout boxes, bold) and, where the source clearly contains a mathematical expression, wrap it as LaTeX using $$...$$.\n` +
      `4. Reorganize ONLY the visual presentation, never the substance or order of ideas — unless the source text is clearly out of order due to OCR/page-scan artifacts, in which case restore natural reading order.\n` +
      `5. Ignore page numbers, running headers/footers, and OCR control markers — those are not content to copy.\n` +
      `6. Return ONLY the raw HTML body content (no <html>/<head>/<body> tags, no markdown fences, no JSON wrapper, no commentary about what you did).`;

    const userMsg = `Restyle and present ALL of the following source content, preserving every detail:\n${joinedSource}`;

    const first = await callAIAPI([
      { role: 'system', content: copySystem },
      { role: 'user', content: userMsg }
    ], {
      forceJson: false,
      modelsUsedSet: modelsUsed
    });

    if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Finalizing…', 78, 92);

    let html = (first.content || '').replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
    html = await generateHtmlContentWithAutoContinue(userMsg, html, first.finishReason, modelsUsed, APP_CONFIG.CONTINUATION_MAX_LOOPS, first.modelConfig);

    if (!html) throw new Error('The AI returned an empty response.');
    if (typeof processMathEquationsToHTML === 'function') html = processMathEquationsToHTML(html);

    if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
    const currentHTML = typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '';
    const isCanvasEmpty = currentHTML.includes('Start typing here');
    if (typeof setDocumentHTMLAndPaginate === 'function') {
      if (isCanvasEmpty) setDocumentHTMLAndPaginate(html);
      else setDocumentHTMLAndPaginate(currentHTML + '<br><br>' + html);
    }
    _updateLivePageNumberFromCurrentDocument();
    if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
    if (typeof invalidatePDFPreviewCache === 'function') invalidatePDFPreviewCache();

    attachedEntries.forEach(([, fileData]) => { fileData.sent = true; });
    if (typeof renderAttachmentBar === 'function') renderAttachmentBar();

    if (loadingElement && loadingElement.isConnected) loadingElement.remove();
    if (typeof appendChatMessageToUI === 'function') {
      appendChatMessageToUI('ai', attachedEntries.length > 1 ?
        `✅ Copied and restyled ${attachedEntries.length} files' content — nothing added or removed.` :
        `✅ Copied and restyled the file's content — nothing added or removed.`);
    }
    if (typeof displayToastNotification === 'function') displayToastNotification('✅ Copy complete — restyled only, content unchanged.');
  } catch (err) {
    if (loadingElement && loadingElement.isConnected) loadingElement.remove();
    console.error('Copy-style command failed:', err);
    if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', `Copy failed: ${err.message || err}`);
    if (typeof displayToastNotification === 'function') displayToastNotification(`Error Copy failed: ${err.message || err}`);
  } finally {
    if (typeof ProgressUI !== 'undefined') { ProgressUI.finish(); setTimeout(() => { if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide(); }, 300); }
    APP_STATE.isAIGenerating = false;
    if (sendBtn) sendBtn.disabled = false;
    inputField.focus();
  }
}

// ============================================================
// MAIN CHAT FUNCTION
// ============================================================

async function sendChatPromptToAI() {
  try {
    const inputField = document.getElementById('chat-input-textarea');
    const rawInputValue = inputField.value;
    if (!rawInputValue.trim()) return;
    if (APP_STATE.isAIGenerating) return;

    if (isCopyStyleCommand(rawInputValue)) {
      await handleCopyStyleCommand(inputField);
      return;
    }

    let promptText = typeof parseAndStripInlineCommandTokens === 'function' ? parseAndStripInlineCommandTokens(rawInputValue).trim() : rawInputValue.trim();
    if (!promptText) promptText = APP_STATE.selectedCommands.length > 0 ? 'Apply the selected @ command settings.' : '';

    let intentPayload = typeof buildIntentPayload === 'function' ? buildIntentPayload() : null;
    if (!intentPayload) {
      if (typeof openAtCommandMenu === 'function') openAtCommandMenu('button');
      if (typeof showAtCommandToast === 'function') showAtCommandToast('Please select an @ command first (e.g. @Chat, @Edit, @Create PDF)');
      if (typeof shakeChatInputField === 'function') shakeChatInputField();
      return;
    }

    if (intentPayload.intent === 'edit' && (!intentPayload.editPages || intentPayload.editPages.length === 0)) {
      const pages = typeof openEditPageModal === 'function' ? await openEditPageModal() : null;
      if (!pages || pages.length === 0) { if (typeof displayToastNotification === 'function') displayToastNotification('Edit cancelled.'); return; }
      const pageString = pages.join(' ');
      const editCmd = APP_STATE.selectedCommands.find(c => c.id === 'edit');
      if (editCmd) { editCmd.param = pageString; } else if (typeof attemptAddAtCommand === 'function') {
        attemptAddAtCommand({ id: 'edit', category: 'intent', label: 'Edit', icon: 'edit' }, pageString);
      }
      if (typeof renderSelectedCommandChips === 'function') renderSelectedCommandChips();
      intentPayload = typeof buildIntentPayload === 'function' ? buildIntentPayload() : null;
      if (!intentPayload) { if (typeof displayToastNotification === 'function') displayToastNotification('⚠️ Failed to build intent after edit selection.'); return; }
    }

    const requestSessionId = APP_STATE.activeSessionId;
    inputField.value = '';
    inputField.style.height = 'auto';
    if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('user', promptText);
    APP_STATE.selectedCommands = APP_STATE.selectedCommands.filter(c => c.id === 'chat');
    if (typeof renderSelectedCommandChips === 'function') renderSelectedCommandChips();
    if (typeof closeAtCommandMenu === 'function') closeAtCommandMenu();
    APP_STATE.isAIGenerating = true;
    document.getElementById('send-message-btn').disabled = true;
    const loadingElement = typeof appendChatMessageToUI === 'function' ? appendChatMessageToUI('ai', `<div class="loading-dots"><span></span><span></span><span></span></div>`, false) : null;

    const analyticsStart = Date.now();
    const modelsUsed = new Set();

    const chatRequestsDocument = intentPayload.intent === 'chat' &&
      /\b(?:create|generate|make|write|build|export|convert|download)\b[\s\S]{0,80}\b(?:pdf|document|notes?|report|book|chapter)\b|\b(?:pdf|document|notes?|report|book|chapter)\b[\s\S]{0,80}\b(?:create|generate|make|write|build|export|convert|download)\b/i.test(promptText);
    if (chatRequestsDocument) {
      if (loadingElement && loadingElement.isConnected) loadingElement.remove();
      if (typeof appendChatMessageToUI === 'function') {
        appendChatMessageToUI('ai', 'To create a PDF or document, select @Create PDF first, then send your request. @Chat will not generate or edit PDFs.');
      }
      APP_STATE.suppressDocumentAIChat = false;
      APP_STATE.isAIGenerating = false;
      document.getElementById('send-message-btn').disabled = false;
      inputField.focus();
      return;
    }

    try {
      const canvasIsEmpty = document.getElementById('document-view-container')?.innerText.includes('Start typing here') || false;
      const isEmptyCanvasForStep = canvasIsEmpty;

      const shouldUseMemory = true;
      const isMonochromeMode = document.body.classList.contains('photocopy-mode');
      const fileContextString = typeof buildAttachmentContextForAI === 'function' ? buildAttachmentContextForAI(promptText, shouldUseMemory, intentPayload) : '';

      const requestedPageNumber = intentPayload.pageTarget || (typeof detectRequestedPageNumber === 'function' ? detectRequestedPageNumber(promptText) : null);
      const pageContext = intentPayload.intent === 'edit' && Array.isArray(intentPayload.editPages) && intentPayload.editPages.length > 1 ? (typeof getMultiPageEditContext === 'function' ? getMultiPageEditContext(intentPayload.editPages) : null) : (requestedPageNumber ? (typeof getPageRangeContext === 'function' ? getPageRangeContext(requestedPageNumber) : null) : null);

      // ========== EDIT PIPELINE ==========
      if (intentPayload.intent === 'edit') {
        if (loadingElement && loadingElement.isConnected) loadingElement.remove();
        const editPages = Array.isArray(intentPayload.editPages) && intentPayload.editPages.length ? intentPayload.editPages.slice().sort((a, b) => a - b) : [];
        if (!editPages.length) {
          if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', 'Edit cancelled — no page was selected.');
          APP_STATE.suppressDocumentAIChat = false;
          APP_STATE.isAIGenerating = false;
          document.getElementById('send-message-btn').disabled = false;
          inputField.focus();
          return;
        }

        const ctx = pageContext && pageContext.contextString ? pageContext.contextString : (typeof getMultiPageEditContext === 'function' ? getMultiPageEditContext(editPages).contextString : '');
        const targetInstruction = editPages.length === 1 ? `Return ONLY JSON: {"action":"update_page","page_number":${editPages[0]},"new_html":"...","chat_summary":"..."}.` : `Return ONLY JSON: {"action":"update_pages","updates":[{"page_number":${editPages.join('},{"page_number":')}],"chat_summary":"..."}.`;
        const fastEditSystem =
          `You are the FAST EDIT engine for an existing A4 document.\n` +
          `${typeof buildSharedRules === 'function' ? buildSharedRules(isMonochromeMode, intentPayload.language || (typeof detectOutputLanguage === 'function' ? detectOutputLanguage(promptText) : 'en')) : ''}\n` +
          `EDIT ONLY the selected page(s). Preserve all unselected pages exactly.\n` +
          `Do not append, prepend, summarize, rewrite unrelated content, or recreate the document.\n` +
          `Preserve every fact, number, formula, table value, heading and useful visual on the selected page unless the user explicitly asks to change it.\n` +
          `${targetInstruction}\n` +
          `Return valid JSON only. Do not use markdown fences.`;
        if (typeof ProgressUI !== 'undefined' && ProgressUI.show) {
          ProgressUI.show('Editing document…', editPages.length === 1 ? `Updating page ${editPages[0]} with one focused AI request…` : `Updating ${editPages.length} selected pages with one focused AI request…`);
          ProgressUI.setStage('AI editing…', 8, 78, { indeterminate: true });
        }
        try {
          const fastEditResult = await callAIAPI([{ role: 'system', content: fastEditSystem }, { role: 'user', content: `USER EDIT REQUEST:\n${promptText}\n\nSELECTED PAGES: ${editPages.join(', ')}\n\nCURRENT PAGE CONTEXT:\n${ctx}` }], {
            forceJson: true,
            modelsUsedSet: modelsUsed,
            maxTokens: undefined
          });
          const parsedEdit = safeParseAIJson(fastEditResult.content, null);
          if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Applying page changes…', 78, 94);
          let applied = false;
          let summary = 'Edit completed.';
          if (parsedEdit && parsedEdit.action === 'update_pages' && Array.isArray(parsedEdit.updates)) {
            const actual = parsedEdit.updates.map(u => parseInt(u.page_number, 10)).filter(Number.isInteger).sort((a, b) => a - b);
            const expected = editPages.slice().sort((a, b) => a - b);
            const complete = actual.length === expected.length && actual.every((n, i) => n === expected[i]);
            if (complete) {
              if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
              applied = typeof updateSpecificPagesByNumber === 'function' ? updateSpecificPagesByNumber(parsedEdit.updates) : false;
              summary = parsedEdit.chat_summary || 'Selected pages updated.';
            }
          } else if (parsedEdit && parsedEdit.action === 'update_page' && Number.isInteger(parseInt(parsedEdit.page_number, 10)) && typeof parsedEdit.new_html === 'string') {
            const pageNo = parseInt(parsedEdit.page_number, 10);
            if (editPages.length === 1 && pageNo === editPages[0]) {
              if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
              applied = typeof updateSpecificPageByNumber === 'function' ? updateSpecificPageByNumber(pageNo, parsedEdit.new_html) : false;
              summary = parsedEdit.chat_summary || `Page ${pageNo} updated.`;
            }
          }
          if (!applied) {
            if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', 'The edit response did not contain a safe update for every selected page. The document was left unchanged.');
          } else {
            const container = document.getElementById('document-view-container');
            if (container) {
              if (typeof processMathEquationsInContainer === 'function') processMathEquationsInContainer(container);
              if (typeof renderAllKatexVisuals === 'function') renderAllKatexVisuals(container);
            }
            if (typeof invalidatePDFPreviewCache === 'function') invalidatePDFPreviewCache();
            if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
            if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Finishing…', 94, 99);
            if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('ai', summary);
            _updateLivePageNumberFromCurrentDocument();
          }
          if (typeof ProgressUI !== 'undefined') ProgressUI.finish();
        } catch (editErr) {
          if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
          if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', `Edit failed: ${editErr.message || editErr}`);
        } finally {
          setTimeout(() => { if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide(); }, 120);
          APP_STATE.suppressDocumentAIChat = false;
          APP_STATE.isAIGenerating = false;
          document.getElementById('send-message-btn').disabled = false;
          inputField.focus();
        }
        return;
      }

      // ========== REFINE / REFINE EQUATION PIPELINE ==========
      if (intentPayload.intent === 'refine' || intentPayload.intent === 'refine_equation') {
        if (loadingElement && loadingElement.isConnected) loadingElement.remove();
        if (typeof ProgressUI !== 'undefined' && ProgressUI.show) {
          ProgressUI.show(intentPayload.intent === 'refine_equation' ? 'Refining equations...' : 'Refining document...', 'Applying AI refinement to the target pages...');
          ProgressUI.setStage('AI refinement…', 8, 78, { indeterminate: true });
        }
        try {
          let targetPages = intentPayload.editPages || (intentPayload.pageTarget ? [intentPayload.pageTarget] : null);
          if (!targetPages || targetPages.length === 0) {
            const pages = typeof openEditPageModal === 'function' ? await openEditPageModal() : null;
            if (!pages || pages.length === 0) {
              if (typeof displayToastNotification === 'function') displayToastNotification('Refine cancelled — no page selected.');
              APP_STATE.isAIGenerating = false;
              document.getElementById('send-message-btn').disabled = false;
              inputField.focus();
              return;
            }
            targetPages = pages;
            const cmd = APP_STATE.selectedCommands.find(c => c.id === intentPayload.intent);
            if (cmd) cmd.param = pages.join(' ');
            if (typeof renderSelectedCommandChips === 'function') renderSelectedCommandChips();
            intentPayload.editPages = pages;
          }
          const result = await handleRefineAction(promptText, intentPayload, pageContext, modelsUsed);
          if (result && result.applied) {
            if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('ai', result.summary || '✅ Refinement applied.');
            if (typeof displayToastNotification === 'function') displayToastNotification('✅ Refinement completed.');
            _updateLivePageNumberFromCurrentDocument();
          } else {
            throw new Error('Refinement could not be applied.');
          }
        } catch (refineErr) {
          if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
          if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', `Refine failed: ${refineErr.message || refineErr}`);
          if (typeof displayToastNotification === 'function') displayToastNotification(`Refine error: ${refineErr.message || refineErr}`);
        } finally {
          if (typeof ProgressUI !== 'undefined') { ProgressUI.finish();
            setTimeout(() => { if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide(); }, 300); }
          APP_STATE.suppressDocumentAIChat = false;
          APP_STATE.isAIGenerating = false;
          document.getElementById('send-message-btn').disabled = false;
          inputField.focus();
        }
        return;
      }

      // ========== BEAUTIFY PIPELINE ==========
      if (intentPayload.intent === 'beautify') {
        if (loadingElement && loadingElement.isConnected) loadingElement.remove();
        APP_STATE.isAIGenerating = false;
        if (typeof beautifyDocument === 'function') await beautifyDocument({ allowDuringAIGeneration: true });
        _updateLivePageNumberFromCurrentDocument();
        APP_STATE.suppressDocumentAIChat = false;
        APP_STATE.isAIGenerating = false;
        document.getElementById('send-message-btn').disabled = false;
        inputField.focus();
        return;
      }

      // ========== DIAGRAM EDIT ==========
      if (typeof isDiagramEditRequest === 'function' && isDiagramEditRequest(promptText, intentPayload)) {
        const diagramResult = typeof handleDiagramEditOrRefine === 'function' ? await handleDiagramEditOrRefine(promptText, intentPayload, pageContext, modelsUsed) : null;
        if (loadingElement && loadingElement.isConnected) loadingElement.remove();
        APP_STATE.suppressDocumentAIChat = false;
        APP_STATE.isAIGenerating = false;
        document.getElementById('send-message-btn').disabled = false;
        if (diagramResult && diagramResult.handled) {
          if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('ai', diagramResult.summary || 'Diagram updated successfully.');
          _updateLivePageNumberFromCurrentDocument();
        } else {
          if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', 'Diagram edit/refine could not be applied safely. The existing diagram was left unchanged. Please make the request more specific, such as the page/diagram title.');
        }
        inputField.focus();
        return;
      }

      // ========== OTHER INTENTS (Create PDF, etc.) ==========
      const legacyIsDocumentRequestGuess = /(write|create|generate|make|add|insert|append|update|rewrite|replace|edit|modify|fix|correct|revise|expand|extend|continue|improve|enhance|change|redo|shorten|summarize|reduce|delete|remove|তৈরি|লেখ|যোগ|সৃষ্টি|আপডেট|পুনর্লিখন|প্রতিস্থাপন|বানান|নোট|প্রশ্ন|চার্ট|সারণী|তালিকা|ফ্লো চার্ট|ডায়াগ্রাম|ঠিক কর|সংশোধন|সংশোধিত|সংশোধ|সম্পাদনা|পরিবর্তন|পরিবর্তিত|বাড়া|বাড়িয়ে|বাড়াও|কমাও|কমিয়ে|চালিয়ে যাও|মুছ|বাদ দাও|এডিট|মডিফাই)/i.test(promptText) && !/^(hi|hello|hey|thanks|thank you|ok|okay|সুপ্রভাত|ধন্যবাদ|ঠিক আছে|আচ্ছা)\s*[.!?]*$/i.test(promptText.trim());

      const isDocumentRequest = intentPayload.intent !== 'chat' ? (intentPayload.intent ? true : legacyIsDocumentRequestGuess) : false;
      APP_STATE.suppressDocumentAIChat = !!isDocumentRequest;

      const sectionModeEnabled = getSectionModeEnabled();
      const intentForcesExplicitLengthDirect = intentPayload.intent === 'create_pdf' && (intentPayload.length === 'long_pdf' || intentPayload.length === 'short_pdf');
      const intentForcesStepByStep = !intentForcesExplicitLengthDirect && sectionModeEnabled && intentPayload.length === 'long_pdf';
      const intentForcesSingleShot = ['add', 'chat', 'refine_pagination'].includes(intentPayload.intent) || intentPayload.pageTarget || intentForcesExplicitLengthDirect;
      const intentForcesDefaultDirect = intentPayload.intent === 'create_pdf' && !intentForcesExplicitLengthDirect && (intentPayload.length === null || intentPayload.length === 'standard' || !intentPayload.length);

      let precomputedGenerationPlan = null;
      if (sectionModeEnabled && !intentForcesDefaultDirect && !intentForcesExplicitLengthDirect && !intentForcesSingleShot && isDocumentRequest && (!intentPayload.length || intentPayload.length === 'standard')) {
        if (typeof ProgressUI !== 'undefined' && ProgressUI.show) ProgressUI.show('Planning document scope...', 'AI is estimating depth and generation strategy...');
        precomputedGenerationPlan = await generateTopicPlan(promptText, fileContextString, isMonochromeMode, intentPayload, modelsUsed);
      }

      const useStepByStepGeneration = sectionModeEnabled && !intentForcesSingleShot && (intentForcesStepByStep || !!(precomputedGenerationPlan && precomputedGenerationPlan.useSections));

      if (intentForcesDefaultDirect) {
        if (loadingElement && loadingElement.isConnected) loadingElement.remove();
        if (typeof ProgressUI !== 'undefined' && ProgressUI.show) {
          ProgressUI.show('Generating PDF...', 'AI is writing the document...');
          ProgressUI.startAutoEstimate(APP_CONFIG.SINGLE_SHOT_ESTIMATED_SECONDS);
        }
        const directResult = await generateDefaultPDFDirectMode(promptText, fileContextString, isMonochromeMode, isEmptyCanvasForStep, /(replace|rewrite|start over|নতুন করে|মুছে ফেলে|পুনরায় লিখ)/i.test(promptText), modelsUsed, intentPayload);
        if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
        if (directResult && directResult.ok) {
          if (typeof isMobileDeviceLayout === 'function' && isMobileDeviceLayout() && typeof setMobileView === 'function') setMobileView('editor');
          if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('ai', '✅ PDF generated successfully.');
          _updateLivePageNumberFromCurrentDocument();
          try {
            const analytics = typeof computeDocumentAnalytics === 'function' ? await computeDocumentAnalytics(analyticsStart, modelsUsed) : null;
            if (analytics && typeof appendChatMessageToUI === 'function' && typeof formatAnalyticsChatMessage === 'function') {
              appendChatMessageToUI('ai', formatAnalyticsChatMessage(analytics));
            }
          } catch (analyticsErr) { console.warn('Analytics failed:', analyticsErr); }
        } else if (!directResult || !directResult.aborted) {
          const reason = (directResult && directResult.message) ? directResult.message : 'Unknown error.';
          if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', `PDF generation failed: ${reason}`);
        }
        APP_STATE.suppressDocumentAIChat = false;
        APP_STATE.isAIGenerating = false;
        document.getElementById('send-message-btn').disabled = false;
        inputField.focus();
        return;
      }

      if (intentForcesExplicitLengthDirect) {
        if (loadingElement && loadingElement.isConnected) loadingElement.remove();
        const directSuccess = await generateExplicitLengthPDFDirectMode(promptText, fileContextString, isMonochromeMode, isEmptyCanvasForStep, /(replace|rewrite|start over|নতুন করে|মুছে ফেলে|পুনরায় লিখ)/i.test(promptText), modelsUsed, intentPayload);
        if (directSuccess) {
          if (typeof isMobileDeviceLayout === 'function' && isMobileDeviceLayout() && typeof setMobileView === 'function') setMobileView('editor');
          if (typeof displayToastNotification === 'function') displayToastNotification(`✅ ${intentPayload.length === 'long_pdf' ? 'Long' : 'Short'} PDF generated.`);
          if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('ai', `✅ ${intentPayload.length === 'long_pdf' ? 'Long' : 'Short'} PDF generated successfully.`);
          _updateLivePageNumberFromCurrentDocument();
          try {
            const analytics = typeof computeDocumentAnalytics === 'function' ? await computeDocumentAnalytics(analyticsStart, modelsUsed) : null;
            if (analytics && typeof appendChatMessageToUI === 'function' && typeof formatAnalyticsChatMessage === 'function') {
              appendChatMessageToUI('ai', formatAnalyticsChatMessage(analytics));
            }
          } catch (analyticsErr) { console.warn('Analytics failed:', analyticsErr); }
        } else {
          if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', `${intentPayload.length === 'long_pdf' ? 'Long' : 'Short'} PDF generation failed before substantive content could be committed.`);
        }
        APP_STATE.suppressDocumentAIChat = false;
        APP_STATE.isAIGenerating = false;
        document.getElementById('send-message-btn').disabled = false;
        inputField.focus();
        return;
      }

      if (useStepByStepGeneration) {
        loadingElement.remove();
        const isReplaceIntentForStep = /(replace|rewrite|start over|নতুন করে|মুছে ফেলে|পুনরায় লিখ)/i.test(promptText);
        const success = await generateComprehensiveDocumentStepByStep(promptText, fileContextString, isMonochromeMode, isEmptyCanvasForStep, isReplaceIntentForStep, modelsUsed, intentPayload, precomputedGenerationPlan);
        if (success === false && (!intentPayload || intentPayload.length === 'standard')) {
          loadingElement.remove();
        } else {
          if (success && typeof isMobileDeviceLayout === 'function' && isMobileDeviceLayout() && typeof setMobileView === 'function') setMobileView('editor');
          if (success && typeof displayToastNotification === 'function') displayToastNotification("✅ Note generated!");
          _updateLivePageNumberFromCurrentDocument();
          if (success) {
            try {
              const analytics = typeof computeDocumentAnalytics === 'function' ? await computeDocumentAnalytics(analyticsStart, modelsUsed) : null;
              if (analytics && typeof appendChatMessageToUI === 'function' && typeof formatAnalyticsChatMessage === 'function') {
                appendChatMessageToUI('ai', formatAnalyticsChatMessage(analytics));
              }
            } catch (analyticsErr) { console.warn('Analytics failed:', analyticsErr); }
          }
          APP_STATE.suppressDocumentAIChat = false;
          APP_STATE.isAIGenerating = false;
          document.getElementById('send-message-btn').disabled = false;
          inputField.focus();
          return;
        }
      }

      // ========== SINGLE-SHOT FALLBACK ==========
      const existingHeadings = typeof getExistingHeadings === 'function' ? getExistingHeadings() : [];
      const headingWarningSingle = existingHeadings.length > 0 ? `The document already contains these sections: ${existingHeadings.join(', ')}. Do NOT repeat or duplicate any of them — only add genuinely new sections that are not already covered.` : '';
      const outputLanguageSingle = intentPayload.language ? null : (typeof detectOutputLanguage === 'function' ? detectOutputLanguage(promptText) : 'en');

      const strategyContextSingle = precomputedGenerationPlan ? `\n\nAI PLANNING RESULT: depth=${precomputedGenerationPlan.depth}, estimated_pages=${precomputedGenerationPlan.estimatedPages}, estimated_output_tokens=${precomputedGenerationPlan.estimatedTokens || 'not specified'}. This request was intentionally routed to ONE generation response. Write to the full planned depth; do not turn a detailed/comprehensive note into a short answer.` : (!sectionModeEnabled ? `\n\nDIRECT GENERATION MODE: Section Mode is OFF. Generate the complete requested document in ONE continuous AI response. Do not rely on a section planner or separate section requests. Use natural headings where useful, but preserve all requested detail.` : '');

      const systemPrompt =
        `You are an AI Document Assistant. MODE: ${isMonochromeMode ? 'MONOCHROME' : 'COLORFUL'}.\n${typeof buildSharedRules === 'function' ? buildSharedRules(isMonochromeMode, outputLanguageSingle || 'en') : ''}${strategyContextSingle}\n` +
        `CRITICAL INSTRUCTION FOR FLOWCHARTS: NEVER EVER create decision branches with "Yes" / "No" labels or coding logic. Generate simple step-by-step process flow.\n` +
        `JSON STRUCTURE OPTIONS:\n1. Append (Add to end): {"action": "append_content", "html_content": "...", "chat_summary": "..."}\n2. Update Specific Section: {"action": "update_section", "target_heading": "Exact Heading from Canvas", "new_html": "...", "chat_summary": "..."}\n3. Prepend (Add to top): {"action": "prepend_content", "html_content": "...", "chat_summary": "..."}\n4. Replace ALL: {"action": "replace_all", "html_content": "...", "chat_summary": "..."}\n5. Update ONE specific page: {"action": "update_page", "page_number": <integer>, "new_html": "...", "chat_summary": "..."}\n6. Update MULTIPLE pages: {"action": "update_pages", "updates": [{"page_number": 1, "new_html": "..."}], "chat_summary": "..."}\n7. Just reply: {"action": "chat_reply", "message": "..."}\n${headingWarningSingle}${typeof buildAtCommandInstructionText === 'function' ? buildAtCommandInstructionText(intentPayload) : ''}`;

      const apiMessagesArray = [{ role: 'system', content: systemPrompt }];
      if (shouldUseMemory) apiMessagesArray.push(...APP_STATE.chatHistory.slice(-6));
      if (pageContext) {
        const multiEdit = intentPayload.intent === 'edit' && Array.isArray(intentPayload.editPages) && intentPayload.editPages.length > 1;
        const addPages = intentPayload.intent === 'add' && Array.isArray(intentPayload.pageNumbers) ? intentPayload.pageNumbers : [];
        const instruction = intentPayload.intent === 'add'
          ? `\nADD new material to the selected page${addPages.length === 1 ? '' : 's'} ${addPages.join(', ')}. Preserve existing content and return an update_pages/update_page action that keeps the old material and adds the requested material.\n\nCONTEXT:\n${pageContext.contextString}`
          : (multiEdit ? `\nEDIT ONLY PAGES: ${intentPayload.editPages.join(', ')}. Return action "update_pages" with EVERY selected page.\n\nCONTEXT:\n${pageContext.contextString}` : `\nEDIT ONLY TARGET PAGE ${pageContext.targetPage || requestedPageNumber}. Return action "update_page" with page_number and only that page's new_html.\n\nCONTEXT:\n${pageContext.contextString}`);
        apiMessagesArray.push({ role: 'user', content: await buildAIUserContent(promptText, fileContextString, instruction) });
      } else {
        const currentEditorText = typeof getCanvasContentWithLatexSource === 'function' ? getCanvasContentWithLatexSource() : '';
        apiMessagesArray.push({ role: 'user', content: await buildAIUserContent(promptText, fileContextString, `\nCURRENT CANVAS:\n${currentEditorText.substring(0, 5000)}`) });
      }

      if (isDocumentRequest && typeof ProgressUI !== 'undefined' && ProgressUI.show) {
        ProgressUI.show('Generating document content...', 'AI is writing...');
        ProgressUI.startAutoEstimate(APP_CONFIG.SINGLE_SHOT_ESTIMATED_SECONDS);
      }

      let result = await callAIAPI(apiMessagesArray, { forceJson: true, modelsUsedSet: modelsUsed, maxTokens: undefined });
      let parsedJson = safeParseAIJson(result.content, null);

      if (!parsedJson && result.content && result.content.trim().startsWith('{')) {
        parsedJson = attemptRepairAndParse(result.content);
        if (!parsedJson) {
          if (typeof displayToastNotification === 'function') displayToastNotification('⚠️ JSON parsing failed, retrying...');
          const retryMessages = [{ role: 'system', content: `You are a JSON-only assistant. Your previous output contained unescaped backslashes and was not valid JSON. Ensure every backslash inside string values is doubled (\\\\). Output ONLY valid JSON.` }, { role: 'user', content: `Please respond to the original request: ${promptText}` }];
          const retryResult = await callAIAPI(retryMessages, { forceJson: true, modelsUsedSet: modelsUsed, maxTokens: undefined });
          parsedJson = safeParseAIJson(retryResult.content, null);
          if (parsedJson) result = retryResult;
        }
      }

      if (requestSessionId !== APP_STATE.activeSessionId) {
        if (loadingElement && loadingElement.isConnected) loadingElement.remove();
        APP_STATE.isAIGenerating = false;
        document.getElementById('send-message-btn').disabled = false;
        if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
        return;
      }

      if (!parsedJson && isDocumentRequest) {
        const content = result.content || '';
        const looksLikeJsonWrapper = content.trim().startsWith('{') && /"action"\s*:/.test(content);
        if (looksLikeJsonWrapper) {
          loadingElement.remove();
          if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', '⚠️ The AI response was malformed JSON and could not be parsed. Please try again.');
          if (typeof displayToastNotification === 'function') displayToastNotification('Error JSON parsing failed. Please retry.');
          APP_STATE.isAIGenerating = false;
          document.getElementById('send-message-btn').disabled = false;
          if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
          return;
        }
        if (/<[a-z][\s\S]*>/i.test(content)) {
          parsedJson = { action: 'append_content', html_content: content, chat_summary: "✅ Document generated!" };
        } else if (content.trim() && content.trim().length > 10) {
          parsedJson = { action: 'append_content', html_content: convertTextToDocumentHTML(content), chat_summary: "✅ Document generated!" };
        } else {
          parsedJson = { action: 'chat_reply', message: "I couldn't generate content from your request." };
        }
      }

      if (!parsedJson) parsedJson = { action: 'chat_reply', message: result.content || "I processed your request but couldn't determine an action." };

      if (intentPayload.intent === 'chat') {
        const chatMessage = parsedJson.message || parsedJson.chat_summary || result.content || 'How can I help?';
        parsedJson = {
          action: 'chat_reply',
          message: String(chatMessage).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
        };
      }

      if (isDocumentRequest && parsedJson.action === 'chat_reply' && parsedJson.message) {
        const content = parsedJson.message;
        if (/<[a-z][\s\S]*>/i.test(content)) {
          parsedJson = { action: 'append_content', html_content: content, chat_summary: parsedJson.chat_summary || "✅ Document generated!" };
        } else if (content.trim() && content.trim().length > 10) {
          parsedJson = { action: 'append_content', html_content: convertTextToDocumentHTML(content), chat_summary: parsedJson.chat_summary || "✅ Document generated!" };
        }
      }

      if (isDocumentRequest && !parsedJson.html_content && !parsedJson.new_html && result.content && /<[a-z][\s\S]*>/i.test(result.content)) {
        parsedJson = { action: 'append_content', html_content: result.content, chat_summary: "✅ Document generated!" };
      }

      if (result.finishReason === 'length') {
        const growingField = parsedJson.action === 'update_section' ? 'new_html' : 'html_content';
        if (typeof parsedJson[growingField] === 'string' && parsedJson[growingField]) {
          parsedJson[growingField] = await generateHtmlContentWithAutoContinue(promptText, parsedJson[growingField], result.finishReason, modelsUsed, APP_CONFIG.CONTINUATION_MAX_LOOPS, result.modelConfig);
        }
      }

      if (loadingElement && loadingElement.isConnected) loadingElement.remove();

      const currentFullHTML = typeof getAllCanvasHTML === 'function' ? getAllCanvasHTML() : '';
      const isCanvasEmpty = currentFullHTML.includes('Start typing here');
      let documentWasUpdated = false;
      let chatReplyMessage = null;

      if (['edit', 'refine'].includes(intentPayload.intent) && ['append_content', 'prepend_content', 'replace_all'].includes(parsedJson.action)) {
        console.warn('[Edit/Refine] rejected unsafe action:', parsedJson.action);
        if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', 'The AI returned an unsafe edit action, so the existing document was left unchanged. Please retry.');
        documentWasUpdated = false;
        chatReplyMessage = 'Edit not applied — unsafe action rejected.';
      } else {
        if (parsedJson.action === 'prepend_content' && parsedJson.html_content) {
          if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
          if (typeof setDocumentHTMLAndPaginate === 'function') setDocumentHTMLAndPaginate(isCanvasEmpty ? parsedJson.html_content : parsedJson.html_content + currentFullHTML);
          const container = document.getElementById('document-view-container');
          if (container) container.scrollTop = 0;
          chatReplyMessage = parsedJson.chat_summary || "✅ Content inserted!";
          documentWasUpdated = true;
          _updateLivePageNumberFromCurrentDocument();
        } else if (parsedJson.action === 'update_section' && parsedJson.target_heading && parsedJson.new_html) {
          if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
          if (typeof updateSpecificSectionByHeading === 'function' && !(await updateSpecificSectionByHeading(parsedJson.target_heading, parsedJson.new_html))) {
            chatReplyMessage = `⚠️ Could not locate the existing section "${parsedJson.target_heading}" — no content was appended.`;
            if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', chatReplyMessage);
            documentWasUpdated = false;
          } else {
            chatReplyMessage = parsedJson.chat_summary || "✅ Section updated!";
            documentWasUpdated = true;
            _updateLivePageNumberFromCurrentDocument();
          }
        } else if (parsedJson.action === 'replace_all' && parsedJson.html_content) {
          if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
          if (typeof setDocumentHTMLAndPaginate === 'function') setDocumentHTMLAndPaginate(parsedJson.html_content);
          chatReplyMessage = parsedJson.chat_summary || "✅ Document generated!";
          documentWasUpdated = true;
          _updateLivePageNumberFromCurrentDocument();
        } else if ((parsedJson.action === 'append_content' || !parsedJson.action) && parsedJson.html_content) {
          if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
          if (typeof setDocumentHTMLAndPaginate === 'function') setDocumentHTMLAndPaginate(isCanvasEmpty ? parsedJson.html_content : currentFullHTML + "<br><br>" + parsedJson.html_content);
          chatReplyMessage = parsedJson.chat_summary || "✅ Content added!";
          documentWasUpdated = true;
          _updateLivePageNumberFromCurrentDocument();
        } else if (parsedJson.action === 'update_pages' && Array.isArray(parsedJson.updates) && parsedJson.updates.length) {
          const expected = intentPayload.intent === 'edit' && Array.isArray(intentPayload.editPages) ? [...intentPayload.editPages].sort((a, b) => a - b) : null;
          const actual = parsedJson.updates.map(u => parseInt(u.page_number, 10)).filter(Number.isInteger).sort((a, b) => a - b);
          const complete = !expected || (expected.length === actual.length && expected.every((n, i) => n === actual[i]));
          if (!complete) {
            chatReplyMessage = '⚠️ The AI did not return every selected page. No changes were made.';
            if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', chatReplyMessage);
          } else {
            if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
            if (typeof updateSpecificPagesByNumber === 'function' && updateSpecificPagesByNumber(parsedJson.updates)) {
              chatReplyMessage = parsedJson.chat_summary || '✅ Selected pages updated!';
              documentWasUpdated = true;
              _updateLivePageNumberFromCurrentDocument();
            } else {
              chatReplyMessage = '⚠️ Selected page updates could not be applied safely.';
              if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', chatReplyMessage);
            }
          }
        } else if (parsedJson.action === 'update_page' && parsedJson.page_number && typeof parsedJson.new_html === 'string') {
          if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
          const pageUpdateApplied = typeof updateSpecificPageByNumber === 'function' ? updateSpecificPageByNumber(parseInt(parsedJson.page_number, 10), parsedJson.new_html) : false;
          if (pageUpdateApplied) {
            chatReplyMessage = parsedJson.chat_summary || `✅ Page ${parsedJson.page_number} updated!`;
            documentWasUpdated = true;
            _updateLivePageNumberFromCurrentDocument();
          } else {
            chatReplyMessage = `⚠️ Page ${parsedJson.page_number} not found — no changes made.`;
            if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', chatReplyMessage);
          }
        } else if (parsedJson.message && /<(h[1-3]|table|div class="(block-|fc-)|ul|ol)[\s>]/i.test(parsedJson.message)) {
          if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
          if (typeof setDocumentHTMLAndPaginate === 'function') setDocumentHTMLAndPaginate(isCanvasEmpty ? parsedJson.message : currentFullHTML + "<br><br>" + parsedJson.message);
          chatReplyMessage = parsedJson.chat_summary || "✅ Content added!";
          documentWasUpdated = true;
          _updateLivePageNumberFromCurrentDocument();
        } else if (parsedJson.message) {
          chatReplyMessage = parsedJson.message;
          if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('ai', chatReplyMessage);
        } else {
          const fallbackMsg = result.content || "I processed your request but couldn't determine an action.";
          chatReplyMessage = fallbackMsg;
          if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('ai', fallbackMsg);
        }
      }

      if (documentWasUpdated) {
        if (typeof repairEquationsInNewContent === 'function') await repairEquationsInNewContent(modelsUsed);
        if (typeof checkForDuplicateHeadings === 'function') checkForDuplicateHeadings();
        _updateLivePageNumberFromCurrentDocument();
      }

      if (documentWasUpdated && chatReplyMessage && typeof appendChatMessageToUI === 'function') {
        appendChatMessageToUI('ai', chatReplyMessage);
      }

      if (chatReplyMessage || documentWasUpdated) {
        const chatHistoryArea = document.getElementById('chat-history');
        if (chatHistoryArea) chatHistoryArea.scrollTop = chatHistoryArea.scrollHeight;
      }

      if (isDocumentRequest) setTimeout(() => { if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide(); }, 200);

      if (typeof isMobileDeviceLayout === 'function' && isMobileDeviceLayout() && documentWasUpdated && typeof setMobileView === 'function') {
        setMobileView('editor');
        if (typeof displayToastNotification === 'function') displayToastNotification("✅ Note generated!");
      }

      if (documentWasUpdated) {
        try {
          const analytics = typeof computeDocumentAnalytics === 'function' ? await computeDocumentAnalytics(analyticsStart, modelsUsed) : null;
          if (analytics && typeof appendChatMessageToUI === 'function' && typeof formatAnalyticsChatMessage === 'function') {
            appendChatMessageToUI('ai', formatAnalyticsChatMessage(analytics));
          }
        } catch (analyticsErr) { console.warn('Analytics failed:', analyticsErr); }
      }

    } catch (error) {
      if (loadingElement) loadingElement.remove();
      if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
      APP_STATE.suppressDocumentAIChat = false;
      let userFriendlyMsg = error.message || 'Unknown error.';
      if (error.noModelConfigured) {
        userFriendlyMsg = 'No AI model configured. Please click "AI Models" and add a model.';
      } else if (error.kind === 'network') {
        userFriendlyMsg = 'Network error — please check your internet connection and AI model API URL.';
      } else if (error.kind === 'empty_response') {
        userFriendlyMsg = 'The AI returned an empty response. Please try again with a clearer request.';
      } else if (error.kind === 'malformed_response') {
        userFriendlyMsg = 'The AI returned malformed data. Please try again.';
      }
      if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', `⚠️ ${userFriendlyMsg}`);
      console.error('sendChatPromptToAI error:', error);
    }
    APP_STATE.suppressDocumentAIChat = false;
    APP_STATE.isAIGenerating = false;
    document.getElementById('send-message-btn').disabled = false;
    inputField.focus();
  } catch (e) {
    console.error('sendChatPromptToAI outer error:', e);
    APP_STATE.suppressDocumentAIChat = false;
    APP_STATE.isAIGenerating = false;
    document.getElementById('send-message-btn').disabled = false;
  }
}

// ===== APP INITIALIZATION =====
window.onload = function() {
  if (typeof TAB_MANAGER !== 'undefined') {
    TAB_MANAGER.init();
  }

  if (typeof applyPDFVisualFormat === 'function') {
    applyPDFVisualFormat(typeof getActivePDFVisualFormat === 'function' ? getActivePDFVisualFormat() : 'default');
  }

  if (typeof loadAIModelsState === 'function') loadAIModelsState();
  if (typeof renderAIModelSelectBar === 'function') renderAIModelSelectBar();
  window.addEventListener('resize', typeof sizeAIModelSelect === 'function' ? sizeAIModelSelect : function() {}, { passive: true });

  if (typeof applyCurrentTheme === 'function') applyCurrentTheme();
  if (typeof updateModeButtonText === 'function') updateModeButtonText();
  if (typeof applyMonochromeDocumentStyles === 'function') applyMonochromeDocumentStyles();

  document.querySelectorAll('.doc-page-canvas').forEach(page => {
    if (typeof handlePageBlur === 'function') page.addEventListener('blur', handlePageBlur);
  });

  const textarea = document.getElementById('chat-input-textarea');
  if (textarea) {
    textarea.addEventListener('input', function() { if (typeof autoResizeTextarea === 'function') autoResizeTextarea(this); });
  }

  APP_STATE._sendDebounce = false;

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function() {
      if (typeof scheduleReflow === 'function') scheduleReflow();
    }).catch(function() {});
  }

  if (typeof switchPreviewTabDesktop === 'function') {
    switchPreviewTabDesktop((typeof isMobileDeviceLayout === 'function' && isMobileDeviceLayout()) ? 'chat' : 'chat');
  }

  if (typeof renderAttachmentBar === 'function') renderAttachmentBar();

  try {
    const container = document.getElementById('document-view-container');
    if (container && typeof runDocumentOutputIntegrityPass === 'function') runDocumentOutputIntegrityPass(container);
  } catch (e) { console.warn('Initial document integrity pass skipped:', e); }

  if (typeof TAB_MANAGER !== 'undefined' && TAB_MANAGER.renderTabBar) {
    TAB_MANAGER.renderTabBar();
  }

  if (typeof bindTopbarMoreMenu === 'function') bindTopbarMoreMenu();

  console.log('✅ AI PDF Studio initialized successfully!');
};

// ===== KEYBOARD SHORTCUTS FOR CHAT =====
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && e.ctrlKey && document.activeElement && document.activeElement.id === 'chat-input-textarea') {
    e.preventDefault();
    if (typeof triggerChatSend === 'function') triggerChatSend();
  }
});

// ===== HANDLE CHAT KEY PRESS =====
function handleChatKeyPress(event) {
  if (typeof AT_MENU_STATE !== 'undefined' && AT_MENU_STATE.open) {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (typeof moveAtCommandHighlight === 'function') moveAtCommandHighlight(1); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); if (typeof moveAtCommandHighlight === 'function') moveAtCommandHighlight(-1); return; }
    if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); if (typeof chooseHighlightedAtCommand === 'function') chooseHighlightedAtCommand(); return; }
    if (event.key === 'Escape') { event.preventDefault(); if (typeof closeAtCommandMenu === 'function') closeAtCommandMenu(); return; }
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    if (typeof isTouchOnlyDevice === 'function' && isTouchOnlyDevice()) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof triggerChatSend === 'function') triggerChatSend();
  }
}

// ============================================================
// WINDOW EXPOSURE — Main App
// ============================================================
window.handleChatFormSubmit = handleChatFormSubmit;
window.triggerChatSend = triggerChatSend;
window.sendChatPromptToAI = sendChatPromptToAI;
window.isCopyStyleCommand = isCopyStyleCommand;
window.handleCopyStyleCommand = handleCopyStyleCommand;
window.handleChatKeyPress = handleChatKeyPress;
window.appendChatMessageToUI = appendChatMessageToUI;
window.convertTextToDocumentHTML = convertTextToDocumentHTML;
window.getActiveTabIdSafe = getActiveTabIdSafe;
window.getActiveTabStateSafe = getActiveTabStateSafe;
window.commitRuntimeStateSafe = commitRuntimeStateSafe;
window.buildAttachmentContextForAI = buildAttachmentContextForAI;
window.detectOutputLanguage = detectOutputLanguage;
window.getDirectAIAttachmentFiles = getDirectAIAttachmentFiles;
window.readFileAsDataUrlForAI = readFileAsDataUrlForAI;
window.buildDirectAIAttachmentParts = buildDirectAIAttachmentParts;
window.buildAIUserContent = buildAIUserContent;
window.isFileReferencedRequest = isFileReferencedRequest;
window.cleanAttachmentSourceForAI = cleanAttachmentSourceForAI;
window.sanitizeHTML = sanitizeHTML;
window.isSafeHTMLUrl = isSafeHTMLUrl;
window.sanitizeAttributeUrl = sanitizeAttributeUrl;
window.safeParseAIJson = safeParseAIJson;
window.attemptRepairAndParse = attemptRepairAndParse;
window.normalizeAIContent = normalizeAIContent;
window.callAIAPI = callAIAPI;
window.buildSharedRules = buildSharedRules;
window.generateTopicPlan = generateTopicPlan;
window.generateNextSection = generateNextSection;
window.generateSectionBatch = generateSectionBatch;
window.generateComprehensiveDocumentStepByStep = generateComprehensiveDocumentStepByStep;
window.generateDefaultPDFDirectMode = generateDefaultPDFDirectMode;
window.generateExplicitLengthPDFDirectMode = generateExplicitLengthPDFDirectMode;
window.generateLongPDFDirectMode = generateLongPDFDirectMode;
window.computeDocumentAnalytics = computeDocumentAnalytics;
window.formatAnalyticsChatMessage = formatAnalyticsChatMessage;
window.validateAIActionHandlers = validateAIActionHandlers;
window.handleRefineAction = handleRefineAction;
window._updateLivePageNumberFromCurrentDocument = _updateLivePageNumberFromCurrentDocument;