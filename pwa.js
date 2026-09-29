// PWA helper: service worker register + "Install" button (Android/PC) + iOS hint
(function () {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('[PWA] SW register failed', e); });
    });
  }

  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) return;

  var deferredPrompt = null;
  function makeBtn(text, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.style.cssText = 'position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:99999;' +
      'padding:10px 16px;border:0;border-radius:999px;background:#4f7df3;color:#fff;font:600 14px Inter,Arial,sans-serif;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer';
    b.addEventListener('click', onClick);
    document.body.appendChild(b);
    return b;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var btn = makeBtn('⬇ অ্যাপ ইনস্টল করুন', function () {
      btn.remove();
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () { deferredPrompt = null; });
    });
  });
  window.addEventListener('appinstalled', function () {
    var b = document.querySelector('button[data-pwa]'); if (b) b.remove();
  });

  // iOS Safari te auto prompt nei — ekbar hint dekhai
  var ua = navigator.userAgent;
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && !localStorage.getItem('pwaIosHintSeen')) {
    window.addEventListener('load', function () {
      var b = makeBtn('iPhone: Share → Add to Home Screen', function () {
        try { localStorage.setItem('pwaIosHintSeen', '1'); } catch (_) {}
        b.remove();
      });
    });
  }
})();
