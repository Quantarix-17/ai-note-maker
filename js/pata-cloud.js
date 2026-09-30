// Pata AI — Google Sign in / Sign up + end-to-end-encrypted cloud backup + session history.
// ES module, loaded AFTER the classic app scripts. Needs js/firebase-config.js and js/pata-vault.js.
//
// Model: ONE working session at a time (no tabs). Starting a new session or opening one from History
// archives the outgoing session to the encrypted cloud history first (see TAB_MANAGER.createTab).
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
const WIPE_KEYS = SYNC_KEYS.concat(['aiDocTabs_v1', 'aiDocProState_v22', 'aiModelDailyResetDate_v1', 'studio_theme', 'pata_sync_state', 'pata_local_owner']);
const MODEL_FIELDS = ['id', 'name', 'apiUrl', 'apiKey', 'modelId', 'supportsJson', 'supportsVision', 'enableGoogleSearch', 'apiType'];
const MAX_INDEX = 300, MAX_UPLOAD_CHARS = 8000000;

// ---------- state / helpers ----------
const G = { fb: null, auth: null, db: null, user: null, uid: null, started: false, verifying: false, session: null, meta: null,
  index: null, hashes: {}, timer: null, running: false, status: 'off', lastAt: 0, err: '', engineOn: false };
const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
const lsDel = k => { try { localStorage.removeItem(k); } catch (_) {} };
const toast = m => { try { (window.displayToastNotification || console.log)(m); } catch (_) {} };
const readSync = () => { try { return JSON.parse(lsGet('pata_sync_state') || '{}'); } catch (_) { return {}; } };
const writeSync = o => lsSet('pata_sync_state', JSON.stringify(o));
// Every cloud call gets a timeout, so a bad network / missing database can never hang the UI forever.
const T = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms || 15000))]);
function explain(e) {
  const c = String((e && e.code) || '').replace(/^(firestore|auth)\//, ''), m = String((e && e.message) || e || '');
  if (c === 'permission-denied') return 'Firestore permission denied. Firebase Console → Firestore Database → Rules → paste firestore.rules and Publish.';
  if (c === 'not-found' || /does not exist/i.test(m)) return 'The Firestore database is not created yet. Firebase Console → Firestore Database → Create database.';
  if (c === 'unavailable' || c === 'timeout' || /offline|didn't respond|timeout/i.test(m)) return 'Cannot reach the cloud database. Check your internet — and make sure a Firestore database exists (Firebase Console → Firestore Database → Create database) and the rules are published.';
  if (c === 'network-request-failed') return 'Network error. Check your internet connection.';
  return 'Cloud error: ' + (c || m);
}

// ---------- CSS: modal + history drawer (gate CSS is inline in index.html) ----------
(function injectCss() {
  const st = document.createElement('style');
  st.textContent = `
#pata-modal{position:fixed;inset:0;z-index:2147481500;display:none;align-items:center;justify-content:center;padding:14px;background:rgba(15,23,42,.55);backdrop-filter:blur(6px)}
#pata-modal.show{display:flex}
#pata-modal .pm-card{width:100%;max-width:460px;max-height:86vh;display:flex;flex-direction:column;background:#fff;color:#0f172a;border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.35);overflow:hidden}
html.dark #pata-modal .pm-card{background:#111827;color:#f1f5f9}
#pata-modal .pm-head{display:flex;align-items:center;gap:8px;padding:16px 18px;border-bottom:1px solid rgba(148,163,184,.25)}
#pata-modal .pm-head h3{margin:0;font-size:17px;flex:1}
#pata-modal .pm-x{border:0;background:transparent;color:inherit;font-size:22px;cursor:pointer;line-height:1}
#pata-modal .pm-body{padding:14px 18px 18px;overflow:auto;font-size:14px;line-height:1.6}
#pata-modal .pm-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}
#pata-modal .pm-b,#pata-drawer .pd-b{border:0;border-radius:11px;padding:9px 13px;font:600 13.5px Inter,Arial,sans-serif;cursor:pointer;background:rgba(148,163,184,.2);color:inherit}
#pata-modal .pm-b.pri,#pata-drawer .pd-b.pri{background:#4f7df3;color:#fff}
#pata-modal .pm-b.danger,#pata-drawer .pd-b.danger{background:rgba(239,68,68,.14);color:#ef4444}
#pata-drawer{position:fixed;inset:0;z-index:2147481200;display:none}
#pata-drawer.show{display:block}
#pata-drawer .pd-scrim{position:absolute;inset:0;background:rgba(15,23,42,.45);animation:pdfade .2s}
#pata-drawer .pd-panel{position:absolute;left:0;top:0;bottom:0;width:min(380px,92vw);display:flex;flex-direction:column;gap:10px;background:#fff;color:#0f172a;
 box-shadow:8px 0 40px rgba(0,0,0,.3);padding:calc(14px + env(safe-area-inset-top,0px)) 14px calc(14px + env(safe-area-inset-bottom,0px));animation:pdslide .22s ease;font-family:Inter,"Hind Siliguri",Arial,sans-serif}
html.dark #pata-drawer .pd-panel{background:#111827;color:#f1f5f9}
#pata-drawer .pd-head{display:flex;align-items:center;gap:10px}
#pata-drawer .pd-av{width:42px;height:42px;border-radius:50%;overflow:hidden;background:#4f7df3;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}
#pata-drawer .pd-av img{width:100%;height:100%;object-fit:cover}
#pata-drawer .pd-who{flex:1;min-width:0}#pata-drawer .pd-who b,#pata-drawer .pd-who small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#pata-drawer .pd-who small{opacity:.65;font-size:12.5px}
#pata-drawer .pd-x{border:0;background:transparent;color:inherit;font-size:24px;cursor:pointer;line-height:1}
#pata-drawer .pd-stat{font-size:12.5px;opacity:.8}
#pata-drawer .pd-btns{display:flex;gap:8px}#pata-drawer .pd-btns .pd-b{flex:1}
#pata-drawer .pd-search{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:11px;border:1px solid rgba(148,163,184,.4);background:transparent;color:inherit;font:500 14px Inter,Arial,sans-serif}
#pata-drawer .pd-list{flex:1;overflow:auto;margin:0 -4px;padding:0 4px}
#pata-drawer .pd-day{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.55;margin:12px 4px 4px}
#pata-drawer .pd-row{display:flex;align-items:center;gap:8px;padding:9px 8px;border-radius:12px;cursor:pointer}
#pata-drawer .pd-row:hover{background:rgba(79,125,243,.1)}#pata-drawer .pd-row.cur{background:rgba(79,125,243,.16)}
#pata-drawer .pd-t{flex:1;min-width:0}#pata-drawer .pd-t b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
#pata-drawer .pd-t small{opacity:.6;font-size:12px}
#pata-drawer .pd-del{border:0;background:transparent;color:inherit;opacity:.45;cursor:pointer;font-size:15px;padding:6px}#pata-drawer .pd-del:hover{opacity:1;color:#ef4444}
#pata-drawer .pd-empty{padding:26px 10px;text-align:center;opacity:.65;font-size:13.5px;line-height:1.6}
@keyframes pdslide{from{transform:translateX(-100%)}to{transform:none}}@keyframes pdfade{from{opacity:0}to{opacity:1}}`;
  document.head.appendChild(st);
})();

// ---------- gate UI ----------
const gate = $('#pata-gate'), gbody = $('#pg-body');
const APP_IDS = ['topbar', 'mobile-nav-bar', 'main-container'];
let waitTimer = null;
function inertApp(on) { APP_IDS.forEach(id => { const el = document.getElementById(id); if (el) on ? el.setAttribute('inert', '') : el.removeAttribute('inert'); }); }
function view(html) { if (!gate) return; clearTimeout(waitTimer); gbody.innerHTML = html; gate.hidden = false; gate.classList.add('pg-on'); inertApp(true); }
function closeGate() { if (!gate) return; clearTimeout(waitTimer); gate.classList.remove('pg-on'); gate.hidden = true; inertApp(false); }
function wait(msg, escape) {
  view(`<div class="pg-spin"></div><p class="pg-muted">${esc(msg)}</p>`);
  if (escape) waitTimer = setTimeout(() => {
    if (!gbody.querySelector('.pg-spin')) return;
    const b = document.createElement('button'); b.className = 'pg-link'; b.textContent = escape.label; b.onclick = escape.fn; gbody.appendChild(b);
  }, 12000);
}
const setErr = m => { const e = $('#pg-err'); if (e) e.textContent = m || ''; };
const GOOGLE_SVG = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.7-9.9 6.7-17.4z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.9 2.3-8.6 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

// Separate Sign in / Sign up (both use Google; "Sign in" refuses to silently create an account).
function showAuth(mode, err) {
  mode = mode === 'signup' ? 'signup' : 'signin';
  const webview = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)/i.test(navigator.userAgent);
  view(`<div class="pg-tabs" role="tablist"><button role="tab" data-m="signin" class="${mode === 'signin' ? 'on' : ''}">Sign in</button><button role="tab" data-m="signup" class="${mode === 'signup' ? 'on' : ''}">Sign up</button></div>
    ${mode === 'signin'
      ? '<h2>Welcome back</h2><p class="pg-muted">Sign in with the Google account you used before to open your sessions and restore your encrypted backup.</p>'
      : '<h2>Create your account</h2><p class="pg-muted">Sign up with your Google account — no password to remember.</p><ul class="pg-list"><li>End-to-end encrypted backup of your API keys</li><li>Every session saved in your History</li><li>Restore on any device</li></ul>'}
    ${webview ? '<p class="pg-warn">Google blocks sign-in inside in-app browsers. Please open this page in Chrome or Safari.</p>' : ''}
    <button class="pg-btn pg-google" id="pg-go">${GOOGLE_SVG}<span>${mode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}</span></button>
    <div id="pg-err" class="pg-err" role="alert">${esc(err || '')}</div>
    <button class="pg-link" data-m="${mode === 'signin' ? 'signup' : 'signin'}">${mode === 'signin' ? "New here? Create an account" : 'Already have an account? Sign in'}</button>`);
  gbody.querySelectorAll('[data-m]').forEach(b => { b.onclick = () => showAuth(b.dataset.m); });
  $('#pg-go').onclick = () => signIn(mode);
}
function showUnconfigured() {
  view(`<h2>Setup needed</h2><p class="pg-muted">Firebase isn't configured yet. Paste your Firebase web config into <code>js/firebase-config.js</code>, then reload.</p>
    ${isLocalHost ? '<button class="pg-btn" id="pg-dev">Continue in setup mode (no login)</button>' : ''}`);
  const d = $('#pg-dev'); if (d) d.onclick = closeGate;
}
function showError(title, msg, retry, skip) {
  view(`<h2>${esc(title)}</h2><p class="pg-muted">${esc(msg)}</p><button class="pg-btn" id="pg-retry">Try again</button>${skip ? '<button class="pg-link" id="pg-skip">Continue without backup</button>' : ''}`);
  $('#pg-retry').onclick = retry; const s = $('#pg-skip'); if (s) s.onclick = skip;
}

// ---------- Firebase loading + auth ----------
async function loadFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${SDK_VER}/`;
  const [app, auth, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  const fbApp = app.initializeApp(CFG);
  G.fb = { app, auth, fs };
  G.auth = auth.getAuth(fbApp);
  // Auto-detect long-polling: makes Firestore work on networks/ISPs that break WebChannel streaming.
  try { G.db = fs.initializeFirestore(fbApp, { experimentalAutoDetectLongPolling: true }); } catch (_) { G.db = fs.getFirestore(fbApp); }
}
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
async function signIn(mode) {
  const { auth } = G.fb;
  const provider = new auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  G.verifying = true;                                       // ignore auth-state events until we've checked sign-in vs sign-up
  try { sessionStorage.setItem('pata_auth_intent', mode); } catch (_) {}
  wait('Waiting for Google sign-in…', { label: 'Taking too long? Go back', fn: () => { G.verifying = false; showAuth(mode); } });
  let result;
  try {
    if (isStandalone() && /android|iphone|ipad|ipod/i.test(navigator.userAgent)) { await auth.signInWithRedirect(G.auth, provider); return; }
    result = await auth.signInWithPopup(G.auth, provider);
  } catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e && e.code)) {
      try { await auth.signInWithRedirect(G.auth, provider); return; } catch (e2) { e = e2; }
    }
    G.verifying = false;
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e && e.code)) return showAuth(mode);
    const map = { 'auth/unauthorized-domain': 'This domain is not in Firebase → Authentication → Settings → Authorized domains.',
      'auth/network-request-failed': 'Network error. Check your internet connection.',
      'auth/operation-not-allowed': 'Enable the Google provider in Firebase → Authentication → Sign-in method.' };
    return showAuth(mode, map[e && e.code] || ('Sign-in failed (' + ((e && e.code) || (e && e.message)) + ').'));
  }
  await finishAuth(result, mode);
}
async function finishAuth(result, mode) {
  const { auth } = G.fb, user = result.user, info = auth.getAdditionalUserInfo(result), isNew = !!(info && info.isNewUser);
  try { sessionStorage.removeItem('pata_auth_intent'); } catch (_) {}
  if (mode === 'signin' && isNew) {                          // Google just created an account the person never signed up for → undo it
    const mail = user.email || 'this Google account';
    try { await auth.deleteUser(user); } catch (_) { try { await auth.signOut(G.auth); } catch (__) {} }
    G.verifying = false;
    return showAuth('signup', `No Pata AI account found for ${mail}. Create one with Sign up.`);
  }
  if (mode === 'signup' && !isNew) wait('You already have an account — signing you in…');
  G.verifying = false;
  afterLogin(user);
}

// ---------- firestore refs ----------
const R = {
  d: (...p) => G.fb.fs.doc(G.db, 'users', G.uid, ...p),
  meta: () => R.d('vault', 'meta'), secrets: () => R.d('sync', 'secrets'), prefs: () => R.d('sync', 'prefs'), index: () => R.d('sync', 'index'),
  hist: id => R.d('hist', id)
};
async function getData(ref) { const s = await T(G.fb.fs.getDoc(ref), 15000); return s.exists() ? s.data() : null; }
const setData = (ref, data) => T(G.fb.fs.setDoc(ref, data), 15000);

// ---------- vault UI flows ----------
function promptCreateVault() {
  return new Promise(resolve => {
    view(`<h2>Protect your backup</h2>
      <p class="pg-muted">Choose a passphrase. Your API keys and history are encrypted <b>on this device</b> before upload, so nobody — not us, not Google — can read them. We can't reset this passphrase for you.</p>
      <input class="pg-in" id="pg-p1" type="password" autocomplete="new-password" placeholder="Passphrase (10+ characters)">
      <input class="pg-in" id="pg-p2" type="password" autocomplete="new-password" placeholder="Repeat passphrase">
      <div id="pg-err" class="pg-err" role="alert"></div>
      <button class="pg-btn" id="pg-go">Create encrypted backup</button>
      <button class="pg-link" id="pg-skip">Skip for now (no backup, no history)</button>`);
    $('#pg-skip').onclick = () => resolve(false);
    $('#pg-go').onclick = async () => {
      const p1 = $('#pg-p1').value, p2 = $('#pg-p2').value, issue = V.passphraseIssue(p1);
      if (issue) return setErr(issue);
      if (p1 !== p2) return setErr("Passphrases don't match.");
      wait('Creating your encrypted vault…');
      try {
        const r = await V.createVault(G.uid, p1);
        await setData(R.meta(), r.meta);
        G.meta = r.meta; G.session = r.session; await V.cacheSession(G.uid, r.session);
        await showRecoveryKey(r.recoveryKey);
        resolve(true);
      } catch (e) { console.warn('[cloud] vault create failed', e); showError("Couldn't create the vault", explain(e), () => resolve(promptCreateVault()), () => resolve(false)); }
    };
  });
}
function showRecoveryKey(key) {
  return new Promise(resolve => {
    view(`<h2>Save your recovery key</h2>
      <p class="pg-muted">If you forget your passphrase, this key is the <b>only</b> way to get your backup back. Store it somewhere safe (password manager, paper).</p>
      <div class="pg-key">${esc(key)}</div>
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
      try { const r = await V.unlockWithPassphrase(G.uid, G.meta, $('#pg-p1').value); G.session = r.session; await V.cacheSession(G.uid, r.session); resolve(true); }
      catch (e) { btn.disabled = false; btn.textContent = 'Unlock'; setErr(e.message === 'wrong-passphrase' ? 'Wrong passphrase. Try again.' : 'Unlock failed: ' + e.message); }
    };
    $('#pg-go').onclick = go; $('#pg-p1').onkeydown = e => { if (e.key === 'Enter') go(); };
    setTimeout(() => { const i = $('#pg-p1'); if (i) i.focus(); }, 50);
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
        await setData(R.meta(), meta2);
        G.meta = meta2; G.session = r.session; await V.cacheSession(G.uid, r.session); resolve(true);
      } catch (e) { setErr(/recovery/.test(e.message) ? "That recovery key doesn't match." : explain(e)); }
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
  } else PREF_KEYS.forEach(k => (values[k] != null ? lsSet(k, values[k]) : lsDel(k)));
}
function askChoice(title, text, choices) {
  return new Promise(resolve => {
    const m = openModal(title, `<p style="margin:0 0 6px">${esc(text)}</p><div class="pm-actions">${choices.map((c, i) => `<button class="pm-b ${c.cls || ''}" data-i="${i}">${esc(c.label)}</button>`).join('')}</div>`, { locked: true });
    m.body.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => { closeModal(); resolve(choices[+b.dataset.i].value); }; });
  });
}
async function reconcileSettings() {
  const st = readSync(); let reload = false;
  for (const g of ['secrets', 'prefs']) {
    const ref = g === 'secrets' ? R.secrets() : R.prefs(), cloud = await getData(ref);
    const local = collectGroup(g), lh = V.hash(JSON.stringify(local)), s = st[g] || {};
    const upload = async () => {
      const blob = await V.seal(G.session, g, G.uid, g, { values: local }), rev = Date.now();
      await setData(ref, Object.assign({}, blob, { rev })); st[g] = { hash: lh, rev };
    };
    const download = async () => {
      const obj = await V.open(G.session, g, G.uid, g, cloud);
      applyGroup(g, obj.values || {}); st[g] = { hash: V.hash(JSON.stringify(collectGroup(g))), rev: cloud.rev }; reload = true;
    };
    if (!cloud) { if (!groupIsEmpty(g, local)) await upload(); continue; }
    if (cloud.rev === s.rev) { if (lh !== s.hash && !groupIsEmpty(g, local)) await upload(); continue; }
    const untouched = s.hash !== undefined && lh === s.hash;
    if (groupIsEmpty(g, local) || untouched || g === 'prefs') await download();
    else {
      const pick = await askChoice(g === 'secrets' ? 'API keys differ' : 'Settings differ', 'This device and your cloud backup have different data. Which one should win?',
        [{ label: 'Use cloud backup', value: 'cloud', cls: 'pri' }, { label: 'Keep this device', value: 'local' }]);
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

// ---------- session history ----------
function tabHasContent(t) {
  if (t.slideDeck && t.slideDeck.slides && t.slideDeck.slides.length > 0 && (t.slideDeck.slides.length > 1 || (t.slideDeck.slides[0].bullets || []).length)) return true;
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
function sessionTitle(p) {
  const n = String(p.name || '').trim();
  if (n && !/^(untitled|blank|loaded|untitled deck)$/i.test(n)) return n.slice(0, 80);
  const m = (p.chatHistory || []).find(x => x && x.role === 'user');
  const t = m && (typeof m.content === 'string' ? m.content : (m.text || m.message || ''));
  return t ? String(t).replace(/\s+/g, ' ').trim().slice(0, 70) : (n || 'Untitled');
}
const newId = () => 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
let chain = Promise.resolve();                     // serialise cloud writes so the index never races itself
const serial = fn => { const run = chain.then(() => fn()); chain = run.catch(() => {}); return run; };
async function loadIndex() { const d = await getData(R.index()); return d ? (await V.open(G.session, 'index', G.uid, 'index', d)).entries || [] : []; }
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
function pushHistory(tabs) {
  return serial(async () => {
    const changed = [];
    for (const t of tabs || []) {
      if (!tabHasContent(t)) continue;
      t.__cid = t.__cid || newId();
      const p = tabPayload(t), h = V.hash(JSON.stringify(p));
      if (G.hashes[t.__cid] !== h) changed.push({ id: t.__cid, p, h });
    }
    if (!changed.length) return;
    const byId = new Map((await loadIndex()).map(e => [e.id, e]));
    for (const c of changed) {
      const size = await writeEntry(c.id, c.p);
      byId.set(c.id, { id: c.id, title: sessionTitle(c.p), kind: c.p.slideDeck ? 'slides' : 'doc', updatedAt: Date.now(), chats: c.p.chatHistory.length, kb: Math.round(size * 0.75 / 1024) });
      G.hashes[c.id] = c.h;
    }
    await saveIndex([...byId.values()]);
  });
}
// Called by TAB_MANAGER.createTab() just before the current session is replaced.
window.__pataArchiveTabs = tabs => { if (G.session) T(pushHistory(tabs), 120000).catch(e => console.warn('[cloud] archive failed', e)); };

// ---------- backup engine ----------
function setStatus(s, err) {
  G.status = s; G.err = err || '';
  const b = $('#pata-avatar-btn'); if (b) b.className = 'logo-img ' + ({ ok: 'ok', busy: 'busy', err: 'err' }[s] || '');
  window.__pataBackupOn = !!G.session; renderDrawerHead();
}
function liveTabs() {
  const tm = window.TAB_MANAGER; if (!tm || !Array.isArray(tm.tabs)) return [];
  try { if (tm.activeId) tm._captureCurrentState(tm.activeId); } catch (_) {}
  return tm.tabs;
}
async function runBackup(manual) {
  if (!G.session) return;
  if (G.running) { if (manual) toast('⏳ Backup already running…'); return; }
  if (!navigator.onLine) { setStatus('err', 'Offline — will retry when back online'); return; }
  G.running = true; setStatus('busy');
  try {
    await T(pushSettingsIfChanged(), 30000);
    await T(pushHistory(liveTabs()), 90000);
    G.lastAt = Date.now(); setStatus('ok'); if (manual) toast('☁️ Backed up (encrypted)');
  } catch (e) {
    console.warn('[cloud] backup failed', e);
    if (e.message === 'decrypt-failed') { await V.clearCache(); G.session = null; setStatus('err', 'Vault locked — turn on backup again'); }
    else setStatus('err', e.message === 'too-large' ? 'A session is too large to back up' : explain(e));
    if (manual) toast('⚠️ Backup failed — ' + (G.err || ''));
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
}

// ---------- modal + avatar + history drawer ----------
function openModal(title, html, o) {
  let m = $('#pata-modal'); if (!m) { m = document.createElement('div'); m.id = 'pata-modal'; document.body.appendChild(m); }
  m.innerHTML = `<div class="pm-card"><div class="pm-head"><h3>${esc(title)}</h3>${o && o.locked ? '' : '<button class="pm-x" aria-label="Close">×</button>'}</div><div class="pm-body">${html}</div></div>`;
  m.classList.add('show'); const x = $('.pm-x', m); if (x) x.onclick = closeModal;
  return { root: m, body: $('.pm-body', m) };
}
function closeModal() { const m = $('#pata-modal'); if (m) m.classList.remove('show'); }
function faceHtml(u) {
  if (u && u.photoURL) return `<img referrerpolicy="no-referrer" alt="" src="${esc(u.photoURL)}">`;   // no-referrer: Google can't see which site loaded it
  const ch = ((u && (u.displayName || u.email)) || '?').trim().charAt(0).toUpperCase();
  return esc(ch);
}
function mountAvatar() {
  const f = $('#pata-avatar-btn .pa-face'); if (f && G.user) f.innerHTML = faceHtml(G.user);
  const b = $('#pata-avatar-btn'); if (b && G.user) b.title = (G.user.email || 'Account') + ' — History';
}
function ago(t) { if (!t) return 'never'; const s = Math.round((Date.now() - t) / 1000); return s < 10 ? 'just now' : s < 60 ? s + 's ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : new Date(t).toLocaleString(); }
function statusText() {
  if (!G.user) return 'Setup mode — not signed in';
  if (!G.session) return 'Backup is OFF — history is not being saved';
  if (G.status === 'busy') return 'Backing up…';
  if (G.status === 'err') return '⚠️ ' + (G.err || 'Backup problem');
  return '🔒 Encrypted backup • ' + ago(G.lastAt);
}
function ensureDrawer() {
  let d = $('#pata-drawer'); if (d) return d;
  d = document.createElement('div'); d.id = 'pata-drawer';
  d.innerHTML = `<div class="pd-scrim"></div><aside class="pd-panel" role="dialog" aria-label="Account and history">
    <div class="pd-head"><div class="pd-av" id="pd-av"></div><div class="pd-who"><b id="pd-name"></b><small id="pd-mail"></small></div><button class="pd-x" aria-label="Close">×</button></div>
    <div class="pd-stat" id="pd-stat"></div>
    <div class="pd-btns"><button class="pd-b pri" id="pd-new">＋ New session</button><button class="pd-b" id="pd-backup"></button></div>
    <input class="pd-search" id="pd-search" type="search" placeholder="Search history…">
    <div class="pd-list" id="pd-list"></div>
    <button class="pd-b danger" id="pd-out">Sign out</button></aside>`;
  document.body.appendChild(d);
  $('.pd-scrim', d).onclick = $('.pd-x', d).onclick = closeDrawer;
  $('#pd-new', d).onclick = () => { closeDrawer(); if (typeof window.startNewProject === 'function') window.startNewProject(); };
  $('#pd-backup', d).onclick = () => { if (G.session) runBackup(true); else { closeDrawer(); setupBackupFlow(); } };
  $('#pd-out', d).onclick = signOutFlow;
  $('#pd-search', d).oninput = renderList;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  return d;
}
function renderDrawerHead() {
  const d = $('#pata-drawer'); if (!d) return;
  $('#pd-av', d).innerHTML = faceHtml(G.user);
  $('#pd-name', d).textContent = G.user ? (G.user.displayName || 'Account') : 'Not signed in';
  $('#pd-mail', d).textContent = G.user ? (G.user.email || '') : '';
  $('#pd-stat', d).textContent = statusText();
  const bb = $('#pd-backup', d);
  bb.style.display = G.user ? '' : 'none'; bb.textContent = G.session ? '☁️ Back up now' : '🔐 Turn on backup';
  $('#pd-out', d).style.display = G.user ? '' : 'none';
}
async function openDrawer() {
  const d = ensureDrawer(); d.classList.add('show'); renderDrawerHead();
  const list = $('#pd-list', d);
  if (!G.user) { $('#pd-search', d).style.display = 'none'; list.innerHTML = '<div class="pd-empty">Sign-in is not active in setup mode.</div>'; return; }
  $('#pd-search', d).style.display = '';
  if (!G.session) { list.innerHTML = '<div class="pd-empty">Turn on encrypted backup to keep every session in your History.</div>'; return; }
  if (G.index) renderList(); else list.innerHTML = '<div class="pd-empty">Loading history…</div>';
  try { await T(pushHistory(liveTabs()), 60000); } catch (_) {}      // make sure the current session is listed too
  try { G.index = await T(serial(loadIndex), 20000); renderList(); }
  catch (e) { if (!G.index) list.innerHTML = `<div class="pd-empty">${esc(explain(e))}</div>`; }
}
function closeDrawer() { const d = $('#pata-drawer'); if (d) d.classList.remove('show'); }
const currentCid = () => { const tm = window.TAB_MANAGER; const a = tm && tm.getActive && tm.getActive(); return a && a.__cid; };
function dayLabel(t) {
  const d = new Date(t), n = new Date(), y = new Date(Date.now() - 864e5);
  return d.toDateString() === n.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function renderList() {
  const d = $('#pata-drawer'); if (!d) return;
  const list = $('#pd-list', d), q = ($('#pd-search', d).value || '').trim().toLowerCase(), cur = currentCid();
  const rows = (G.index || []).filter(e => !q || String(e.title).toLowerCase().includes(q));
  if (!rows.length) { list.innerHTML = `<div class="pd-empty">${q ? 'No matching sessions.' : 'No sessions yet. Everything you create is saved here automatically.'}</div>`; return; }
  let last = '';
  list.innerHTML = rows.map(e => {
    const lab = dayLabel(e.updatedAt), head = lab !== last ? `<div class="pd-day">${esc(lab)}</div>` : ''; last = lab;
    return `${head}<div class="pd-row ${e.id === cur ? 'cur' : ''}" data-id="${esc(e.id)}"><span>${e.kind === 'slides' ? '🖼️' : '💬'}</span>
      <div class="pd-t"><b>${esc(e.title)}</b><small>${e.id === cur ? 'Current session · ' : ''}${esc(new Date(e.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))} · ${e.chats || 0} msgs</small></div>
      <button class="pd-del" data-del title="Delete from cloud" aria-label="Delete">🗑</button></div>`;
  }).join('');
  list.querySelectorAll('.pd-row').forEach(row => {
    const id = row.dataset.id;
    row.onclick = async ev => {
      if (ev.target.closest('[data-del]')) return;
      if (id === cur) return closeDrawer();
      row.style.opacity = '.5';
      try { await openEntry(id); closeDrawer(); } catch (e) { row.style.opacity = ''; toast('⚠️ Could not open (' + (e.message || 'error') + ')'); }
    };
    row.querySelector('[data-del]').onclick = async () => {
      if (!confirm('Delete this session from your cloud history? This cannot be undone.')) return;
      try { await deleteEntry(id); renderList(); } catch (e) { toast('⚠️ Delete failed'); }
    };
  });
}
async function openEntry(id) {
  const p = await readEntry(id), tm = window.TAB_MANAGER;
  // createTab() archives + REPLACES the current session (single-session model)
  const tab = tm.createTab(p.name, p.htmlContent, { chatHistory: p.chatHistory || [], attachedFiles: p.attachedFiles || {}, undoStack: [], redoStack: [],
    projectVersion: p.projectVersion || 0, theme: p.theme, photocopyMode: !!p.photocopyMode, slideDeck: p.slideDeck || null }, true);
  ['pdfVisualFormat', 'pdfTextFormat', 'pdfLanguageFormat'].forEach(k => { if (p[k]) tab[k] = p[k]; });
  tab.__cid = id;                        // further edits update THIS history entry instead of creating a duplicate
  tm.switchTo(tab.id);
}
async function deleteEntry(id) {
  await serial(async () => {
    const head = await getData(R.hist(id)), batch = G.fb.fs.writeBatch(G.db);
    if (head) for (let i = 0; i < head.n; i++) batch.delete(R.d('hist', id + '_c' + i));
    batch.delete(R.hist(id)); await batch.commit();
    await saveIndex((await loadIndex()).filter(e => e.id !== id));
  });
  delete G.hashes[id];
  ((window.TAB_MANAGER || {}).tabs || []).forEach(t => { if (t.__cid === id) delete t.__cid; });
}
async function signOutFlow() {
  closeDrawer();
  if (G.session) await Promise.race([runBackup(false), new Promise(r => setTimeout(r, 10000))]);
  const ok = !G.session || G.status === 'ok';
  const pick = await askChoice('Sign out?', (ok ? '' : '⚠️ Your latest changes could NOT be backed up. ') +
    'Signing out removes API keys, history and settings from THIS device. Your encrypted cloud backup stays safe.',
    [{ label: 'Sign out', value: true, cls: 'danger' }, { label: 'Cancel', value: false }]);
  if (!pick) return;
  WIPE_KEYS.forEach(lsDel); await V.clearCache();
  try { await G.fb.auth.signOut(G.auth); } catch (_) {}
  location.reload();
}

// ---------- login / backup orchestration ----------
function skipBackup() { closeGate(); G.session = null; setStatus('off'); }
async function setupBackupFlow() {
  let escaped = false;
  wait('Checking your backup…', { label: 'Taking too long? Continue without backup', fn: () => { escaped = true; skipBackup(); } });
  try {
    const unlocked = await ensureVault();
    if (escaped) return;
    if (!unlocked) return skipBackup();
    wait('Restoring your backup…');
    if (await reconcileSettings()) { wait('Applying restored settings…'); location.reload(); return; }
    closeGate(); setStatus('busy'); startEngine(); runBackup(false);
  } catch (e) {
    if (escaped) return;
    console.warn('[cloud] backup setup failed', e);
    if (e.message === 'decrypt-failed') { await V.clearCache(); G.session = null; if (await promptUnlock('Your saved unlock key is out of date. Enter your passphrase.')) { location.reload(); return; } return skipBackup(); }
    showError("Backup couldn't start", explain(e), setupBackupFlow, skipBackup);
  }
}
async function backgroundSync() {                     // returning user on a known device: never make them wait
  try {
    if (await reconcileSettings()) { toast('☁️ Restored your latest settings…'); setTimeout(() => location.reload(), 600); return; }
    startEngine(); runBackup(false);
  } catch (e) {
    console.warn('[cloud] background sync failed', e);
    if (e.message === 'decrypt-failed') { await V.clearCache(); G.session = null; setStatus('off'); setupBackupFlow(); }
    else setStatus('err', explain(e));
  }
}
async function afterLogin(user) {
  if (G.started && G.uid === user.uid) return;
  G.user = user; G.uid = user.uid; G.started = true;
  mountAvatar();
  const owner = lsGet('pata_local_owner');
  if (owner && owner !== user.uid) { WIPE_KEYS.forEach(lsDel); lsSet('pata_local_owner', user.uid); location.reload(); return; }   // never mix two accounts' data
  lsSet('pata_local_owner', user.uid);
  const cached = await V.sessionFromCache(user.uid);
  if (cached) { G.session = cached; closeGate(); setStatus('busy'); backgroundSync(); return; }
  await setupBackupFlow();
}
async function boot() {
  const av = $('#pata-avatar-btn'); if (av) av.onclick = () => openDrawer();
  if (!gate) return;
  if (!configured) return showUnconfigured();
  if (!V || !window.crypto || !window.crypto.subtle) return showError('Secure encryption unavailable', 'This browser does not support secure encryption (it needs HTTPS).', () => location.reload());
  wait('Loading…');
  try { await loadFirebase(); } catch (e) { return showError("Can't connect", 'Could not load Firebase. Check your internet connection.', boot); }
  // Finish a redirect-based sign-in (installed PWA / popup blocked) before listening for auth changes.
  let rr = null; G.verifying = true;
  try { rr = await G.fb.auth.getRedirectResult(G.auth); } catch (e) { G.verifying = false; showAuth('signin', 'Sign-in failed (' + (e.code || e.message) + ').'); }
  if (rr && rr.user) { let mode = 'signin'; try { mode = sessionStorage.getItem('pata_auth_intent') || 'signin'; } catch (_) {} await finishAuth(rr, mode); } else G.verifying = false;
  G.fb.auth.onAuthStateChanged(G.auth, user => {
    if (G.verifying) return;
    if (user) afterLogin(user);
    else { G.started = false; G.uid = null; G.user = null; G.session = null; setStatus('off'); showAuth('signin'); }
  });
}
boot();
