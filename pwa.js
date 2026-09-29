// Pata AI — PWA helper
//  1) service worker register
//  2) "Install" button (Android/PC) + iOS hint
//  3) No-internet modal (offline hole sundor modal dekhay, online hole nijei soriye jay)
(function () {
  // ---------- 1) Service worker ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('[PWA] SW register failed', e); });
    });
  }

  // ---------- 2) Install button ----------
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var deferredPrompt = null;

  function makeInstallBtn(text, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-pwa-install', '1');
    b.textContent = text;
    b.style.cssText = 'position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:99998;' +
      'padding:10px 16px;border:0;border-radius:999px;background:#4f7df3;color:#fff;font:600 14px Inter,Arial,sans-serif;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer';
    b.addEventListener('click', onClick);
    document.body.appendChild(b);
    return b;
  }

  if (!isStandalone) {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      var btn = makeInstallBtn('Install App', function () {
        btn.remove();
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function () { deferredPrompt = null; });
      });
    });
    window.addEventListener('appinstalled', function () {
      var b = document.querySelector('[data-pwa-install]'); if (b) b.remove();
    });

    var ua = navigator.userAgent;
    var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var seen = false;
    try { seen = !!localStorage.getItem('pwaIosHintSeen'); } catch (_) {}
    if (isIOS && !seen) {
      window.addEventListener('load', function () {
        var b = makeInstallBtn('Share → Add to Home Screen', function () {
          try { localStorage.setItem('pwaIosHintSeen', '1'); } catch (_) {}
          b.remove();
        });
      });
    }
  }

  // ---------- 3) No-internet modal ----------
  var modal = null;
  var toastTimer = null;

  function injectOfflineStyles() {
    if (document.getElementById('pata-offline-style')) return;
    var st = document.createElement('style');
    st.id = 'pata-offline-style';
    st.textContent =
      '#pata-offline{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;' +
      'padding:20px;background:rgba(15,23,42,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);' +
      'font-family:Inter,"Hind Siliguri",Arial,sans-serif}' +
      '#pata-offline.show{display:flex;animation:pataFade .25s ease}' +
      '#pata-offline .po-card{width:100%;max-width:380px;background:#fff;color:#0f172a;border-radius:24px;padding:32px 26px 24px;' +
      'text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.35);animation:pataPop .3s cubic-bezier(.2,.9,.3,1.2)}' +
      '#pata-offline .po-ico{width:84px;height:84px;margin:0 auto 18px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
      'background:linear-gradient(135deg,#eef2ff,#e0e7ff);color:#4f7df3}' +
      '#pata-offline .po-ico svg{width:44px;height:44px;animation:pataPulse 2s ease-in-out infinite}' +
      '#pata-offline h2{margin:0 0 8px;font-size:21px;font-weight:800;letter-spacing:-.01em}' +
      '#pata-offline p{margin:0 0 22px;font-size:14.5px;line-height:1.6;color:#64748b}' +
      '#pata-offline .po-btn{width:100%;border:0;border-radius:14px;padding:13px 16px;font:700 15px inherit;font-family:inherit;' +
      'background:#4f7df3;color:#fff;cursor:pointer;transition:transform .12s,opacity .12s}' +
      '#pata-offline .po-btn:active{transform:scale(.97)}' +
      '#pata-offline .po-btn[disabled]{opacity:.65;cursor:wait}' +
      '#pata-offline .po-sub{display:block;width:100%;margin-top:10px;border:0;background:transparent;color:#64748b;' +
      'font:600 13.5px inherit;font-family:inherit;padding:8px;cursor:pointer}' +
      '#pata-offline .po-status{min-height:18px;margin-top:10px;font-size:12.5px;color:#ef4444}' +
      '#pata-online-toast{position:fixed;left:50%;top:calc(16px + env(safe-area-inset-top,0px));transform:translate(-50%,-20px);' +
      'z-index:2147483001;background:#16a34a;color:#fff;padding:10px 18px;border-radius:999px;font:600 14px Inter,Arial,sans-serif;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:all .3s}' +
      '#pata-online-toast.show{opacity:1;transform:translate(-50%,0)}' +
      '@keyframes pataFade{from{opacity:0}to{opacity:1}}' +
      '@keyframes pataPop{from{opacity:0;transform:scale(.9) translateY(10px)}to{opacity:1;transform:none}}' +
      '@keyframes pataPulse{0%,100%{opacity:1}50%{opacity:.45}}' +
      '@media (prefers-color-scheme:dark){#pata-offline .po-card{background:#111827;color:#f1f5f9}' +
      '#pata-offline .po-ico{background:linear-gradient(135deg,#1e293b,#312e81);color:#93a8ff}' +
      '#pata-offline p,#pata-offline .po-sub{color:#94a3b8}}';
    document.head.appendChild(st);
  }

  function buildModal() {
    if (modal) return modal;
    injectOfflineStyles();
    modal = document.createElement('div');
    modal.id = 'pata-offline';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'po-title');
    modal.innerHTML =
      '<div class="po-card">' +
        '<div class="po-ico" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8a15 15 0 0 0-8-3.7M5 12.9a10 10 0 0 1 3.3-2M19 12.9a10 10 0 0 0-4.6-2.6M8.5 16.4a5 5 0 0 1 7 0"/>' +
          '<circle cx="12" cy="20" r="1" fill="currentColor"/><path d="M3 3l18 18"/></svg>' +
        '</div>' +
        '<h2 id="po-title">No Internet Connection</h2>' +
        '<p>Pata AI needs an internet connection to generate documents and slides. Please check your network and try again.</p>' +
        '<button type="button" class="po-btn" id="po-retry">Try Again</button>' +
        '<button type="button" class="po-sub" id="po-dismiss">Continue Offline</button>' +
        '<div class="po-status" id="po-status" aria-live="polite"></div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.querySelector('#po-retry').addEventListener('click', retryConnection);
    modal.querySelector('#po-dismiss').addEventListener('click', function () { hideModal(); dismissedThisOffline = true; });
    return modal;
  }

  var dismissedThisOffline = false;

  function showModal() {
    if (dismissedThisOffline) return;
    buildModal().classList.add('show');
  }
  function hideModal() {
    if (modal) modal.classList.remove('show');
  }

  function showOnlineToast() {
    var t = document.getElementById('pata-online-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'pata-online-toast';
      t.textContent = 'You\'re back online';
      document.body.appendChild(t);
    }
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // navigator.onLine kokhono bhul dey, tai real ping diye check kori
  // (www.gstatic.com service worker cache kore na, tai offline-e sotti fail hoy)
  function pingInternet() {
    if (!navigator.onLine) return Promise.resolve(false);
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 5000);
    return fetch('https://www.gstatic.com/generate_204?_=' + Date.now(), { mode: 'no-cors', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function () { clearTimeout(timer); return true; })
      .catch(function () { clearTimeout(timer); return false; });
  }

  function retryConnection() {
    var btn = document.getElementById('po-retry');
    var status = document.getElementById('po-status');
    btn.disabled = true;
    btn.textContent = 'Checking…';
    status.textContent = '';
    pingInternet().then(function (ok) {
      btn.disabled = false;
      btn.textContent = 'Try Again';
      if (ok) { goOnline(); }
      else { status.textContent = 'Still offline. Please check your connection.'; }
    });
  }

  var wasOffline = false;
  function goOffline() {
    wasOffline = true;
    showModal();
  }
  function goOnline() {
    dismissedThisOffline = false;
    hideModal();
    if (wasOffline) { wasOffline = false; showOnlineToast(); }
  }

  function initOfflineWatcher() {
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', function () {
      pingInternet().then(function (ok) { if (ok) goOnline(); });
    });
    // app khulei offline thakle
    if (!navigator.onLine) goOffline();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initOfflineWatcher);
  else initOfflineWatcher();
})();
