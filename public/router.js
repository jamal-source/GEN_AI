'use strict';
(function () {
  // MitraKu AI — Fase 1: SPA hash-routing (router independen, tanpa rombak script.js)
  // Pola: #/toko-pintar, #/copywriting, #/brandkit, #/marketresearch, #/chat, #/dashboard, #/settings
  const VIEW_ALIASES = {
    'dashboard':      'dashboard',
    'chat':           'chat',
    'copywriting':    'copywriting',
    'brandkit':       'brandkit',
    'toko-pintar':    'tokopintar',
    'market-research':'marketresearch',
    'marketresearch': 'marketresearch',
    'settings':       'settings',
  };
  const HASH_TO_VIEW = {
    '/dashboard':      'dashboard',
    '/chat':           'chat',
    '/copywriting':    'copywriting',
    '/brandkit':       'brandkit',
    '/toko-pintar':    'tokopintar',
    '/market-research':'marketresearch',
    '/settings':       'settings',
  };
  // hash defaults di-set oleh index.html? tidak. router set hash sekali saat boot.
  function normalizeHash() {
    const raw = (window.location.hash || '').trim();
    if (!raw || raw === '#') return null;
    const path = raw.startsWith('#') ? raw.slice(1) : raw;
    const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
    return clean.toLowerCase();
  }
  function resolveView(hashPath) {
    if (!hashPath) return null;
    if (HASH_TO_VIEW[hashPath]) return HASH_TO_VIEW[hashPath];
    const bare = hashPath.replace(/^\//, '');
    return VIEW_ALIASES[bare] || null;
  }
  function viewToHash(viewName) {
    if (!viewName) return '/chat';
    switch (viewName) {
      case 'tokopintar':      return '/toko-pintar';
      case 'marketresearch':  return '/market-research';
      default:                return '/' + viewName;
    }
  }
  function applyHash() {
    const sw = window.switchView;
    if (typeof sw !== 'function') return;
    const view = resolveView(normalizeHash());
    const bootedView = sw('current') === null ? null : null; // no-op; switchView memakai string view
    sw(view || 'chat');
  }
  function onHashChange() {
    applyHash();
  }
  // Boot: daftarkan listener + terapkan hash pertama (jika ada)
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', onHashChange);
    const v = resolveView(normalizeHash());
    if (v) {
      // panggil switchView sekali saat boot; hindari double-render
      setTimeout(applyHash, 0);
    }
  }
  // Expose helper untuk navigasi programatik (dipakai tombol/tab internal)
  window.goTo = function (viewOrHash) {
    const hash = viewOrHash && viewOrHash.charAt(0) === '/'
      ? viewOrHash
      : viewToHash(viewOrHash);
    if (window.location.hash === '#' + hash) {
      applyHash(); // sudah di hash itu — hanya re-render
    } else {
      window.location.hash = hash; // trigger hashchange
    }
  };
})();
