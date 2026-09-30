// Pata AI — Google sign-in gate + end-to-end-encrypted cloud backup (Firebase Auth + Firestore).
// Loaded as an ES module AFTER the classic app scripts. Needs js/firebase-config.js and js/pata-vault.js.
const CFG = window.PATA_FIREBASE_CONFIG || {};
const SDK_VER = window.PATA_FIREBASE_SDK_VERSION || '10.14.1';
const V = window.PataVault;
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isLocalHost = ['localhost', '127.0.0.1'].includes(location.hostname);
const configured = !!(CFG.apiKey && CFG.projectId && CFG.appId);

// ---------- what gets backed up ----------
const SECRET_KEYS = ['aiModelsConfig_v1', 'aiModelAutoSwitchEnabled_v1', 'OCR_PREFERRED_MODEL_ID'];   // holds API keys
const PREF_KEYS = ['aiPdfStudio.visualFormat', 'aiPdfStudio.textFormat', 'aiPdfStudio.languageFormat', 'aiStudioCreationMode_v1',
  'atCommandRecents_v1', 'aipdf_slide_auto_background_mode', 'aipdf_slide_auto_background_enabled', 'pata_theme'];
const SYNC_KEYS = SECRET_KEYS.concat(PREF_KEYS);
const WIPE_KEYS = SYNC_KEYS.concat(['aiDocTabs_v1', 'aiDocProState_v22', 'aiModelDailyResetDate_v1', 'studio_theme',
  'pata_sync_state', 'pata_local_owner']);
const MODEL_FIELDS = ['id', 'name', 'apiUrl', 'apiKey', 'modelId', 'supportsJson', 'supportsVision', 'enableGoogleSearch', 'apiType'];
const MAX_INDEX = 300, MAX_UPLOAD_CHARS = 8000000;

// ---------- state ----------
const G = { fb: null, auth: null, db: null, user: null, uid: null, session: null, meta: null, index: null,
  hashes: {}, timer: null, running: false, status: 'off', lastAt: 0, err: '', engineOn: false };
const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
const lsDel = k => { try { localStorage.removeItem(k); } catch (_) {} };
const toast = m => { try { (window.displayToastNotification || console.log)(m); } catch (_) {} };
const readSync = () => { try { return JSON.parse(lsGet('pata_sync_state') || '{}'); } catch (_) { return {}; } };
const writeSync = o => lsSet('pata_sync_state', JSON.stringify(o));

// ---------- CSS for modals / account UI (gate CSS is inline in index.html) ----------
(function injectCss() {
  const st = document.createElement('style');
  st.textContent = `
#pata-account-btn{display:flex;align-items:center;gap:8px}
#pata-account-btn .pa-av{width:22px;height:22px;border-radius:50%;object-fit:cover;background:#e5e7eb;flex:none}
#pata-account-btn .pa-name{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#pata-account-btn .pa-dot{width:8px;height:8px;border-radius:50%;background:#9ca3af;flex:none}
#pata-account-btn.ok .pa-dot{background:#22c55e}#pata-account-btn.busy .pa-dot{background:#f59e0b}
#pata-account-btn.err .pa-dot{background:#ef4444}
#pata-pop{position:fixed;z-index:2147481000;top:64px;right:12px;width:min(320px,calc(100vw - 24px));background:var(--surface-strong,#fff);
 color:var(--text-primary,#0f172a);border:1px solid var(--border-color,#e2e6ee);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.28);padding:14px;display:none}
#pata-pop.show{display:block}
#pata-pop .pp-mail{font-size:13px;opacity:.75;overflow:hidden;text-overflow:ellipsis}
#pata-pop .pp-stat{font-size:12.5px;margin:8px 0 10px;opacity:.85}
#pata-pop button{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;font:600 14px inherit;font-family:inherit;padding:10px 8px;border-radius:10px;cursor:pointer}
#pata-pop button:hover{background:rgba(79,125,243,.12)}#pata-pop button.danger{color:#ef4444}
#pata-modal{position:fixed;inset:0;z-index:2147481500;display:none;align-items:center;justify-content:center;padding:14px;background:rgba(15,23,42,.55);backdrop-filter:blur(6px)}
#pata-modal.show{display:flex}
#pata-modal .pm-card{width:100%;max-width:520px;max-height:86vh;display:flex;flex-direction:column;background:var(--surface-strong,#fff);color:var(--text-primary,#0f172a);border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.35);overflow:hidden}
#pata-modal .pm-head{display:flex;align-items:center;gap:8px;padding:16px 18px;border-bottom:1px solid var(--border-color,#e2e6ee)}
#pata-modal .pm-head h3{margin:0;font-size:17px;flex:1}
#pata-modal .pm-x{border:0;background:transparent;color:inherit;font-size:22px;cursor:pointer;line-height:1}
#pata-modal .pm-body{padding:14px 18px 18px;overflow:auto}
#pata-modal .pm-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-color,#e2e6ee)}
#pata-modal .pm-row:last-child{border-bottom:0}
#pata-modal .pm-t{flex:1;min-width:0}#pata-modal .pm-t b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14.5px}
#pata-modal .pm-t small{opacity:.65;font-size:12px}
#pata-modal .pm-b{border:0;border-radius:10px;padding:8px 12px;font:600 13px inherit;font-family:inherit;cursor:pointer;background:#4f7df3;color:#fff}
#pata-modal .pm-b.ghost{background:rgba(148,163,184,.2);color:inherit}#pata-modal .pm-b.danger{background:#ef4444}
#pata-modal .pm-empty{padding:26px 8px;text-align:center;opacity:.65;font-size:14px}
#pata-modal .pm-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}`;
  document.head.appendChild(st);
})();

// ---------- gate UI ----------
const gate = $('#pata-gate'), gbody = $('#pg-body');
const APP_IDS = ['topbar', 'tab-bar', 'mobile-nav-bar', 'main-container'];
function inertApp(on) { APP_IDS.forEach(id => { const el = document.getElementById(id); if (el) on ? el.setAttribute('inert', '') : el.removeAttribute('inert'); }); }
function view(html) { if (!gate) return; gbody.innerHTML = html; gate.hidden = false; gate.classList.add('pg-on'); inertApp(true); }
function closeGate() { if (!gate) return; gate.classList.remove('pg-on'); gate.hidden = true; inertApp(false); }
const wait = msg => view(`<div class="pg-spin"></div><p class="pg-muted">${esc(msg)}</p>`);
const setErr = m => { const e = $('#pg-err'); if (e) e.textContent = m || ''; };
const GOOGLE_SVG = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.7-9.9 6.7-17.4z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.9 2.3-8.6 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

function showLogin(err) {
  const webview = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)/i.test(navigator.userAgent);
  view(`<h2>Welcome</h2>
    <p class="pg-muted">Sign in with Google to continue. Your API keys and history are backed up <b>end-to-end encrypted</b> — only you can read them.</p>
    ${webview ? '<p class="pg-warn">Google blocks sign-in inside in-app browsers. Please open this page in Chrome or Safari.</p>' : ''}
    <button class="pg-btn pg-google" id="pg-signin">${GOOGLE_SVG}<span>Continue with Google</span></button>
    <div id="pg-err" class="pg-err" role="alert">${esc(err || '')}</div>`);
  $('#pg-signin').onclick = signIn;
}
function showUnconfigured() {
  view(`<h2>Setup needed</h2>
    <p class="pg-muted">Firebase isn't configured yet. Paste your Firebase web config into <code>js/firebase-config.js</code>, then reload.</p>
    ${isLocalHost ? '<button class="pg-btn" id="pg-dev">Continue in setup mode (no login)</button>' : ''}`);
  const d = $('#pg-dev'); if (d) d.onclick = () => closeGate();
}
function showError(msg, retry) {
  view(`<h2>Can't connect</h2><p class="pg-muted">${esc(msg)}</p><button class="pg-btn" id="pg-retry">Try again</button>`);
  $('#pg-retry').onclick = retry;
}

// ---------- Firebase loading + sign-in ----------
async function loadFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${SDK_VER}/`;
  const [app, auth, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  const fbApp = app.initializeApp(CFG);
  G.fb = { app, auth, fs };
  G.auth = auth.getAuth(fbApp);
  G.db = fs.getFirestore(fbApp);
}
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
async function signIn() {
  const { auth } = G.fb;
  const provider = new auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const btn = $('#pg-signin'); if (btn) btn.disabled = true;
  try {
    if (isStandalone() && /android|iphone|ipad|ipod/i.test(navigator.userAgent)) return await auth.signInWithRedirect(G.auth, provider);
    await auth.signInWithPopup(G.auth, provider);
  } catch (e) {
    const c = e && e.code || '';
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(c)) {
      try { return await auth.signInWithRedirect(G.auth, provider); } catch (e2) { e = e2; }
    }
    if (btn) btn.disabled = false;
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) return;
    const map = { 'auth/unauthorized-domain': 'This domain is not in Firebase → Authentication → Settings → Authorized domains.',
      'auth/network-request-failed': 'Network error. Check your internet connection.',
      'auth/operation-not-allowed': 'Enable the Google provider in Firebase → Authentication → Sign-in method.' };
    setErr(map[e.code] || ('Sign-in failed (' + (e.code || e.message) + ').'));
  }
}

// ---------- firestore refs ----------
const R = {
  d: (...p) => G.fb.fs.doc(G.db, 'users', G.uid, ...p),
  meta: () => R.d('vault', 'meta'), secrets: () => R.d('sync', 'secrets'), prefs: () => R.d('sync', 'prefs'), index: () => R.d('sync', 'index'),
  hist: id => R.d('hist', id)
};
async function getData(ref) { const s = await G.fb.fs.getDoc(ref); return s.exists() ? s.data() : null; }

// ---------- vault UI flows ----------
function promptCreateVault() {
  return new Promise(resolve => {
    view(`<h2>Protect your backup</h2>
      <p class="pg-muted">Choose a passphrase. Your API keys and history are encrypted <b>on this device</b> before upload, so nobody — not us, not Google — can read them. We can't reset this passphrase for you.</p>
      <input class="pg-in" id="pg-p1" type="password" autocomplete="new-password" placeholder="Passphrase (10+ characters)">
      <input class="pg-in" id="pg-p2" type="password" autocomplete="new-password" placeholder="Repeat passphrase">
      <div id="pg-err" class="pg-err" role="alert"></div>
      <button class="pg-btn" id="pg-go">Create encrypted backup</button>
      <button class="pg-link" id="pg-skip">Skip for now (no backup)</button>`);
    $('#pg-skip').onclick = () => resolve(false);
    $('#pg-go').onclick = async () => {
      const p1 = $('#pg-p1').value, p2 = $('#pg-p2').value;
      const issue = V.passphraseIssue(p1);
      if (issue) return setErr(issue);
      if (p1 !== p2) return setErr("Passphrases don't match.");
      wait('Creating your encrypted vault…');
      try {
        const r = await V.createVault(G.uid, p1);
        await G.fb.fs.setDoc(R.meta(), r.meta);
        G.meta = r.meta; G.session = r.session;
        await V.cacheSession(G.uid, r.session);
        await showRecoveryKey(r.recoveryKey);
        resolve(true);
      } catch (e) { console.warn('[cloud] vault create failed', e); showError('Could not create the vault: ' + (e.code || e.message), () => resolve(promptCreateVault())); }
    };
  });
}
function showRecoveryKey(key) {
  return new Promise(resolve => {
    view(`<h2>Save your recovery key</h2>
      <p class="pg-muted">If you forget your passphrase, this key is the <b>only</b> way to get your backup back. Store it somewhere safe (password manager, paper).</p>
      <div class="pg-key" id="pg-key">${esc(key)}</div>
      <div class="pg-row"><button class="pg-btn pg-sec" id="pg-copy">Copy</button><button class="pg-btn pg-sec" id="pg-dl">Download</button></div>
      <label class="pg-check"><input type="checkbox" id="pg-ack"> I saved my recovery key</label>
      <button class="pg-btn" id="pg-go" disabled>Continue</button>`);
    $('#pg-copy').onclick = async () => { try { await navigator.clipboard.writeText(key); $('#pg-copy').textContent = 'Copied ✓'; } catch (_) {} };
    $('#pg-dl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`Pata AI recovery key\n${key}\n`], { type: 'text/plain' })); a.download = 'pata-ai-recovery-key.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
    $('#pg-ack').onchange = e => { $('#pg-go').disabled = !e.target.checked; };
    $('#pg-go').onclick = resolve;
  });
}
function promptUnlock(msg) {
  return new Promise(resolve => {
    view(`<h2>Unlock your backup</h2>
      <p class="pg-muted">${esc(msg || 'Enter your backup passphrase to restore your API keys and history on this device.')}</p>
      <input class="pg-in" id="pg-p1" type="password" autocomplete="current-password" placeholder="Passphrase">
      <div id="pg-err" class="pg-err" role="alert"></div>
      <button class="pg-btn" id="pg-go">Unlock</button>
      <button class="pg-link" id="pg-rec">Forgot passphrase? Use recovery key</button>
      <button class="pg-link" id="pg-skip">Skip for now (backup stays off)</button>`);
    $('#pg-skip').onclick = () => resolve(false);
    $('#pg-rec').onclick = () => resolve(promptRecovery());
    const go = async () => {
      const btn = $('#pg-go'); btn.disabled = true; btn.textContent = 'Unlocking…';
      try {
        const r = await V.unlockWithPassphrase(G.uid, G.meta, $('#pg-p1').value);
        G.session = r.session; await V.cacheSession(G.uid, r.session); resolve(true);
      } catch (e) { btn.disabled = false; btn.textContent = 'Unlock'; setErr(e.message === 'wrong-passphrase' ? 'Wrong passphrase. Try again.' : 'Unlock failed: ' + e.message); }
    };
    $('#pg-go').onclick = go; $('#pg-p1').onkeydown = e => { if (e.key === 'Enter') go(); };
  });
}
function promptRecovery() {
  return new Promise(resolve => {
    view(`<h2>Use recovery key</h2>
      <input class="pg-in" id="pg-rk" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false">
      <input class="pg-in" id="pg-p1" type="password" autocomplete="new-password" placeholder="New passphrase (10+ characters)">
      <div id="pg-err" class="pg-err" role="alert"></div>
      <button class="pg-btn" id="pg-go">Restore &amp; set new passphrase</button>
      <button class="pg-link" id="pg-skip">Back</button>`);
    $('#pg-skip').onclick = () => resolve(promptUnlock());
    $('#pg-go').onclick = async () => {
      const np = $('#pg-p1').value, issue = V.passphraseIssue(np);
      if (issue) return setErr(issue);
      try {
        const r = await V.unlockWithRecovery(G.uid, G.meta, $('#pg-rk').value);
        const meta2 = await V.rewrapPassphrase(G.uid, G.meta, r.dek, np); r.dek.fill(0);
        await G.fb.fs.setDoc(R.meta(), meta2);
        G.meta = meta2; G.session = r.session; await V.cacheSession(G.uid, r.session); resolve(true);
      } catch (e) { setErr(/recovery/.test(e.message) ? "That recovery key doesn't match." : 'Failed: ' + (e.code || e.message)); }
    };
  });
}
async function ensureVault() {
  G.meta = await getData(R.meta());
  if (!G.meta) return promptCreateVault();
  const cached = await V.sessionFromCache(G.uid);
  if (cached) { G.session = cached; return true; }
  return promptUnlock();
}

// ---------- settings sync (API keys + prefs) ----------
function collectGroup(g) {
  const keys = g === 'secrets' ? SECRET_KEYS : PREF_KEYS, values = {};
  keys.forEach(k => { const v = lsGet(k); if (v != null) values[k] = v; });
  if (g === 'secrets' && values.aiModelsConfig_v1) {
    // Only stable fields — status / failure counters / active model change constantly and are per-device.
    try {
      const cfg = JSON.parse(values.aiModelsConfig_v1);
      values.aiModelsConfig_v1 = JSON.stringify((cfg.models || []).map(m => MODEL_FIELDS.reduce((o, f) => (m[f] !== undefined && (o[f] = m[f]), o), {})));
    } catch (_) { delete values.aiModelsConfig_v1; }
  }
  return values;
}
const groupIsEmpty = (g, v) => g === 'secrets' ? !v.aiModelsConfig_v1 || v.aiModelsConfig_v1 === '[]' : !Object.keys(v).length;
function applyGroup(g, values) {
  if (g === 'secrets') {
    let cfg = {}; try { cfg = JSON.parse(lsGet('aiModelsConfig_v1') || '{}'); } catch (_) {}
    const oldById = {}; (cfg.models || []).forEach(m => { oldById[m.id] = m; });
    let incoming = []; try { incoming = JSON.parse(values.aiModelsConfig_v1 || '[]'); } catch (_) {}
    const models = incoming.map(m => Object.assign({ status: 'idle', statusMessage: '' }, oldById[m.id] || {}, m));
    const active = models.some(m => m.id === cfg.activeModelId) ? cfg.activeModelId : (models[0] && models[0].id) || null;
    lsSet('aiModelsConfig_v1', JSON.stringify(Object.assign({}, cfg, { models, activeModelId: active })));
    SECRET_KEYS.slice(1).forEach(k => (values[k] != null ? lsSet(k, values[k]) : lsDel(k)));
  } else {
    PREF_KEYS.forEach(k => (values[k] != null ? lsSet(k, values[k]) : lsDel(k)));
  }
}
function askChoice(title, text, choices) {
  return new Promise(resolve => {
    const m = openModal(title, `<p class="pg-muted" style="margin:0 0 6px">${esc(text)}</p><div class="pm-actions">${choices.map((c, i) => `<button class="pm-b ${c.cls || ''}" data-i="${i}">${esc(c.label)}</button>`).join('')}</div>`, { locked: true });
    m.body.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => { closeModal(); resolve(choices[+b.dataset.i].value); }; });
  });
}
async function reconcileSettings() {
  const st = readSync(); let reload = false;
  for (const g of ['secrets', 'prefs']) {
    const ref = g === 'secrets' ? R.secrets() : R.prefs(), cloud = await getData(ref);
    const local = collectGroup(g), lh = V.hash(JSON.stringify(local)), s = st[g] || {};
    const upload = async () => {
      const blob = await V.seal(G.session, g === 'secrets' ? 'secrets' : 'prefs', G.uid, g, { values: local });
      const rev = Date.now(); await G.fb.fs.setDoc(ref, Object.assign({}, blob, { rev }));
      st[g] = { hash: lh, rev };
    };
    const download = async () => {
      const obj = await V.open(G.session, g === 'secrets' ? 'secrets' : 'prefs', G.uid, g, cloud);
      applyGroup(g, obj.values || {}); st[g] = { hash: V.hash(JSON.stringify(collectGroup(g))), rev: cloud.rev }; reload = true;
    };
    if (!cloud) { if (!groupIsEmpty(g, local)) await upload(); continue; }
    if (cloud.rev === s.rev) { if (lh !== s.hash && !groupIsEmpty(g, local)) await upload(); continue; }   // in sync / local edits only
    const localUntouched = s.hash !== undefined && lh === s.hash;
    if (groupIsEmpty(g, local) || localUntouched || (g === 'prefs')) await download();
    else {
      const pick = await askChoice(g === 'secrets' ? 'API keys differ' : 'Settings differ',
        'This device and your cloud backup have different data. Which one should win?',
        [{ label: 'Use cloud backup', value: 'cloud' }, { label: 'Keep this device', value: 'local', cls: 'ghost' }]);
      pick === 'cloud' ? await download() : await upload();
    }
  }
  writeSync(st);
  return reload;
}
async function pushSettingsIfChanged() {
  const st = readSync();
  for (const g of ['secrets', 'prefs']) {
    const local = collectGroup(g), lh = V.hash(JSON.stringify(local));
    if ((st[g] || {}).hash === lh || groupIsEmpty(g, local)) continue;
    const blob = await V.seal(G.session, g, G.uid, g, { values: local }), rev = Date.now();
    await G.fb.fs.setDoc(g === 'secrets' ? R.secrets() : R.prefs(), Object.assign({}, blob, { rev }));
    st[g] = { hash: lh, rev };
  }
  writeSync(st);
}

// ---------- history sync ----------
function tabHasContent(t) {
  if (t.slideDeck && t.slideDeck.slides && t.slideDeck.slides.length) return true;
  if (t.chatHistory && t.chatHistory.length) return true;
  const h = String(t.htmlContent || '');
  if (!h || h.includes('Start typing here')) return false;
  return h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length > 30 || /<(svg|img|table)/i.test(h);
}
function tabPayload(t) {
  const files = {};
  Object.entries(t.attachedFiles || {}).forEach(([id, f]) => { if (f) files[id] = { name: f.name, content: String(f.content || '').slice(0, 60000), status: f.status, order: f.order, sent: !!f.sent }; });
  return { name: t.name || 'Untitled', htmlContent: t.htmlContent || '', chatHistory: t.chatHistory || [], attachedFiles: files, projectVersion: t.projectVersion || 0,
    theme: t.theme, pdfVisualFormat: t.pdfVisualFormat, pdfTextFormat: t.pdfTextFormat, pdfLanguageFormat: t.pdfLanguageFormat, photocopyMode: !!t.photocopyMode, slideDeck: t.slideDeck || null };
}
const newId = () => 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
async function loadIndex() {
  const d = await getData(R.index());
  return d ? (await V.open(G.session, 'index', G.uid, 'index', d)).entries || [] : [];
}
async function saveIndex(entries) {
  entries.sort((a, b) => b.updatedAt - a.updatedAt); entries = entries.slice(0, MAX_INDEX);
  await G.fb.fs.setDoc(R.index(), Object.assign(await V.seal(G.session, 'index', G.uid, 'index', { entries }), { rev: Date.now() }));
  G.index = entries;
}
async function writeEntry(id, payload) {
  const blob = await V.seal(G.session, 'history', G.uid, id, payload), chunks = V.chunkString(blob.ct);
  if (blob.ct.length > MAX_UPLOAD_CHARS) throw new Error('too-large');
  const fs = G.fb.fs, old = await getData(R.hist(id)), oldN = old ? old.n : 0, batch = fs.writeBatch(G.db);
  batch.set(R.hist(id), { v: 1, z: blob.z, iv: blob.iv, n: chunks.length, rev: Date.now() });
  chunks.forEach((c, i) => batch.set(R.d('hist', id + '_c' + i), { d: c }));
  for (let i = chunks.length; i < oldN; i++) batch.delete(R.d('hist', id + '_c' + i));
  await batch.commit();
  return blob.ct.length;
}
async function readEntry(id) {
  const head = await getData(R.hist(id)); if (!head) throw new Error('missing');
  const parts = await Promise.all(Array.from({ length: head.n }, (_, i) => getData(R.d('hist', id + '_c' + i))));
  return V.open(G.session, 'history', G.uid, id, { v: 1, z: head.z, iv: head.iv, ct: parts.map(p => p.d).join('') });
}
async function pushHistory() {
  const tm = window.TAB_MANAGER; if (!tm || !Array.isArray(tm.tabs)) return;
  try { if (tm.activeId) tm._captureCurrentState(tm.activeId); } catch (_) {}
  const changed = [];
  for (const t of tm.tabs) {
    if (!tabHasContent(t)) continue;
    t.__cid = t.__cid || newId();
    const p = tabPayload(t), h = V.hash(JSON.stringify(p));
    if (G.hashes[t.__cid] !== h) changed.push({ id: t.__cid, p, h });
  }
  if (!changed.length) return;
  const fresh = await loadIndex(), byId = new Map(fresh.map(e => [e.id, e]));
  for (const c of changed) {
    const size = await writeEntry(c.id, c.p);
    byId.set(c.id, { id: c.id, title: String(c.p.name).slice(0, 80), kind: c.p.slideDeck ? 'slides' : 'doc', updatedAt: Date.now(), chats: c.p.chatHistory.length, kb: Math.round(size * 0.75 / 1024) });
    G.hashes[c.id] = c.h;
  }
  await saveIndex([...byId.values()]);
}

// ---------- backup engine ----------
function setStatus(s, err) { G.status = s; G.err = err || ''; const b = $('#pata-account-btn'); if (b) b.className = 'topbar-btn ' + ({ ok: 'ok', busy: 'busy', err: 'err' }[s] || ''); renderPop(); }
async function runBackup(manual) {
  if (!G.session || G.running) return;
  if (!navigator.onLine) { setStatus('err', 'Offline — will retry when back online'); return; }
  G.running = true; setStatus('busy');
  try {
    await pushSettingsIfChanged(); await pushHistory();
    G.lastAt = Date.now(); setStatus('ok'); if (manual) toast('☁️ Backed up (encrypted)');
  } catch (e) {
    console.warn('[cloud] backup failed', e);
    if (e.message === 'decrypt-failed') { await V.clearCache(); G.session = null; setStatus('err', 'Vault locked — sign in again'); }
    else setStatus('err', e.message === 'too-large' ? 'A document is too large to back up' : 'Backup failed — will retry');
    if (manual) toast('⚠️ Backup failed');
  } finally { G.running = false; }
}
function schedule(ms) { if (!G.session || G.timer) return; G.timer = setTimeout(() => { G.timer = null; runBackup(false); }, ms || 8000); }
function startEngine() {
  if (G.engineOn || !G.session) return; G.engineOn = true;
  const tm = window.TAB_MANAGER;
  if (tm && !tm._pataWrapped) { const orig = tm._persist; tm._persist = function () { const r = orig.apply(this, arguments); schedule(); return r; }; tm._pataWrapped = true; }
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k) { const r = setItem.apply(this, arguments); if (SYNC_KEYS.includes(k)) schedule(4000); return r; };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(G.timer); G.timer = null; runBackup(false); } });
  window.addEventListener('online', () => runBackup(false));
  setInterval(() => runBackup(false), 60000);
  runBackup(false);
}

// ---------- account menu, history modal, sign-out ----------
function ago(t) { if (!t) return 'never'; const s = Math.round((Date.now() - t) / 1000); return s < 10 ? 'just now' : s < 60 ? s + 's ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : new Date(t).toLocaleString(); }
function statusText() {
  if (!G.session) return 'Backup is OFF on this device';
  if (G.status === 'busy') return 'Backing up…';
  if (G.status === 'err') return G.err || 'Backup problem';
  return 'Encrypted backup • ' + ago(G.lastAt);
}
function mountAccountButton() {
  const host = $('#topbar-actions'); if (!host || $('#pata-account-btn')) return;
  const u = G.user, b = document.createElement('button');
  b.className = 'topbar-btn'; b.id = 'pata-account-btn'; b.type = 'button'; b.title = u.email || 'Account';
  b.innerHTML = `<img class="pa-av" referrerpolicy="no-referrer" alt="" src="${esc(u.photoURL || '')}"><span class="pa-name">${esc((u.displayName || u.email || 'Account').split(' ')[0])}</span><span class="pa-dot"></span>`;
  b.onclick = e => { e.stopPropagation(); const p = $('#pata-pop'); p.classList.toggle('show'); renderPop(); };
  host.insertBefore(b, host.firstChild);
  const pop = document.createElement('div'); pop.id = 'pata-pop'; document.body.appendChild(pop);
  document.addEventListener('click', e => { if (!e.target.closest('#pata-pop') && !e.target.closest('#pata-account-btn')) pop.classList.remove('show'); });
}
function renderPop() {
  const pop = $('#pata-pop'); if (!pop || !G.user) return;
  pop.innerHTML = `<div class="pp-mail">${esc(G.user.email || '')}</div><div class="pp-stat">${esc(statusText())}</div>
    ${G.session ? '<button id="pp-now">☁️ Back up now</button><button id="pp-hist">🕘 Cloud history</button>' : '<button id="pp-enable">🔐 Turn on encrypted backup</button>'}
    <button id="pp-out" class="danger">Sign out</button>`;
  const on = (id, fn) => { const el = $(id, pop); if (el) el.onclick = () => { pop.classList.remove('show'); fn(); }; };
  on('#pp-now', () => runBackup(true)); on('#pp-hist', openHistory); on('#pp-out', signOutFlow);
  on('#pp-enable', async () => { if (await ensureVault()) { closeGate(); await reconcileSettings(); startEngine(); runBackup(true); } else closeGate(); });
}
function openModal(title, html, o) {
  let m = $('#pata-modal'); if (!m) { m = document.createElement('div'); m.id = 'pata-modal'; document.body.appendChild(m); }
  m.innerHTML = `<div class="pm-card"><div class="pm-head"><h3>${esc(title)}</h3>${o && o.locked ? '' : '<button class="pm-x" aria-label="Close">×</button>'}</div><div class="pm-body">${html}</div></div>`;
  m.classList.add('show'); const x = $('.pm-x', m); if (x) x.onclick = closeModal;
  return { root: m, body: $('.pm-body', m) };
}
function closeModal() { const m = $('#pata-modal'); if (m) m.classList.remove('show'); }
async function openHistory() {
  const m = openModal('Cloud history', '<div class="pm-empty">Loading…</div>');
  try {
    const entries = await loadIndex(); G.index = entries;
    if (!entries.length) { m.body.innerHTML = '<div class="pm-empty">No backed-up documents yet. They appear here automatically after you create something.</div>'; return; }
    m.body.innerHTML = entries.map(e => `<div class="pm-row" data-id="${esc(e.id)}"><span>${e.kind === 'slides' ? '🖼️' : '📄'}</span>
      <div class="pm-t"><b>${esc(e.title)}</b><small>${esc(new Date(e.updatedAt).toLocaleString())} · ${e.chats || 0} msgs · ${e.kb || 0} KB</small></div>
      <button class="pm-b" data-open>Open</button><button class="pm-b ghost danger" data-del title="Delete">🗑</button></div>`).join('');
    m.body.querySelectorAll('.pm-row').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('[data-open]').onclick = async ev => { ev.target.textContent = '…'; try { await openEntry(id); closeModal(); } catch (e) { toast('⚠️ Could not open (' + e.message + ')'); ev.target.textContent = 'Open'; } };
      row.querySelector('[data-del]').onclick = async () => { if (!confirm('Delete this backup from the cloud? This cannot be undone.')) return; try { await deleteEntry(id); row.remove(); } catch (e) { toast('⚠️ Delete failed'); } };
    });
  } catch (e) { m.body.innerHTML = `<div class="pm-empty">Couldn't load history (${esc(e.message)}).</div>`; }
}
async function openEntry(id) {
  const p = await readEntry(id), tm = window.TAB_MANAGER;
  const tab = tm.createTab(p.name, p.htmlContent, { chatHistory: p.chatHistory || [], attachedFiles: p.attachedFiles || {}, undoStack: [], redoStack: [],
    projectVersion: p.projectVersion || 0, theme: p.theme, photocopyMode: !!p.photocopyMode, slideDeck: p.slideDeck || null }, true);
  ['pdfVisualFormat', 'pdfTextFormat', 'pdfLanguageFormat'].forEach(k => { if (p[k]) tab[k] = p[k]; });
  tab.__cid = id;                       // further edits update THIS cloud entry instead of creating a duplicate
  tm.switchTo(tab.id);
}
async function deleteEntry(id) {
  const head = await getData(R.hist(id)), batch = G.fb.fs.writeBatch(G.db);
  if (head) for (let i = 0; i < head.n; i++) batch.delete(R.d('hist', id + '_c' + i));
  batch.delete(R.hist(id)); await batch.commit();
  await saveIndex((await loadIndex()).filter(e => e.id !== id)); delete G.hashes[id];
  (window.TAB_MANAGER.tabs || []).forEach(t => { if (t.__cid === id) delete t.__cid; });
}
async function signOutFlow() {
  const backedUp = !G.session || await (async () => { await Promise.race([runBackup(false), new Promise(r => setTimeout(r, 10000))]); return G.status === 'ok' || !G.session; })();
  const pick = await askChoice('Sign out?', (backedUp ? '' : '⚠️ Your latest changes could NOT be backed up. ') +
    'Signing out removes API keys, history and settings from THIS device. Your encrypted cloud backup stays safe.',
    [{ label: 'Sign out', value: true, cls: 'danger' }, { label: 'Cancel', value: false, cls: 'ghost' }]);
  if (!pick) return;
  WIPE_KEYS.forEach(lsDel); await V.clearCache();
  try { await G.fb.auth.signOut(G.auth); } catch (_) {}
  location.reload();
}

// ---------- boot ----------
async function afterLogin(user) {
  G.user = user; G.uid = user.uid;
  wait('Setting things up…');
  const owner = lsGet('pata_local_owner');
  if (owner && owner !== user.uid) {                 // data on this device belongs to another account → never mix
    WIPE_KEYS.forEach(lsDel); lsSet('pata_local_owner', user.uid); location.reload(); return;
  }
  lsSet('pata_local_owner', user.uid);
  try {
    const unlocked = await ensureVault();
    if (unlocked) {
      wait('Restoring your backup…');
      if (await reconcileSettings()) { wait('Applying restored settings…'); location.reload(); return; }
    }
  } catch (e) {
    console.warn('[cloud] post-login error', e);
    if (e.message === 'decrypt-failed') { await V.clearCache(); G.session = null; if (await promptUnlock('Your saved unlock key is out of date. Enter your passphrase.')) { location.reload(); return; } }
    else toast('⚠️ Cloud sync problem: ' + (e.code || e.message));
  }
  closeGate(); mountAccountButton(); setStatus(G.session ? 'ok' : 'off'); startEngine();
}
async function boot() {
  if (!gate) return;
  if (!configured) return showUnconfigured();
  if (!V || !window.crypto || !window.crypto.subtle) return showError('This browser does not support secure encryption (needs HTTPS).', () => location.reload());
  wait('Checking your session…');
  try { await loadFirebase(); } catch (e) { return showError('Could not load Firebase. Check your internet connection.', boot); }
  G.fb.auth.getRedirectResult(G.auth).catch(e => showLogin('Sign-in failed (' + (e.code || e.message) + ').'));
  G.fb.auth.onAuthStateChanged(G.auth, user => { if (user) afterLogin(user); else { G.session = null; showLogin(); } });
}
boot();
