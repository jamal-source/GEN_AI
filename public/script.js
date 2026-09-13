(function () {
  'use strict';

  /* ==========================================================================
     1. STATE & CONSTANTS
     ========================================================================== */
  const STORAGE_KEY   = 'mitraku_conversations_v2';
  const ACTIVE_ID_KEY = 'mitraku_active_conv_id';
  const THEME_KEY     = 'mitraku_theme';
  const PRODUCT_KEY   = 'mitraku_active_product';
  const SIDEBAR_KEY   = 'mitraku_sidebar_open';
  const VIEW_KEY      = 'mitraku_active_view';
  const KNOWN_VIEWS   = ['dashboard', 'chat', 'copywriting', 'brandkit', 'tokopintar', 'marketresearch', 'settings'];

  let activeConvId      = safeGet(ACTIVE_ID_KEY) || null;
  let selectedProvider  = 'gemini';
  let isGenerating      = false;
  let pendingDeleteId   = null;
  let pendingCatalogDeleteId = null;

  /* Helper DOM Selector */
  const $ = id => document.getElementById(id);

  /* Storage budget — jaga riwayat tetap kecil supaya localStorage
     tidak pernah penuh (penyebab utama UI membeku / script mati). */
  const STORAGE_BUDGET = 3.5 * 1024 * 1024; // target max ~3.5 MB (kuota Chrome 5 MB)
  const MSG_LEN_LIMIT  = 24000;             // batas panjang satu pesan (chars)

  /* Safe localStorage helpers — jangan biarkan satu kegagalan storage
     (mis. QuotaExceededError) membunuh seluruh aplikasi. */
  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (err) { console.warn('[safeGet] gagal baca localStorage:', key, err?.message || err); return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, val); return true; }
    catch (err) { console.warn('[safeSet] gagal tulis localStorage:', key, err?.message || err); return false; }
  }
  function safeRemove(key) {
    try { localStorage.removeItem(key); return true; } catch (err) { console.warn('[safeRemove] gagal hapus localStorage:', key, err?.message || err); return false; }
  }

  /* Safe Copy to Clipboard (Works on HTTP, HTTPS, WebViews, Localhost & Remote Deployments) */
  async function copyToClipboard(text, btnEl) {
    const val = (text != null ? text : '').toString();
    let targetBtn = btnEl || (typeof event !== 'undefined' && event && event.target ? event.target.closest('button') : null);

    let copied = false;

    // 1. Try Clipboard API if available
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(val);
        copied = true;
      } catch (err) {
        console.warn('[copyToClipboard] navigator.clipboard failed, attempting fallback...', err);
      }
    }

    // 2. Fallback to execCommand if Clipboard API failed or not supported
    if (!copied) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = val;
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.width = '2em';
        textarea.style.height = '2em';
        textarea.style.padding = '0';
        textarea.style.border = 'none';
        textarea.style.outline = 'none';
        textarea.style.boxShadow = 'none';
        textarea.style.background = 'transparent';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (err) {
        console.error('[copyToClipboard] execCommand fallback error:', err);
      }
    }

    // 3. Button Micro-interaction feedback
    if (targetBtn && !targetBtn.classList.contains('btn-copied')) {
      const origHtml = targetBtn.innerHTML;
      targetBtn.classList.add('btn-copied');
      targetBtn.innerHTML = '✓ Tersalin!';
      setTimeout(() => {
        targetBtn.classList.remove('btn-copied');
        targetBtn.innerHTML = origHtml;
      }, 2000);
    }

    if (!copied) {
      throw new Error('Gagal menyalin teks ke clipboard.');
    }
    return true;
  }
  // Expose to window for inline HTML handlers
  window.copyToClipboard = copyToClipboard;

  window.dismissOnboarding = function () {
    ['onboarding-card', 'dash-onboard-card'].forEach(id => {
      const el = $(id);
      if (el) el.style.display = 'none';
    });
    safeSet('mitraku_onboarding_dismissed', 'true');
  };

  window.dismissDashboardOnboarding = function () {
    window.dismissOnboarding();
  };

  window.dashOnboardAction = function (action) {
    window.dismissOnboarding();
    if (action === 'product') {
      if (typeof openProductModal === 'function') openProductModal();
    } else if (action === 'tools') {
      const cards = document.querySelector('.dash-cards');
      if (cards) cards.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (action === 'chat') {
      if (typeof window.switchView === 'function') window.switchView('chat');
    }
  };

  function initOnboarding() {
    ['onboarding-card', 'dash-onboard-card'].forEach(id => {
      const card = $(id);
      if (!card) return;
      const isDismissed = safeGet('mitraku_onboarding_dismissed') === 'true';
      if (isDismissed) card.style.display = 'none';
    });
  }

  /* ── MODAL ACCESSIBILITY HELPERS (focus trap + return focus) ── */
  let lastFocusedEl = null;

  function trapFocusKeydown(e, modal) {
    if (e.key !== 'Tab') return;
    const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function openModal(id) {
    const modal = $(id);
    if (!modal) return;
    lastFocusedEl = document.activeElement;
    modal.style.display = 'flex';
    try {
      const focusables = modal.querySelectorAll('button, [href], input, select, textarea');
      if (focusables.length) focusables[0].focus();
    } catch (err) { /* abaikan */ }
    if (!modal._trapped) {
      modal._trapped = true;
      modal.addEventListener('keydown', e => {
        if (modal.style.display === 'flex') trapFocusKeydown(e, modal);
      });
    }
  }

  function closeModal(id) {
    const modal = $(id);
    if (modal) modal.style.display = 'none';
    if (lastFocusedEl && lastFocusedEl.focus) {
      try { lastFocusedEl.focus(); } catch (err) { /* elemen fokus tak lagi ada */ }
      lastFocusedEl = null;
    }
  }

  window.openAboutModal = function () {
    if (typeof window.switchSettingsTab === 'function') window.switchSettingsTab('umum');
    if (typeof window.switchView === 'function') window.switchView('settings');
  };

  window.closeAboutModal = function () {
    closeModal('about-modal');
  };

  window.switchSettingsTab = function (tab) {
    const umum = $('settings-subview-umum');
    const integ = $('settings-subview-integrasi');
    const tU = $('settings-tab-umum');
    const tI = $('settings-tab-integrasi');
    if (umum) umum.style.display = (tab === 'umum') ? 'block' : 'none';
    if (integ) integ.style.display = (tab === 'integrasi') ? 'block' : 'none';
    if (tU) tU.classList.toggle('active', tab === 'umum');
    if (tI) tI.classList.toggle('active', tab === 'integrasi');
    if (tab === 'integrasi' && typeof initSettingsPanel === 'function') initSettingsPanel();
  };

  window.openClearHistoryModal = function () {
    window.closeAboutModal();
    openModal('confirm-clear-modal');
  };

  window.closeClearHistoryModal = function () {
    closeModal('confirm-clear-modal');
  };

  window.clearAllHistory = function () {
    [STORAGE_KEY, ACTIVE_ID_KEY, PRODUCT_KEY, SIDEBAR_KEY, VIEW_KEY].forEach(key => {
      safeRemove(key);
    });

    try { svc.conversations.length = 0; } catch (err) { console.warn('Gagal reset memori percakapan:', err); }

    activeConvId = null;
    setLoading(false);
    window._generatingStartTime = 0;

    showEmpty();
    renderHistory();

    ['cw-result-content', 'bk-result-content', 'mr-result-content',
     'cw-result-loading', 'bk-result-loading', 'mr-result-loading'].forEach(id => {
      const el = $(id);
      if (el) el.style.display = 'none';
    });
    ['cw-result-empty', 'bk-result-empty', 'mr-result-empty'].forEach(id => {
      const el = $(id);
      if (el) el.style.display = '';
    });
    ['cw-cards-container', 'bk-cards-container', 'mr-cards-container'].forEach(id => {
      const el = $(id);
      if (el) el.innerHTML = '';
    });

    if (typeof initActiveProduct === 'function') initActiveProduct();

    window.closeClearHistoryModal();
    window.closeAboutModal();

    showToast('🗑️ Semua riwayat & pengaturan produk berhasil dibersihkan.');
  };

  const confirmClearBtn = $('confirm-clear-btn');
  if (confirmClearBtn) confirmClearBtn.addEventListener('click', window.clearAllHistory);

  window.openProductModal = function () {
    initActiveProduct();
    openModal('product-modal');
  };

  window.closeProductModal = function () {
    closeModal('product-modal');
  };

  window.saveActiveProduct = function () {
    const inputBrand   = $('input-product-name');
    const inputVariant = $('input-variant-name');
    const inputLegal   = $('input-legalities');
    const p = {
      brand:      inputBrand   ? inputBrand.value.trim()   : '',
      variant:    inputVariant ? inputVariant.value.trim() : '',
      legalities: inputLegal   ? inputLegal.value.trim()   : ''
    };
    safeSet(PRODUCT_KEY, JSON.stringify(p));
    initActiveProduct();
    window.closeProductModal();
    if (activeConvId) {
      const conv = svc.get(activeConvId);
      if (conv) { conv.product_context = p; svc._save(); }
    }
  };

  

  window.closeDeleteModal = function () {
    pendingDeleteId = null;
    closeModal('delete-modal');
  };

  window.quickPrompt = function (text) {
    const input = $('user-input');
    if (!input) return;
    input.value = text;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    if (typeof window.handleChatSubmit === 'function') {
      window.handleChatSubmit();
    }
  };

  window.copyCode = function (btn) {
    const code = btn.closest('pre').querySelector('code').textContent;
    copyToClipboard(code).then(() => {
      btn.textContent = 'Tersalin!';
      setTimeout(() => { btn.textContent = 'Salin'; }, 2000);
    });
  };

  window.copyMessageText = function (btn) {
    const text = btn.closest('.message-content-wrap').querySelector('.bubble').textContent;
    copyToClipboard(text).then(() => {
      btn.textContent = '✓ Tersalin!';
      setTimeout(() => { btn.textContent = '📋 Salin'; }, 2000);
    });
  };

  window.handleNewChat = function () {
activeConvId = null;
          safeRemove(ACTIVE_ID_KEY);
          showEmpty();
    renderHistory();
    closeMobileDrawer();
    const input = $('user-input');
    if (input) {
      input.value = '';
      input.style.height = 'auto';
      input.focus();
    }
  };

  /* ==========================================================================
     3. CONVERSATION SERVICE (STATE & PERSISTENCE)
     ========================================================================== */
  class ConversationService {
    constructor() {
      this.conversations = this._load();
    }

    _load() {
      try {
        const raw = safeGet(STORAGE_KEY);
        const list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) return [];
        const valid = list.filter(c => c && typeof c === 'object' && Array.isArray(c.messages) && c.messages.length > 0);
        if (valid.length !== list.length) {
          safeSet(STORAGE_KEY, JSON.stringify(valid));
        }
        return this._keepWithinBudget(valid);
      } catch {
        return [];
      }
    }

    _save() {
      try {
        let valid = this.conversations
          .filter(c => c && typeof c === 'object' && Array.isArray(c.messages) && c.messages.length > 0)
          .map(c => ({
            ...c,
            messages: c.messages.slice(-100).map(m => ({
              ...m,
              text: (typeof m.text === 'string' && m.text.length > MSG_LEN_LIMIT) ? m.text.slice(0, MSG_LEN_LIMIT) : m.text
            }))
          }));
        this.conversations = this._keepWithinBudget(valid);
        safeSet(STORAGE_KEY, JSON.stringify(this.conversations));
      } catch (err) {
        console.warn('Gagal menyimpan riwayat ke localStorage:', err);
      }
    }

    /* Jaga total ukuran riwayat di bawah budget. Buang percakapan
       paling lama dulu supaya localStorage tidak pernah penuh. */
    _keepWithinBudget(list) {
      let arr = list.slice();
      while (arr.length > 1) {
        let size = 0;
        try { size = JSON.stringify(arr).length * 2; } catch { size = STORAGE_BUDGET + 1; }
        if (size <= STORAGE_BUDGET) break;
        arr.pop(); // percakapan paling lama ada di akhir daftar
      }
      return arr;
    }

    getAll() {
      return [...this.conversations]
        .filter(c => c && Array.isArray(c.messages) && c.messages.length > 0)
        .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    }

    get(id) {
      return this.conversations.find(c => c.id === id) || null;
    }

    create() {
      const now = new Date().toISOString();
      const conv = {
        id: 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title: 'Percakapan Baru',
        created_at: now,
        updated_at: now,
        archived: false,
        product_context: getActiveProductContext(),
        messages: []
      };
      this.conversations.unshift(conv);
      return conv;
    }

    addMessage(convId, role, text, metadata = null) {
      const conv = this.get(convId);
      if (!conv) return null;
      const now = new Date().toISOString();
      const msg = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        role, text, created_at: now, metadata
      };
      conv.messages.push(msg);
      conv.updated_at = now;
      this._save();
      return msg;
    }

    rename(id, title) {
      const conv = this.get(id);
      if (conv) {
        conv.title = (title || '').trim() || 'Percakapan Baru';
        conv.updated_at = new Date().toISOString();
        this._save();
      }
    }

    delete(id) {
      this.conversations = this.conversations.filter(c => c.id !== id);
      this._save();
    }

    search(query) {
      const all = this.getAll().filter(c => c && !c.archived);
      if (!query || !query.trim()) return all;
      const q = query.toLowerCase().trim();
      return all.filter(c => {
        const title = typeof c.title === 'string' ? c.title.toLowerCase() : '';
        const matchTitle = title.includes(q);
        const matchMessages = Array.isArray(c.messages) && c.messages.some(m => {
          const text = (m && typeof m.text === 'string') ? m.text.toLowerCase() : '';
          return text.includes(q);
        });
        return matchTitle || matchMessages;
      });
    }

    grouped(list) {
      const now   = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const yest  = today - 864e5;
      const week  = today - 6 * 864e5;
      const g = { today: [], yesterday: [], last7Days: [], older: [] };
      (list || this.getAll().filter(c => !c.archived)).forEach(c => {
        const t = new Date(c.updated_at).getTime();
        if (t >= today)     g.today.push(c);
        else if (t >= yest) g.yesterday.push(c);
        else if (t >= week) g.last7Days.push(c);
        else                g.older.push(c);
      });
      return g;
    }
  }

  const svc = new ConversationService();

  /* ==========================================================================
     4. DOM INITIALIZATION & EVENT BINDINGS
     ========================================================================== */
  const sidebar             = $('sidebar');
  const sidebarToggle       = $('sidebar-toggle');
  const sidebarHeaderToggle = $('sidebar-header-toggle');
  const sidebarOverlay      = $('sidebar-overlay');
  const newChatBtn          = $('new-chat-btn');
  const historySearch       = $('history-search');
  const searchClear         = $('search-clear');
  const historyList         = $('history-list');
  const historyEmpty        = $('history-empty');
  const topProductName      = $('top-product-name');
  const composerLabel       = $('composer-product-label');
  const modelSelectorBtn     = $('model-selector-btn');
  const modelLabel          = $('model-selected-label');
  const modelMenu           = $('model-menu');
  const themeToggleBtn      = $('theme-toggle-btn');
  const themeIcon           = $('theme-icon');
  const aboutBtn            = $('about-btn');
  const chatBox             = $('chat-box');
  const emptyState          = $('empty-state');
  const chatForm            = $('chat-form');
  const input               = $('user-input');
  const sendBtn             = $('send-btn');
  const confirmDeleteBtn    = $('confirm-delete-btn');

  // Initialize UI Settings — satu kegagalan di sini JANGAN mematikan seluruh wiring.
  try {
    initTheme();
    initSidebar();
    initActiveProduct();
    initOnboarding();
  } catch (err) {
    console.error('Init UI gagal sebagian (dilewati):', err);
  }
  checkProviderAvailability();

  // Load Initial Conversation if valid
  try {
    const initialConv = activeConvId ? svc.get(activeConvId) : null;
    if (initialConv && initialConv.messages && initialConv.messages.length > 0) {
      loadConversation(activeConvId);
    } else {
      activeConvId = null;
      safeRemove(ACTIVE_ID_KEY);
      showEmpty();
    }
    renderHistory();
  } catch (err) {
    console.error('Gagal muat percakapan awal (dilewati):', err);
    activeConvId = null;
    safeRemove(ACTIVE_ID_KEY);
    showEmpty();
  }

  // BUG #12 FIX: Restore last active view from localStorage (dashboard = default baru)
  const savedView = safeGet(VIEW_KEY);
  const initialView = (savedView && KNOWN_VIEWS.includes(savedView)) ? savedView : 'dashboard';
  // Defer to ensure DOM is ready for switchView (juga hydrates dashboard)
  setTimeout(() => { if (typeof window.switchView === 'function') window.switchView(initialView); }, 0);

  /* ── SIDEBAR TOGGLE & COLLAPSE ──────────────────────────────── */
  function initSidebar() {
    // Default to open (expanded)
    setSidebarState(true, false);
  }

  function setSidebarState(open, animate = true) {
    if (!sidebar) return;
    if (!animate) sidebar.style.transition = 'none';

    if (open) {
      sidebar.classList.remove('collapsed');
    } else {
      sidebar.classList.add('collapsed');
    }

    if (!animate) {
      sidebar.offsetHeight; // force reflow
      sidebar.style.transition = '';
    }
    safeSet(SIDEBAR_KEY, String(open));
  }

  window.toggleSidebar = function () {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      const isOpen = sidebar.classList.contains('open');
      if (isOpen) {
        sidebar.classList.remove('open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('open');
      } else {
        sidebar.classList.add('open');
        if (sidebarOverlay) sidebarOverlay.classList.add('open');
      }
    } else {
      const isCollapsed = sidebar.classList.contains('collapsed');
      setSidebarState(isCollapsed);
    }
  };

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', window.toggleSidebar);
  }
  if (sidebarHeaderToggle) {
    sidebarHeaderToggle.addEventListener('click', window.toggleSidebar);
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeMobileDrawer);
  }

  function closeMobileDrawer() {
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('open');
  }

  /* ── ABOUT DEVELOPER BUTTON ─────────────────────────────────── */
  if (aboutBtn) {
    aboutBtn.addEventListener('click', window.openAboutModal);
  }

  /* ── THEME SWITCHER ─────────────────────────────────────────── */
  function initTheme() {
    const saved = safeGet(THEME_KEY) || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    if (themeIcon) themeIcon.textContent = saved === 'dark' ? '☀️' : '🌙';
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const cur  = document.documentElement.getAttribute('data-theme') || 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      safeSet(THEME_KEY, next);
      if (themeIcon) themeIcon.textContent = next === 'dark' ? '☀️' : '🌙';
    });
  }

  /* ── ACTIVE PRODUCT CONTEXT ─────────────────────────────────── */
  function getActiveProductContext() {
    try {
      const raw = safeGet(PRODUCT_KEY);
      if (!raw) return { brand: '', variant: '', legalities: '' };
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? {
        brand:      typeof parsed.brand === 'string' ? parsed.brand : '',
        variant:    typeof parsed.variant === 'string' ? parsed.variant : '',
        legalities: typeof parsed.legalities === 'string' ? parsed.legalities : ''
      } : { brand: '', variant: '', legalities: '' };
    } catch {
      return { brand: '', variant: '', legalities: '' };
    }
  }

  function initActiveProduct() {
    const p = getActiveProductContext();
    const name = p.variant || p.brand || 'Umum';
    if (topProductName) topProductName.textContent = `Produk: ${name}`;
    if (composerLabel)  composerLabel.textContent  = `📦 ${name}`;

    const inputBrand   = $('input-product-name');
    const inputVariant = $('input-variant-name');
    const inputLegal   = $('input-legalities');
    if (inputBrand)   inputBrand.value   = p.brand       || '';
    if (inputVariant) inputVariant.value = p.variant     || '';
    if (inputLegal)   inputLegal.value   = p.legalities  || '';
  }

  /* ── MODEL SELECTOR (AI AGENT DROPDOWN) ─────────────────────── */
  if (modelSelectorBtn && modelMenu) {
    modelSelectorBtn.addEventListener('click', e => {
      e.stopPropagation();
      const current = modelMenu.style.display;
      modelMenu.style.display = (current === 'none' || !current) ? 'block' : 'none';
    });
  }

  document.addEventListener('click', e => {
    if (modelMenu && !modelMenu.contains(e.target) && modelSelectorBtn && !modelSelectorBtn.contains(e.target)) {
      modelMenu.style.display = 'none';
    }
  });

  function selectProvider(val) {
    selectedProvider = val;
    const radio = document.querySelector(`input[name="model-choice"][value="${val}"]`);
    if (radio) radio.checked = true;
    if (modelLabel) {
      if (val === 'groq') modelLabel.textContent = 'GPT-OSS 120B (Groq)';
      else if (val === 'openrouter') modelLabel.textContent = 'OpenRouter AI';
      else modelLabel.textContent = 'Gemini 2.5 Flash';
    }
    if (modelMenu) modelMenu.style.display = 'none';
  }

  document.querySelectorAll('.model-menu-item').forEach(item => {
    item.addEventListener('click', function (e) {
      const radio = this.querySelector('input[name="model-choice"]');
      const val = radio ? radio.value : this.getAttribute('data-value');
      if (val) {
        selectProvider(val);
      }
    });
  });

  document.querySelectorAll('input[name="model-choice"]').forEach(radio => {
    radio.addEventListener('change', function () {
      if (this.checked) {
        selectProvider(this.value);
      }
    });
  });

  async function checkProviderAvailability() {
    try {
      const { data } = await apiFetch('/api/providers');
      if (data && typeof data === 'object') {
        const geminiDesc = document.querySelector('.model-menu-item[data-value="gemini"] .item-desc');
        const groqDesc   = document.querySelector('.model-menu-item[data-value="groq"] .item-desc');
        const orDesc     = document.getElementById('openrouter-desc');
        const orItem     = document.getElementById('model-item-openrouter');
        const orRadio    = orItem?.querySelector('input[type="radio"]');

        if (geminiDesc) {
          const gOk = data.gemini?.available;
          geminiDesc.textContent = gOk ? 'Recommended · Akurat & responsif' : '⚠️ Belum dikonfigurasi di server';
          geminiDesc.style.color = gOk ? '#16a34a' : '#f59e0b';
        }
        if (groqDesc) {
          const gqOk = data.groq?.available;
          groqDesc.textContent = gqOk ? 'Fast · Respon super cepat' : '⚠️ Opsional — belum dikonfigurasi';
          groqDesc.style.color = gqOk ? '#16a34a' : '#f59e0b';
        }
        if (orItem) {
          const orOk = data.openrouter?.available;
          if (orDesc) {
            orDesc.textContent = orOk ? 'Cadangan otomatis · Multi-LM' : '⚠️ Opsional — belum dikonfigurasi';
            orDesc.style.color = orOk ? '#16a34a' : '#f59e0b';
          }
          if (orOk) {
            orItem.style.opacity = '1';
            orItem.style.pointerEvents = '';
            orItem.classList.remove('disabled');
            if (orRadio) orRadio.disabled = false;
          } else {
            orItem.style.opacity = '0.5';
            orItem.classList.add('disabled');
            if (orRadio) orRadio.disabled = false;
          }
        }
      }
    } catch (err) {
      console.warn('[checkProviderAvailability]', err?.message || err);
    }
  }

  /* ── ESCAPE KEY LISTENER ────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeMobileDrawer();
      window.closeProductModal();
      window.closeDeleteModal();
      window.closeAboutModal();
      window.closeCatalogDeleteModal();
      if (modelMenu) modelMenu.style.display = 'none';
    }
  });

  /* ── BUG #10 FIX: Custom Catalog Delete Modal ───────────────── */
  window.closeCatalogDeleteModal = function () {
    pendingCatalogDeleteId = null;
    closeModal('catalog-delete-modal');
  };

  const catalogDeleteConfirmBtn = $('catalog-delete-confirm-btn');
  if (catalogDeleteConfirmBtn) {
    catalogDeleteConfirmBtn.addEventListener('click', async () => {
      if (!pendingCatalogDeleteId) return;
      const id = pendingCatalogDeleteId;
      window.closeCatalogDeleteModal();
      try {
        const { ok, data } = await apiFetch(`/api/toko-pintar/catalog/${id}`, { method: 'DELETE' });
        if (ok && data.success) {
          showToast('🗑️ Produk dihapus dari katalog.');
          loadStoreCatalog();
        } else {
          showToast('❌ Gagal menghapus produk: ' + formatError(data));
        }
      } catch (err) {
        showToast('❌ Gagal menghapus produk: ' + (err?.message || err));
      }
    });
  }

  /* ── HISTORY RENDERER ───────────────────────────────────────── */
  const GROUP_LABELS = {
    today:     'Hari Ini',
    yesterday: 'Kemarin',
    last7Days: '7 Hari Terakhir',
    older:     'Lebih Lama'
  };

  function renderHistory(query = '') {
    if (!historyList) return;
    historyList.innerHTML = '';

    const list = svc.search(query);

    if (list.length === 0) {
      if (historyEmpty) historyEmpty.style.display = 'block';
      return;
    }
    if (historyEmpty) historyEmpty.style.display = 'none';

    const groups = svc.grouped(list);
    Object.keys(groups).forEach(key => {
      const items = groups[key];
      if (!items.length) return;

      const groupEl = document.createElement('div');
      groupEl.innerHTML = `<div class="history-group-label">${GROUP_LABELS[key]}</div>`;

      items.forEach(c => {
        const el = document.createElement('div');
        el.className = `history-item${c.id === activeConvId ? ' active' : ''}`;
        el.setAttribute('data-conv-id', c.id);
        el.innerHTML = `
          <span class="history-item-title">${escHtml(c.title)}</span>
          <button class="history-item-menu-btn" title="Opsi percakapan" aria-label="Opsi">⋯</button>`;
        el.addEventListener('click', () => loadConversation(c.id));
        el.querySelector('.history-item-menu-btn').addEventListener('click', evt => {
          evt.stopPropagation();
          showContextMenu(evt, c.id);
        });
        groupEl.appendChild(el);
      });

      historyList.appendChild(groupEl);
    });
  }

  function debounce(fn, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  if (historySearch) {
    const debouncedRenderHistory = debounce(q => renderHistory(q), 250);
    historySearch.addEventListener('input', e => {
      const q = e.target.value;
      if (searchClear) searchClear.style.display = q ? 'block' : 'none';
      debouncedRenderHistory(q);
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      historySearch.value = '';
      searchClear.style.display = 'none';
      renderHistory('');
    });
  }

  /* ── CONTEXT MENU ───────────────────────────────────────────── */
  function showContextMenu(e, id) {
    const existing = document.querySelector('.history-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'history-context-menu';
    menu.innerHTML = `
      <button class="context-menu-btn" data-action="rename">✏️ Ganti Nama</button>
      <button class="context-menu-btn danger" data-action="delete">🗑️ Hapus</button>`;

    menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
      menu.remove();
      triggerRename(id);
    });
    menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
      menu.remove();
      triggerDelete(id);
    });

    document.body.appendChild(menu);

    const rect = e.target.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top  = `${Math.min(rect.bottom + 4, window.innerHeight - 90)}px`;
    menu.style.left = `${Math.max(rect.left - 110, 8)}px`;

    const close = evt => {
      if (!menu.contains(evt.target)) {
        menu.remove();
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 50);
  }

  function triggerRename(id) {
    const conv = svc.get(id);
    if (!conv) return;
    const newTitle = prompt('Ganti judul percakapan:', conv.title);
    if (newTitle !== null && newTitle.trim()) {
      svc.rename(id, newTitle);
      renderHistory();
    }
  }

  function triggerDelete(id) {
    pendingDeleteId = id;
    openModal('delete-modal');
  }

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', () => {
      if (pendingDeleteId) {
        svc.delete(pendingDeleteId);
        if (activeConvId === pendingDeleteId) {
activeConvId = null;
    safeRemove(ACTIVE_ID_KEY);
    showEmpty();
        }
        renderHistory();
      }
      window.closeDeleteModal();
    });
  }

  /* ── LOAD CONVERSATION ──────────────────────────────────────── */
  function loadConversation(id) {
    const conv = svc.get(id);
    if (!conv) return;

    activeConvId = id;
    safeSet(ACTIVE_ID_KEY, id);

    hideEmpty();
    if (chatBox) {
      chatBox.innerHTML = '';
      if (Array.isArray(conv.messages)) {
        conv.messages.forEach(msg => {
          if (msg) {
            chatBox.appendChild(buildRow(msg.role, msg.text || '', msg.created_at, msg.metadata));
          }
        });
      }
    }

    renderHistory();
    closeMobileDrawer();
    scrollToBottom();
    syncRegenButtons();
  }

  function showEmpty() {
    if (!chatBox) return;
    chatBox.innerHTML = '';
    if (emptyState) {
      emptyState.style.display = 'block';
      chatBox.appendChild(emptyState);
    }
  }

  function hideEmpty() {
    if (emptyState) {
      emptyState.style.display = 'none';
      if (chatBox && chatBox.contains(emptyState)) {
        chatBox.removeChild(emptyState);
      }
    }
  }

  /* ── NEW CHAT BUTTON ────────────────────────────────────────── */
  if (newChatBtn) {
    newChatBtn.addEventListener('click', window.handleNewChat);
  }

  function showToast(message) {
    let toast = document.getElementById('app-toast-alert');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast-alert';
      toast.style.cssText = `
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99999;
        background: #1e293b;
        color: #f8fafc;
        border: 1px solid #3b82f6;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
        padding: 10px 18px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        opacity: 0;
        pointer-events: none;
      `;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 4000);
  }
  // BUG #3 FIX: Expose to window for inline HTML onclick handlers
  window.showToast = showToast;

  function formatError(rawErr) {
    if (!rawErr) return 'Terjadi kesalahan tidak dikenal pada server.';
    const msg = typeof rawErr === 'string' ? rawErr : (rawErr.error || rawErr.message || JSON.stringify(rawErr));
    const low = msg.toLowerCase();

    if (low.includes('403') || low.includes('leaked') || low.includes('permission_denied') || low.includes('api key')) {
      return '⚠️ Kunci API (API Key) telah diblokir atau tidak valid. Silakan perbarui API Key Anda di Vercel/Environment Variables.';
    }
    if (low.includes('429') || low.includes('resource_exhausted') || low.includes('terlalu banyak permintaan')) {
      return '⏳ Batas penggunaan API tercapai (Rate Limit). Silakan tunggu 1 menit sebelum mencoba lagi.';
    }
    if (low.includes('500') || low.includes('internal server error')) {
      return '⚙️ Terjadi gangguan sementara pada server AI. Silakan coba beberapa saat lagi.';
    }
    return msg;
  }

  // Page Lifecycle & Visibility Safety: Unfreeze input/button if page is reopened or restored
  function ensureUnlockedState() {
    if (isGenerating && window._generatingStartTime && (Date.now() - window._generatingStartTime > 20000)) {
      setLoading(false);
    } else if (!isGenerating) {
      setLoading(false);
    }
  }

  window.addEventListener('pageshow', ensureUnlockedState);
  window.addEventListener('focus', ensureUnlockedState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ensureUnlockedState();
  });

  /* ── CHAT FORM SUBMISSION ───────────────────────────────────── */
  window.handleChatSubmit = async function () {
    const text = input ? input.value.trim() : '';

    // Watchdog check: force unfreeze if stuck in generating for >20s
    if (isGenerating) {
      if (window._generatingStartTime && (Date.now() - window._generatingStartTime > 20000)) {
        console.warn('Watchdog: Force resetting stuck loading state');
        setLoading(false);
      } else {
        if (text) showToast('⏳ Respons sebelumnya masih diproses, mohon tunggu...');
        return;
      }
    }

    if (!text) return;

    window._generatingStartTime = Date.now();
    hideEmpty();

    let isFirst = false;
    if (!activeConvId || !svc.get(activeConvId)) {
      const conv = svc.create();
      activeConvId = conv.id;
      safeSet(ACTIVE_ID_KEY, activeConvId);
      isFirst = true;
    }

    // ── BUGFIX: Ambil history SEBELUM addMessage agar user message tidak duplikat ──
    const convBeforeSend = svc.get(activeConvId);
    const history = convBeforeSend
      ? convBeforeSend.messages.map(m => ({ role: m.role, text: m.text }))
      : [];
    // Tambahkan pesan user baru ke ujung history yang dikirim ke API
    history.push({ role: 'user', text });

    svc.addMessage(activeConvId, 'user', text);
    if (chatBox) chatBox.appendChild(buildRow('user', text, new Date().toISOString()));
    clearInput();
    setLoading(true);

    const botRow = buildThinkingRow();
    const bubble = botRow.querySelector('.bubble');
    if (chatBox) chatBox.appendChild(botRow);
    scrollToBottom();

    try {
      const { ok, data } = await apiFetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          conversation: history,
          provider: selectedProvider,
          product_context: getActiveProductContext()
        })
      });

      if (ok && data.result) {
        svc.addMessage(activeConvId, 'model', data.result);
        bubble.innerHTML = renderMd(data.result);
        safeHighlight(bubble);

        // Auto-switch provider notice in UI if server used fallback
        if (data.provider && data.provider.includes('fallback')) {
          if (data.provider.includes('openrouter')) {
            showToast('🔥 Gemini & Groq sibuk/kuota habis. Menjawab via OpenRouter (Cadangan).');
          } else if (data.provider.includes('groq')) {
            showToast('⚡ Gemini error/kuota habis. Menjawab via Groq (Cadangan).');
          } else if (data.provider.includes('gemini')) {
            showToast('⚡ Groq error/kuota habis. Menjawab via Gemini 2.5 Flash (Cadangan).');
          }
        }

        if (isFirst) autoTitle(text);
      } else {
        botRow.classList.add('error-row');
        bubble.textContent = formatError(data);
      }
    } catch (err) {
      botRow.classList.add('error-row');
      if (err.name === 'AbortError') {
        bubble.textContent = '⏳ Waktu permintaan habis (Timeout 25 detik). Server AI belum memberikan respons, silakan coba lagi.';
      } else if (isNetworkErr(err)) {
        bubble.textContent = 'Tidak dapat terhubung ke server (kemungkinan sedang restart). UI masih berfungsi — silakan coba kirim lagi.';
        showToast('⚠️ Koneksi ke server terputus.');
      } else {
        bubble.textContent = formatError(err?.message || 'Tidak dapat terhubung ke server.');
      }
    } finally {
      setLoading(false);
      renderHistory();
      scrollToBottom();
      syncRegenButtons();
    }
  };

  if (input) {
    input.addEventListener('input', autoResize);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        window.handleChatSubmit();
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', e => {
      e.preventDefault();
      window.handleChatSubmit();
    });
  }

  function autoResize() {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  }

  if (chatForm) {
    chatForm.addEventListener('submit', e => {
      e.preventDefault();
      window.handleChatSubmit();
    });
  }

  async function autoTitle(firstMsg) {
    try {
      const { data } = await apiFetch('/api/title', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: firstMsg })
      });
      if (data.title && activeConvId) {
        svc.rename(activeConvId, data.title);
        renderHistory();
      }
    } catch (err) {
      console.warn('[autoTitle]', err?.message || err);
    }
  }

  /* ── VIEW SWITCHER (5 MODUL) ───────── */
  window.switchView = function (viewName) {
    const views = KNOWN_VIEWS;
    
    views.forEach(v => {
      let vEl = $(v + '-view');
      if (v === 'chat' && !vEl) {
        vEl = $('chat-area') || document.querySelector('.main-content > .chat-area');
      }
      const tEl = $('tab-' + v);

      if (vEl) {
        vEl.style.display = (v === viewName) ? 'flex' : 'none';
      }
      if (tEl) {
        if (v === viewName) {
          tEl.classList.add('active');
        } else {
          tEl.classList.remove('active');
        }
      }
    });

    // Modul Specific Initialization (Context Sync)
    const activeP = getActiveProductContext();

    if (viewName === 'dashboard') {
      renderDashboard();
    } else if (viewName === 'copywriting') {
      const nameInput = $('cw-product-name');
      if (nameInput && !nameInput.value.trim()) {
        nameInput.value = activeP.variant || activeP.brand || '';
      }
    } else if (viewName === 'brandkit') {
      const nameInput = $('bk-brand-name');
      if (nameInput && !nameInput.value.trim()) {
        nameInput.value = activeP.brand || activeP.variant || '';
      }
    } else if (viewName === 'marketresearch') {
      const nameInput = $('mr-product-name');
      if (nameInput && !nameInput.value.trim()) {
        nameInput.value = activeP.variant || activeP.brand || '';
      }
    } else if (viewName === 'tokopintar') {
      if (typeof window.loadStoreCatalog === 'function') {
        window.loadStoreCatalog();
      }
      updateTpStoreIdentity();
      prefillTpProductForm();
      renderTpQuickPrompts();
      initTokoPintarLinks();
      syncTokoNavTabs();
    } else if (viewName === 'settings') {
      if (typeof initSettingsPanel === 'function') {
        initSettingsPanel();
      }
    }

    if (typeof closeMobileDrawer === 'function') {
      closeMobileDrawer();
    }
    // BUG #12 FIX: Persist active view to localStorage
    safeSet(VIEW_KEY, viewName);
  };

  /* ── DASHBOARD (COMMAND CENTER) ──────────────────────────────── */
  function dashRelTime(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'baru saja';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} menit lalu`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} jam lalu`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} hari lalu`;
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }

  function dashMessageIcon(msg) {
    if (!msg || msg.role === 'user') return 'chat';
    const t = String((msg.metadata && (msg.metadata.type || msg.metadata.source)) || '').toLowerCase();
    if (t.includes('brand')) return 'palette';
    if (t.includes('research') || t.includes('riset')) return 'chart';
    if (t.includes('copy')) return 'pen';
    return 'bot';
  }

  function renderActivityList(el) {
    if (!el) return;
    const recent = svc.getAll().slice(0, 4);
    if (!recent.length) {
      el.innerHTML = '<p class="dash-empty">Belum ada aktivitas. Mulai dengan membuat konten pertamamu.</p>';
      return;
    }
    el.innerHTML = recent.map(c => {
      const last = (c.messages && c.messages.length) ? c.messages[c.messages.length - 1] : null;
      const isUser = last && last.role === 'user';
      const preview = (last && (last.text || '').trim()) || '';
      const ic = dashMessageIcon(last);
      return `
        <button type="button" class="dash-activity-item" onclick="window.openConversationFromDashboard('${escHtml(String(c.id))}')">
          <span class="dash-activity-icon ic-${ic}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#ic-${ic}"></use></svg>
          </span>
          <span class="dash-activity-txt">
            <span class="dash-activity-title">${escHtml(c.title)}</span>
            <span class="dash-activity-preview">${isUser ? 'Kamu: ' : ''}${escHtml(preview).slice(0, 90)}</span>
          </span>
          <span class="dash-activity-time">${dashRelTime(c.updated_at)}</span>
        </button>`;
    }).join('');
  }

  function renderDashboard() {
    const p = getActiveProductContext();
    const brandEl   = $('dash-product-brand');
    const variantEl = $('dash-product-variant');
    if (brandEl) {
      brandEl.textContent = (p.brand || p.variant || '').toUpperCase() || 'PRODUK UMUM';
    }
    if (variantEl) {
      variantEl.textContent = p.variant
        ? `${p.variant}${p.brand ? ' — ' + p.brand : ''}`
        : (p.brand ? 'Tanpa varian khusus' : 'Belum ada produk aktif — semua tool memakai konteks umum.');
    }
    renderActivityList($('dash-activity-list'));
  }

  window.openConversationFromDashboard = function (id) {
    loadConversation(id);
    if (typeof window.switchView === 'function') window.switchView('chat');
  };

  /* Highlight sidebar Toko sesuai subtab aktif (Produk&Katalog vs AI Customer Service) */
  function syncTokoNavTabs() {
    const subCatalog = $('tp-subview-catalog');
    const tTok = $('tab-tokopintar');
    const tCs  = $('tab-cs');
    if (!subCatalog || !tTok) return;
    const isCatalog = subCatalog.style.display !== 'none';
    tTok.classList.toggle('active', !!isCatalog);
    if (tCs) tCs.classList.toggle('active', !isCatalog);
  }

  /* ── TOKO PINTAR: IDENTITAS TOKO, SHARE LINK & EMBED CODE ──── */
  const TP_STORE_ID_KEY   = 'mitraku_store_id';
  const TP_STORE_NAME_KEY = 'mitraku_store_name';

  function getTpStoreId() {
    return safeGet(TP_STORE_ID_KEY) || 'default';
  }

  function getTpStoreName() {
    return safeGet(TP_STORE_NAME_KEY) || 'Toko UMKM Pintar';
  }

  function initTpStoreIdentity() {
    const input = $('tp-store-name-input');
    if (input) input.value = getTpStoreName();
  }

  function updateTpStoreIdentity() {
    const name = getTpStoreName();
    const greetStore = $('tp-cs-greet-store');
    if (greetStore) greetStore.textContent = name;
    initTpStoreIdentity();
  }

  window.onTpStoreNameChange = function () {
    const input = $('tp-store-name-input');
    if (input) {
      safeSet(TP_STORE_NAME_KEY, input.value.trim() || 'Toko UMKM Pintar');
    }
    updateTpStoreIdentity();
    initTokoPintarLinks();
  };

  function initTokoPintarLinks() {
    let base = window.location.origin;
    if (!base || base === 'null') {
      base = window.location.protocol + '//' + window.location.host;
    }
    const storeId   = encodeURIComponent(getTpStoreId());
    const storeName = encodeURIComponent(getTpStoreName());
    const chatUrl   = base + '/widget.html?store=' + storeId + '&name=' + storeName;

    const shareLink = $('tp-share-link');
    if (shareLink) shareLink.value = chatUrl;

    const embedCode = $('tp-embed-code');
    if (embedCode) {
      embedCode.value = '<iframe src="' + chatUrl + '" width="380" height="600" style="border:none; position:fixed; bottom:20px; right:20px; z-index:99999; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,0.3);" title="CS Chatbot Toko ' + escHtml(getTpStoreName()) + '"></iframe>';
    }
  }

  window.copyTpShareLink = async function (btn) {
    initTokoPintarLinks();
    const input = $('tp-share-link');
    const val = input ? input.value : '';
    if (!val) {
      showToast('⚠️ Link belum siap, silakan coba lagi.');
      return;
    }
    try {
      await copyToClipboard(val, btn);
      showToast('✓ Link CS Toko berhasil tersalin ke clipboard!');
    } catch (err) {
      showToast('❌ Gagal menyalin link: ' + (err?.message || err));
    }
  };

  window.copyTpEmbedCode = async function (btn) {
    initTokoPintarLinks();
    const textarea = $('tp-embed-code');
    const val = textarea ? textarea.value : '';
    if (!val) {
      showToast('⚠️ Kode embed belum siap, silakan coba lagi.');
      return;
    }
    try {
      await copyToClipboard(val, btn);
      showToast('✓ Kode Embed CS berhasil tersalin ke clipboard!');
    } catch (err) {
      showToast('❌ Gagal menyalin kode embed: ' + (err?.message || err));
    }
  };

  function prefillTpProductForm() {
    const nameInput = $('tp-input-name');
    if (!nameInput || nameInput.value.trim()) return;
    const activeP = getActiveProductContext();
    if (activeP && (activeP.variant || activeP.brand)) {
      nameInput.value = activeP.variant || activeP.brand;
    }
  }

  function renderTpQuickPrompts() {
    const container = $('tp-cs-quick-prompts');
    if (!container) return;
    container.innerHTML = '';

    const list = window.__tpCatalog || [];
    const mkBtn = function (label, query) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tp-quick-btn';
      b.textContent = label;
      b.addEventListener('click', function () { window.sendTpCsQuery(query); });
      container.appendChild(b);
    };

    const names = list.slice(0, 2).map(function (p) { return p.name; });
    if (names.length === 0) {
      mkBtn('💬 Cek stok produk?', 'Apakah masih ada stok produknya?');
      mkBtn('💰 Harga & ongkir?', 'Berapa harga produknya dan bagaimana pengirimannya?');
    } else {
      names.forEach(function (n, i) {
        if (i === 0) mkBtn('💬 Cek stok ' + n + '?', 'Apakah produk ' + n + ' masih ada stoknya?');
        else mkBtn('💰 Harga ' + n + '?', 'Berapa harga ' + n + ' dan bagaimana pengirimannya?');
      });
    }
    mkBtn('❓ Tanya produk yang tidak ada', 'Apakah ada produk baju atau fashion?');
  }

  function tpCsGreetingHTML() {
    return '<div class="message-avatar" style="background: linear-gradient(135deg, #059669, #10b981);">CS</div>' +
      '<div class="message-content-wrap">' +
        '<div class="message-meta">' +
          '<span class="meta-name">Customer Service AI</span>' +
          '<span class="meta-time">Online 24/7</span>' +
        '</div>' +
        '<div class="bubble" id="tp-cs-greeting">' +
          'Halo Kak! 👋 Selamat datang di <strong id="tp-cs-greet-store">' + escHtml(getTpStoreName()) + '</strong>. Ada yang bisa saya bantu terkait produk, stok, harga, atau pengiriman kami?' +
        '</div>' +
      '</div>';
  }

  window.resetTpCsChat = function () {
    tpCsConversationHistory = [];
    const chatBox = $('tp-cs-chat-box');
    if (!chatBox) return;
    chatBox.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = tpCsGreetingHTML();
    chatBox.appendChild(row);
    showToast('🧹 Percakapan CS dimulai ulang.');
  };

  window.setCatalogProductActive = function (id) {
    const list = window.__tpCatalog || [];
    const p = list.find(function (x) { return x.id === id; });
    if (!p) return;
    const obj = { brand: '', variant: p.name, legalities: '' };
    safeSet(PRODUCT_KEY, JSON.stringify(obj));
    if (typeof initActiveProduct === 'function') initActiveProduct();
    if (activeConvId) {
      const conv = svc.get(activeConvId);
      if (conv) { conv.product_context = obj; svc._save(); }
    }
    showToast('⭐ "' + p.name + '" dijadikan produk aktif.');
    if (typeof window.switchView === 'function') window.switchView('chat');
  };

  // Platform & Personality radio option visual selection
  document.querySelectorAll('.platform-option input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', function () {
      const group = this.closest('.platform-selector-group') || this.closest('.platform-option').parentNode;
      group.querySelectorAll('.platform-option').forEach(opt => opt.classList.remove('active'));
      if (this.checked) {
        const optionLabel = this.closest('.platform-option');
        if (optionLabel) optionLabel.classList.add('active');
      }
    });
  });

  /* Clear stale Copywriting results when platform is switched */
  document.querySelectorAll('input[name="cw-platform"]').forEach(radio => {
    radio.addEventListener('change', function () {
      const content = $('cw-result-content');
      const empty   = $('cw-result-empty');
      const cards   = $('cw-cards-container');
      if (content && content.style.display === 'block') {
        content.style.display = 'none';
        if (cards) cards.innerHTML = '';
        if (empty) empty.style.display = 'flex';
      }
    });
  });

  /* ── MODUL 4: COPYWRITING FACTORY LOGIC ─────────────────────── */
  window.handleCopywritingSubmit = async function (e) {
    if (e && e.preventDefault) e.preventDefault();

    const productName = $('cw-product-name')?.value.trim();
    const advantages  = $('cw-advantages')?.value.trim();
    const targetAud   = $('cw-target-audience')?.value.trim();
    const platformEl  = document.querySelector('input[name="cw-platform"]:checked');
    const platform    = platformEl ? platformEl.value : 'shopee';

    if (!productName) {
      showToast('⚠️ Masukkan nama produk atau brand terlebih dahulu.');
      return;
    }

    const emptyState     = $('cw-result-empty');
    const loadingState   = $('cw-result-loading');
    const contentWrapper = $('cw-result-content');
    const submitBtn      = $('cw-submit-btn');

    if (emptyState)     emptyState.style.display     = 'none';
    if (contentWrapper) contentWrapper.style.display = 'none';
    if (loadingState)   loadingState.style.display   = 'flex';

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.querySelector('.btn-cw-text').textContent = 'Sedang Meracik Copywriting...';
    }
    setRegenBusy('cw-regen-btn', true);

    try {
      const { ok, data } = await apiFetch('/api/copywriting', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          product_name: productName,
          advantages,
          target_audience: targetAud,
          platform
        })
      });

      if (ok && data.success && data.result) {
        renderCopywritingResults(platform, data.result);
        if (loadingState)   loadingState.style.display   = 'none';
        if (contentWrapper) contentWrapper.style.display = 'block';
        showToast('🎉 Copywriting berhasil dibuat!');
      } else {
        showToast('❌ ' + formatError(data));
        if (loadingState) loadingState.style.display = 'none';
        if (emptyState)   emptyState.style.display   = 'flex';
      }
    } catch (err) {
      showToast('❌ Tidak dapat terhubung ke server: ' + (err?.message || err));
      if (loadingState) loadingState.style.display = 'none';
      if (emptyState)   emptyState.style.display   = 'flex';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-cw-text').textContent = 'Hasilkan Copywriting AI';
      }
      setRegenBusy('cw-regen-btn', false);
    }
  };

  function renderCopywritingResults(platform, result) {
    const badgeEl     = $('cw-result-platform-badge');
    const containerEl = $('cw-cards-container');
    const copyAllBtn  = $('cw-copy-all-btn');

    if (!containerEl) return;
    containerEl.innerHTML = '';

    const PLATFORM_INFO = {
      shopee:    { name: 'Shopee / Tokopedia', icon: '🛒', badgeClass: 'badge-shopee' },
      tiktok:    { name: 'TikTok Shop', icon: '🎵', badgeClass: 'badge-tiktok' },
      instagram: { name: 'Instagram', icon: '📸', badgeClass: 'badge-instagram' }
    };

    const info = PLATFORM_INFO[platform] || PLATFORM_INFO.shopee;
    if (badgeEl) {
      badgeEl.textContent = `${info.icon} ${info.name}`;
      badgeEl.className = `cw-platform-badge ${info.badgeClass}`;
    }

    let allTextCombined = [];

    // Helper to create card
    const createCard = (title, contentText, icon = '📌', isCode = false) => {
      allTextCombined.push(`=== ${title} ===\n${contentText}\n`);
      const card = document.createElement('div');
      card.className = 'cw-card';
      
      const header = document.createElement('div');
      header.className = 'cw-card-header';
      header.innerHTML = `
        <span class="cw-card-title">${icon} ${escHtml(title)}</span>
        <button type="button" class="btn-copy-card">📋 Salin</button>
      `;

      const body = document.createElement('div');
      body.className = 'cw-card-body';
      
      if (isCode) {
        body.innerHTML = `<pre class="cw-code-block"><code>${escHtml(contentText)}</code></pre>`;
      } else {
        body.innerHTML = `<p class="cw-text-content">${escHtml(contentText).replace(/\n/g, '<br>')}</p>`;
      }

      card.appendChild(header);
      card.appendChild(body);

      header.querySelector('.btn-copy-card').addEventListener('click', function () {
        copyToClipboard(contentText).then(() => {
          this.textContent = '✓ Tersalin!';
          setTimeout(() => { this.textContent = '📋 Salin'; }, 2000);
        });
      });

      return card;
    };

    if (platform === 'shopee') {
      if (result.judul_produk) {
        containerEl.appendChild(createCard('Judul Produk SEO', result.judul_produk, '📌'));
      }
      if (result.deskripsi) {
        containerEl.appendChild(createCard('Deskripsi Produk Persuasif', result.deskripsi, '📝'));
      }
      if (Array.isArray(result.bullet_keunggulan) && result.bullet_keunggulan.length > 0) {
        const bulletsText = result.bullet_keunggulan.map((b, i) => `${i + 1}. ${b}`).join('\n');
        containerEl.appendChild(createCard('Poin Keunggulan Utama', bulletsText, '✨'));
      }
      if (Array.isArray(result.hashtag) && result.hashtag.length > 0) {
        containerEl.appendChild(createCard('Hashtag Shopee Popular', result.hashtag.join(' '), '🏷️'));
      }
    } else if (platform === 'tiktok') {
      if (result.hook) {
        containerEl.appendChild(createCard('Hook Video (3 Detik Pertama)', result.hook, '🪝'));
      }
      if (result.skrip_lengkap) {
        containerEl.appendChild(createCard('Skrip Narasi Video (30-45 Detik)', result.skrip_lengkap, '🎬'));
      }
      if (result.caption) {
        containerEl.appendChild(createCard('Caption TikTok Shop', result.caption, '✍️'));
      }
      if (result.ide_sound || (Array.isArray(result.hashtag) && result.hashtag.length > 0)) {
        const soundText = `IDE SOUND: ${result.ide_sound || '-'}\n\nHASHTAG VIRAL:\n${(result.hashtag || []).join(' ')}`;
        containerEl.appendChild(createCard('Ide Sound & Hashtag Viral', soundText, '🎵'));
      }
    } else if (platform === 'instagram') {
      if (result.caption_utama) {
        containerEl.appendChild(createCard('Caption Utama (Storytelling)', result.caption_utama, '🌟'));
      }
      if (result.caption_alternatif) {
        containerEl.appendChild(createCard('Caption Alternatif (Variasi)', result.caption_alternatif, '🔄'));
      }
      if (result.cta) {
        containerEl.appendChild(createCard('Call to Action (CTA)', result.cta, '🎯'));
      }
      if (Array.isArray(result.ide_carousel) && result.ide_carousel.length > 0) {
        const carouselText = result.ide_carousel.map((s, i) => `[Slide ${i + 1}] ${s}`).join('\n');
        containerEl.appendChild(createCard('Rencana Slides Carousel IG', carouselText, '📸'));
      }
      if (Array.isArray(result.hashtag_niche) || Array.isArray(result.hashtag_umum)) {
        const hashText = `HASHTAG NICHE:\n${(result.hashtag_niche || []).join(' ')}\n\nHASHTAG UMUM:\n${(result.hashtag_umum || []).join(' ')}`;
        containerEl.appendChild(createCard('Hashtag Target Market', hashText, '#️⃣'));
      }
    }

    if (copyAllBtn) {
      copyAllBtn.onclick = function () {
        const fullString = allTextCombined.join('\n----------------------------------------\n');
        copyToClipboard(fullString).then(() => {
          this.textContent = '✓ Semua Tersalin!';
          setTimeout(() => { this.textContent = '📋 Salin Semua Content'; }, 2000);
        });
      };
    }
  };

  window.regenerateLastResponse = async function () {
    if (isGenerating) {
      showToast('⏳ Respons sebelumnya masih diproses, mohon tunggu...');
      return;
    }
    if (!activeConvId) return;

    const conv = svc.get(activeConvId);
    if (!conv || !Array.isArray(conv.messages) || conv.messages.length === 0) return;

    // Remove the last model message if present
    if (conv.messages[conv.messages.length - 1].role === 'model') {
      conv.messages.pop();
      svc._save();
    }

    if (conv.messages.length === 0) return;

    // Re-render conversation up to user prompt
    loadConversation(activeConvId);
    setLoading(true);

    const botRow = buildThinkingRow();
    const bubble = botRow.querySelector('.bubble');
    if (chatBox) chatBox.appendChild(botRow);
    scrollToBottom();

    const history = conv.messages.map(m => ({ role: m.role, text: m.text }));
try {
      const { ok, data } = await apiFetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          conversation: history,
          provider: selectedProvider,
          product_context: getActiveProductContext()
        })
      });

      if (ok && data.result) {
        svc.addMessage(activeConvId, 'model', data.result);
        bubble.innerHTML = renderMd(data.result);
        safeHighlight(bubble);
        showToast('↻ Respons berhasil diperbarui!');
      } else {
        botRow.classList.add('error-row');
        bubble.textContent = formatError(data);
      }
    } catch (err) {
      botRow.classList.add('error-row');
      if (isNetworkErr(err)) {
        bubble.textContent = 'Tidak dapat terhubung ke server (kemungkinan sedang restart). Coba lagi.';
      } else {
        bubble.textContent = formatError(err?.message || 'Tidak dapat terhubung ke server.');
      }
    } finally {
      setLoading(false);
      renderHistory();
      scrollToBottom();
      syncRegenButtons();
    }
  };

  /* ── MESSAGE ROW BUILDERS ───────────────────────────────────── */
  function buildRow(role, text, timeStr, metadata) {
    const isUser = role === 'user';
    const row    = document.createElement('div');
    row.className = `message-row ${isUser ? 'user-row' : 'bot-row'}`;

    const time = timeStr ? fmt(new Date(timeStr)) : fmt(new Date());

    row.innerHTML = `
      <div class="message-avatar">${isUser ? 'U' : 'K'}</div>
      <div class="message-content-wrap">
        <div class="message-meta">
          <span class="meta-name">${isUser ? 'Anda' : 'MitraKu AI'}</span>
          <span class="meta-time">${time}</span>
        </div>
        <div class="bubble"></div>
        ${!isUser ? `<div class="message-actions">
          <button class="action-btn copy-msg-btn" title="Salin pesan">📋 Salin</button>
          <button class="action-btn regen-btn" title="Buat ulang">↻ Buat Ulang</button>
        </div>` : ''}
      </div>`;

    const bubble = row.querySelector('.bubble');
    if (isUser) {
      bubble.textContent = text;
    } else {
      bubble.innerHTML = renderMd(text);
      safeHighlight(bubble);
    }

    if (!isUser) {
      const copyBtn = row.querySelector('.copy-msg-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          window.copyMessageText(this);
        });
      }
      const regenBtn = row.querySelector('.regen-btn');
      if (regenBtn) {
        regenBtn.addEventListener('click', () => {
          window.regenerateLastResponse();
        });
      }
    }

    return row;
  }

  function buildThinkingRow() {
    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = `
      <div class="message-avatar">K</div>
      <div class="message-content-wrap">
        <div class="message-meta">
          <span class="meta-name">MitraKu AI</span>
          <span class="meta-time">${fmt(new Date())}</span>
        </div>
        <div class="bubble">
          <div class="thinking">
            <span>Sedang menyiapkan respons</span>
            <span class="tdot"></span><span class="tdot"></span><span class="tdot"></span>
          </div>
        </div>
      </div>`;
    return row;
  }

  /* Show "Buat Ulang" only on the most recent bot message */
  function syncRegenButtons() {
    if (!chatBox) return;
    const botRows = chatBox.querySelectorAll('.message-row.bot-row');
    const lastBot = botRows[botRows.length - 1] || null;
    botRows.forEach(row => {
      const btn = row.querySelector('.regen-btn');
      if (btn) btn.style.display = (row === lastBot) ? '' : 'none';
    });
  }

  /* ── MARKDOWN RENDERER ──────────────────────────────────────── */
  function renderMd(raw) {
    if (typeof raw !== 'string') return '';
    const blocks = [];
    let text = raw.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const l = lang || 'text';
      blocks.push(`<pre><div class="code-header"><span class="code-lang">${l}</span><button class="copy-btn" onclick="copyCode(this)">Salin</button></div><code class="language-${l}">${escHtml(code.trim())}</code></pre>`);
      return `\x00CB${blocks.length - 1}\x00`;
    });

    text = escHtml(text);
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
      const safeUrl = url.replace(/javascript:|data:|vbscript:/gi, '').replace(/["']/g, '');
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
    text = text.replace(/\*(.+?)\*/g,          '<em>$1</em>');
    text = text.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    text = text.replace(/^##\s+(.+)$/gm,  '<h2>$1</h2>');
    text = text.replace(/^#\s+(.+)$/gm,   '<h1>$1</h1>');

    const lines = text.split('\n');
    const out   = [];
    let inList  = false;
    let listTag = '';

    for (const line of lines) {
      const ul = line.match(/^(\s*)[-*]\s+(.*)/);
      const ol = line.match(/^(\s*)\d+\.\s+(.*)/);
      if (ul) {
        if (!inList || listTag !== 'ul') {
          if (inList) out.push(`</${listTag}>`);
          out.push('<ul>'); inList = true; listTag = 'ul';
        }
        out.push(`<li>${ul[2]}</li>`);
      } else if (ol) {
        if (!inList || listTag !== 'ol') {
          if (inList) out.push(`</${listTag}>`);
          out.push('<ol>'); inList = true; listTag = 'ol';
        }
        out.push(`<li>${ol[2]}</li>`);
      } else {
        if (inList) { out.push(`</${listTag}>`); inList = false; }
        out.push(line);
      }
    }
    if (inList) out.push(`</${listTag}>`);

    let html = out.join('\n')
      .split(/\n{2,}/)
      .map(blk => {
        blk = blk.trim();
        if (!blk) return '';
        if (/^(<ul|<ol|<h[123]|<pre|\x00CB)/.test(blk)) return blk;
        return `<p>${blk.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');

    return html.replace(/\x00CB(\d+)\x00/g, (_, i) => blocks[+i]);
  }

  /* ── UTILITIES ──────────────────────────────────────────────── */
  /* Fetch dengan abort timeout yang tetap hidup SAMPAI body selesai dibaca,
     supaya `res.json()` yang menggantung (server restart) tidak mengunci UI. */
  async function apiFetch(url, options = {}, timeout = 25000, bodyParser = res => res.json()) {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), timeout);
    try {
      const res  = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
      const data = await bodyParser(res);
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new DOMException('Waktu permintaan habis (' + Math.round(timeout / 1000) + ' detik). Silakan coba lagi.', 'AbortError');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* Deteksi error koneksi (beda dengan timeout): server restart / offline. */
  function isNetworkErr(err) {
    if (/AbortError|TimeoutError/.test(err?.name || '')) return false;
    if (navigator.onLine === false) return true;
    return err instanceof TypeError
      || /failed to fetch|networkerror|network error|load failed|ECONNREFUSED|connection/i.test(err?.message || '');
  }

  /* Highlight kode aman: lewati blok raksasa supaya hljs tidak mengunci UI. */
  function safeHighlight(container) {
    if (!window.hljs || !container) return;
    container.querySelectorAll('pre code').forEach(el => {
      if (((el.textContent || '').length) > 20000) return;
      try { window.hljs.highlightElement(el); } catch (err) { /* abaikan */ }
    });
  }

  function escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  window.copySectionedReport = async function (containerId, btnEl) {
    const container = $(containerId);
    if (!container) return;
    const cards = container.querySelectorAll('.cw-card');
    if (!cards.length) { showToast('Belum ada hasil untuk disalin.'); return; }
    const parts = [];
    cards.forEach(card => {
      const title = card.querySelector('.cw-card-title');
      const body  = card.querySelector('.cw-card-body');
      let bodyText = body ? body.innerText.replace(/[ \t]+/g, ' ').trim() : '';
      bodyText = bodyText.replace(/\n{3,}/g, '\n\n');
      parts.push(`=== ${title ? title.textContent.trim() : 'Hasil'} ===\n${bodyText}`);
    });
    const full = parts.join('\n\n------------------------------\n\n');
    copyToClipboard(full).then(() => {
      if (btnEl) {
        const orig = btnEl.textContent;
        btnEl.textContent = '✓ Tersalin!';
        setTimeout(() => { btnEl.textContent = orig; }, 2000);
      }
      showToast('✓ Laporan tersalin!');
    });
  };

  function fmt(d) {
    if (!d || isNaN(d.getTime())) {
      d = new Date();
    }
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  function clearInput() {
    if (input) { input.value = ''; input.style.height = 'auto'; }
  }

  function setLoading(on) {
    isGenerating = on;
    window._generatingStartTime = on ? Date.now() : 0;
    if (sendBtn) sendBtn.disabled = on;
    if (input)   input.disabled   = on;
    if (!on && input) input.focus();
  }

  function setRegenBusy(btnId, busy) {
    const btn = btnId && $(btnId);
    if (btn) btn.disabled = busy;
  }

  function scrollToBottom() {
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
  }

  /* ── MODUL 3: BRAND KIT BUILDER LOGIC ───────────────────────── */
  let currentBrandKitData = null;

  window.handleBrandKitSubmit = async function (e) {
    if (e && e.preventDefault) e.preventDefault();

    const brandName   = $('bk-brand-name')?.value.trim();
    const productType = $('bk-product-type')?.value.trim();
    const personalityEl = document.querySelector('input[name="bk-personality"]:checked');
    const personality   = personalityEl ? personalityEl.value : 'Modern & Minimalis';

    if (!brandName) {
      showToast('⚠️ Masukkan nama usaha atau brand terlebih dahulu.');
      return;
    }

    const emptyState     = $('bk-result-empty');
    const loadingState   = $('bk-result-loading');
    const contentWrapper = $('bk-result-content');
    const submitBtn      = $('bk-submit-btn');

    if (emptyState)     emptyState.style.display     = 'none';
    if (contentWrapper) contentWrapper.style.display = 'none';
    if (loadingState)   loadingState.style.display   = 'flex';

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.querySelector('.btn-cw-text').textContent = 'Sedang Meracik Brand Kit...';
    }
    setRegenBusy('bk-regen-btn', true);

    try {
      const { ok, data } = await apiFetch('/api/brand-kit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          brand_name: brandName,
          product_type: productType,
          personality,
          product_context: getActiveProductContext()
        })
      });

      if (ok && data.success && data.result) {
        currentBrandKitData = data.result;
        renderBrandKitResults(data.result);
        if (loadingState)   loadingState.style.display   = 'none';
        if (contentWrapper) contentWrapper.style.display = 'block';
        showToast('🎉 Brand Kit berhasil dibuat!');
      } else {
        showToast('❌ ' + formatError(data));
        if (loadingState) loadingState.style.display = 'none';
        if (emptyState)   emptyState.style.display   = 'flex';
      }
    } catch (err) {
      showToast('❌ Tidak dapat terhubung ke server: ' + (err?.message || err));
      if (loadingState) loadingState.style.display = 'none';
      if (emptyState)   emptyState.style.display   = 'flex';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-cw-text').textContent = 'Hasilkan Brand Kit AI';
      }
      setRegenBusy('bk-regen-btn', false);
    }
  };

  function renderBrandKitResults(result) {
    const containerEl  = $('bk-cards-container');
    const titleEl      = $('bk-result-title');
    const brandBadgeEl = $('bk-result-brand-badge');

    if (!containerEl) return;
    containerEl.innerHTML = '';

    if (titleEl)      titleEl.textContent = result.brand_name || 'MitraKu Brand Guide';
    if (brandBadgeEl) brandBadgeEl.textContent = `🎨 ${result.brand_name || 'Brand Kit'}`;

    // 1. Taglines & Brand Story Card
    const cardStory = document.createElement('div');
    cardStory.className = 'cw-card';
    
    let taglinesHTML = '';
    if (Array.isArray(result.tagline_options)) {
      taglinesHTML = '<div class="taglines-wrapper" style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">' +
        result.tagline_options.map(t => `
          <div class="tagline-pill-item" style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-app); padding:10px 14px; border-radius:var(--r-lg); border:1px solid var(--border-subtle);">
            <span style="font-size:13px; font-weight:600; color:var(--text-main);">✦ "${escHtml(t)}"</span>
            <button type="button" class="btn-copy-card" onclick="copyToClipboard('${escHtml(t)}').then(()=>showToast('✓ Tagline tersalin!'))">📋 Salin</button>
          </div>
        `).join('') + '</div>';
    }

    cardStory.innerHTML = `
      <div class="cw-card-header">
        <span class="cw-card-title">💡 Tagline &amp; Cerita Brand</span>
        <button type="button" class="btn-copy-card" onclick="copyToClipboard('${escHtml(result.brand_story || '')}').then(()=>showToast('✓ Cerita brand tersalin!'))">📋 Salin Cerita</button>
      </div>
      <div class="cw-card-body">
        <div style="margin-bottom:12px; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Rekomendasi Tagline:</div>
        ${taglinesHTML}
        <div style="margin:16px 0 6px; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Cerita Brand (Storytelling):</div>
        <p class="cw-text-content" style="background:var(--bg-app); padding:14px; border-radius:var(--r-lg); border-left:4px solid var(--brand-500);">${escHtml(result.brand_story || '')}</p>
      </div>
    `;
    containerEl.appendChild(cardStory);

    // 2. Color Swatches Palette Card
    if (Array.isArray(result.color_palette) && result.color_palette.length > 0) {
      const cardPalette = document.createElement('div');
      cardPalette.className = 'cw-card';
      
      let swatchesHTML = '<div class="color-swatch-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:12px; margin-top:8px;">';
      result.color_palette.forEach(c => {
        swatchesHTML += `
          <div class="color-swatch-card" onclick="copyToClipboard('${c.hex}').then(()=>showToast('✓ HEX ${c.hex} tersalin!'))" style="background:${c.hex}; padding:14px; border-radius:var(--r-xl); cursor:pointer; color:${isColorDark(c.hex) ? '#ffffff' : '#0f172a'}; box-shadow:0 2px 8px rgba(0,0,0,0.12); transition:transform 0.2s;" title="Klik untuk salin kode HEX ${c.hex}">
            <div style="font-weight:800; font-size:13px;">${escHtml(c.name)}</div>
            <div style="font-size:12px; font-family:monospace; opacity:0.95; margin-top:4px;">${escHtml(c.hex)}</div>
            <div style="font-size:10px; opacity:0.8; margin-top:8px;">${escHtml(c.usage)}</div>
          </div>
        `;
      });
      swatchesHTML += '</div>';

      cardPalette.innerHTML = `
        <div class="cw-card-header">
          <span class="cw-card-title">🎨 Palet Warna Identitas Brand (Klik Swatch untuk Salin HEX)</span>
        </div>
        <div class="cw-card-body">
          ${swatchesHTML}
        </div>
      `;
      containerEl.appendChild(cardPalette);
    }

    // 3. Typography & Content Pillars Card Grid
    const cardCombo = document.createElement('div');
    cardCombo.className = 'cw-card';

    let typographyHTML = '';
    if (result.typography) {
      typographyHTML = `
        <div style="background:var(--bg-app); padding:14px; border-radius:var(--r-lg); border:1px solid var(--border-subtle);">
          <div style="font-size:13px; font-weight:700; color:var(--text-main);">Heading: <span style="color:var(--brand-600);">${escHtml(result.typography.heading_font || '-')}</span></div>
          <div style="font-size:13px; font-weight:700; color:var(--text-main); margin-top:4px;">Body: <span style="color:var(--brand-600);">${escHtml(result.typography.body_font || '-')}</span></div>
          <p style="font-size:12px; color:var(--text-muted); margin-top:8px; line-height:1.4;">${escHtml(result.typography.vibe_description || '')}</p>
        </div>
      `;
    }

    let pillarsHTML = '';
    if (Array.isArray(result.content_pillars)) {
      pillarsHTML = '<div style="display:flex; flex-direction:column; gap:8px;">' +
        result.content_pillars.map((p, i) => `
          <div style="background:var(--bg-app); padding:10px 14px; border-radius:var(--r-lg); font-size:12.5px; font-weight:600; color:var(--text-main); border:1px solid var(--border-subtle);">
            ${i + 1}. ${escHtml(p)}
          </div>
        `).join('') + '</div>';
    }

    cardCombo.innerHTML = `
      <div class="cw-card-header">
        <span class="cw-card-title">🔤 Tipografi &amp; 📌 Pilar Konten Marketing</span>
      </div>
      <div class="cw-card-body" style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div>
          <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Karakter Tipografi:</div>
          ${typographyHTML}
        </div>
        <div>
          <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Pilar Konten Medsos:</div>
          ${pillarsHTML}
        </div>
      </div>
    `;
    containerEl.appendChild(cardCombo);
  }

  window.downloadBrandKitPNG = async function () {
    if (!currentBrandKitData) {
      showToast('⚠️ Generate Brand Kit terlebih dahulu.');
      return;
    }

    const downloadBtn = $('bk-download-png-btn');
    if (downloadBtn) {
      downloadBtn.disabled = true;
      downloadBtn.textContent = '⏳ Merender PNG...';
    }

    try {
      const { ok, data: body } = await apiFetch('/api/brand-kit/render-png', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ brand_kit: currentBrandKitData })
      }, 60000, r => r.ok ? r.blob() : r.json().catch(() => null));

      if (ok) {
        const url = window.URL.createObjectURL(body);
        const a = document.createElement('a');
        a.href = url;
        a.download = `BrandKit_${(currentBrandKitData.brand_name || 'UMKM').replace(/\s+/g, '_')}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast('🎉 Visual Brand Kit PNG berhasil di-download!');
      } else {
        showToast('❌ ' + formatError(body?.error || 'Gagal merender PNG.'));
      }
    } catch (err) {
      showToast('❌ Gagal download PNG: ' + (err?.message || err));
    } finally {
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.textContent = '⬇ Download Visual PNG';
      }
    }
  };

  function isColorDark(hex) {
    if (!hex || typeof hex !== 'string') return true;
    const cleanHex = hex.replace('#', '');
    if (cleanHex.length !== 6) return true;
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }

  /* ── MODUL 1: TOKO PINTAR AI (PENGETAHUAN AI) LOGIC ──────────── */
  let tpCsConversationHistory = [];

  window.switchTpSubView = function (subName) {
    const subCatalog = $('tp-subview-catalog');
    const subChat    = $('tp-subview-chat');
    const subEmbed   = $('tp-subview-embed');
    const tabCat     = $('tp-tab-catalog');
    const tabChat    = $('tp-tab-chat');
    const tabEmb     = $('tp-tab-embed');

    [subCatalog, subChat, subEmbed].forEach(s => { if (s) s.style.display = 'none'; });
    [tabCat, tabChat, tabEmb].forEach(t => { if (t) t.classList.remove('active'); });

    if (subName === 'chat') {
      if (subChat) subChat.style.display = 'flex';
      if (tabChat) tabChat.classList.add('active');
    } else if (subName === 'embed') {
      if (subEmbed) subEmbed.style.display = 'block';
      if (tabEmb)   tabEmb.classList.add('active');
      initTokoPintarLinks();
    } else {
      if (subCatalog) subCatalog.style.display = 'grid';
      if (tabCat)     tabCat.classList.add('active');
    }
    syncTokoNavTabs();
  };

  async function loadStoreCatalog() {
    const container = $('tp-catalog-list-container');
    const countEl   = $('tp-catalog-count');

    if (!container) return;

    // UI/UX enhancement: Show animated skeleton cards while fetching
    container.innerHTML = `
      <div class="skeleton-card">
        <div class="skeleton-box skeleton-line h-title w-1-2"></div>
        <div class="skeleton-box skeleton-line w-full"></div>
        <div class="skeleton-box skeleton-line w-3-4"></div>
      </div>
      <div class="skeleton-card">
        <div class="skeleton-box skeleton-line h-title w-1-2"></div>
        <div class="skeleton-box skeleton-line w-full"></div>
        <div class="skeleton-box skeleton-line w-3-4"></div>
      </div>
    `;

    try {
      const { ok, data } = await apiFetch('/api/toko-pintar/catalog');

      if (ok && data.success && Array.isArray(data.catalog)) {
        if (countEl) countEl.textContent = data.catalog.length;
        const csKnow = $('tp-cs-knowledge-count');
        if (csKnow) csKnow.textContent = data.catalog.length;
        window.__tpCatalog = data.catalog;
        renderCatalogList(data.catalog);
      }
    } catch (err) {
      console.warn('[loadStoreCatalog]', err?.message || err);
    }
  }

  function renderCatalogList(list) {
    const container = $('tp-catalog-list-container');
    if (!container) return;

    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = `
        <div class="cw-empty-state" style="padding: 36px 16px; border: 2px dashed var(--border-subtle); border-radius: var(--r-2xl);">
          <div class="cw-empty-icon" style="font-size: 42px; margin-bottom: 12px;">📦</div>
          <h3 style="font-size: 16px; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">Belum Ada Produk di Katalog</h3>
          <p style="font-size: 13px; color: var(--text-muted); max-width: 360px; margin: 0 auto 16px;">Tambahkan produk pertama toko Anda lewat formulir di sebelah kiri agar Customer Service AI dapat menjawab pertanyaan pelanggan secara akurat.</p>
        </div>
      `;
      return;
    }

    list.forEach(p => {
      const card = document.createElement('div');
      card.className = 'cw-card';
      card.innerHTML = `
        <div class="cw-card-header">
          <span class="cw-card-title">📦 ${escHtml(p.name)}</span>
          <div style="display: flex; gap: 6px; align-items: center;">
            <span class="cw-platform-badge" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border-color: rgba(59, 130, 246, 0.2); font-size: 11px;">
              ${escHtml(p.category || 'Umum')}
            </span>
            <button type="button" class="btn-copy-card" style="color: #f59e0b; border-color: rgba(245, 158, 11, 0.35);" onclick="setCatalogProductActive('${escHtml(p.id)}')" title="Jadikan produk aktif untuk semua modul AI">⭐ Aktifkan</button>
            <button type="button" class="btn-copy-card" style="color: #ff4d4d; border-color: rgba(255, 77, 77, 0.3);" onclick="deleteCatalogProduct('${escHtml(p.id)}')">🗑️ Hapus</button>
          </div>
        </div>
        <div class="cw-card-body">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 16px; font-weight: 800; color: var(--brand-600);">Rp ${Number(p.price || 0).toLocaleString('id-ID')}</span>
            <span style="font-size: 12px; font-weight: 700; color: ${p.stock > 0 ? '#10b981' : '#ef4444'};">
              ${p.stock > 0 ? `Stok: ${p.stock} pcs` : '⚠️ Stok Habis'}
            </span>
          </div>
          <p class="cw-text-content" style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">${escHtml(p.description || '-')}</p>
          ${p.shipping_info ? `<div style="font-size: 11.5px; color: var(--text-subtle); background: var(--bg-app); padding: 8px 12px; border-radius: var(--r-md);">🚚 ${escHtml(p.shipping_info)}</div>` : ''}
        </div>
      `;
      container.appendChild(card);
    });
  }

  window.handleAddCatalogProduct = async function (e) {
    if (e && e.preventDefault) e.preventDefault();

    const name     = $('tp-input-name')?.value.trim();
    const category = $('tp-input-category')?.value.trim();
    const price    = $('tp-input-price')?.value;
    const stock    = $('tp-input-stock')?.value;
    const desc     = $('tp-input-desc')?.value.trim();
    const shipping = $('tp-input-shipping')?.value.trim();

    if (!name || !price) {
      showToast('⚠️ Nama produk dan harga wajib diisi.');
      return;
    }

    const addBtn = $('tp-add-btn');
    if (addBtn) addBtn.disabled = true;

    try {
      const { ok, data } = await apiFetch('/api/toko-pintar/catalog', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, category, price, stock, description: desc, shipping_info: shipping })
      });

      if (ok && data.success) {
        showToast('🎉 Produk berhasil ditambahkan ke katalog!');
        $('tp-product-form')?.reset();
        loadStoreCatalog();
      } else {
        showToast('❌ ' + formatError(data));
      }
    } catch (err) {
      showToast('❌ Gagal menambahkan produk: ' + (err?.message || err));
    } finally {
      if (addBtn) addBtn.disabled = false;
    }
  };

  // BUG #10 FIX: Use custom modal instead of native browser confirm()
  window.deleteCatalogProduct = function (id) {
    pendingCatalogDeleteId = id;
    openModal('catalog-delete-modal');
  };

  window.sendTpCsQuery = function (queryText) {
    const input = $('tp-cs-input');
    if (input) {
      input.value = queryText;
      window.handleTpCsSubmit();
    }
  };

  window.handleTpCsSubmit = async function (e) {
    if (e && e.preventDefault) e.preventDefault();

    const input = $('tp-cs-input');
    const query = input ? input.value.trim() : '';

    if (!query) return;

    const chatBox = $('tp-cs-chat-box');
    const sendBtn = $('tp-cs-send-btn');

    // Render User Query Bubble
    const userRow = document.createElement('div');
    userRow.className = 'message-row user-row';
    userRow.innerHTML = `
      <div class="message-avatar">U</div>
      <div class="message-content-wrap">
        <div class="message-meta">
          <span class="meta-name">Pelanggan Toko</span>
          <span class="meta-time">${fmt(new Date())}</span>
        </div>
        <div class="bubble">${escHtml(query)}</div>
      </div>
    `;
    if (chatBox) chatBox.appendChild(userRow);
    if (input) input.value = '';

    // Render Thinking Row
    const botRow = document.createElement('div');
    botRow.className = 'message-row bot-row';
    botRow.innerHTML = `
      <div class="message-avatar" style="background: linear-gradient(135deg, #059669, #10b981);">CS</div>
      <div class="message-content-wrap">
        <div class="message-meta">
          <span class="meta-name">Customer Service AI</span>
          <span class="meta-time">${fmt(new Date())}</span>
        </div>
        <div class="bubble">
          <div class="thinking">
            <span>CS sedang memeriksa katalog toko</span>
            <span class="tdot"></span><span class="tdot"></span><span class="tdot"></span>
          </div>
        </div>
      </div>
    `;
    if (chatBox) {
      chatBox.appendChild(botRow);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    if (sendBtn) sendBtn.disabled = true;

    try {
      const { ok, data } = await apiFetch('/api/toko-pintar/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query, conversation: tpCsConversationHistory, store_id: getTpStoreId(), store_name: getTpStoreName() })
      });

      const bubble = botRow.querySelector('.bubble');

      if (ok && data.success && data.answer) {
        bubble.innerHTML = renderMd(data.answer);
        const engine = data.engine === 'langflow-rag' ? 'langflow-rag' : 'context';
        const tag = document.createElement('div');
        tag.className = 'tp-engine-tag ' + (engine === 'langflow-rag' ? 'tp-engine-rag' : 'tp-engine-context');
        tag.textContent = engine === 'langflow-rag'
          ? '⚡ Dijawab oleh Pengetahuan AI (katalog toko)'
          : '🧠 Dijawab dari konteks katalog (Pengetahuan AI tidak aktif)';
        bubble.appendChild(tag);
        tpCsConversationHistory.push({ role: 'user', text: query });
        tpCsConversationHistory.push({ role: 'model', text: data.answer });
      } else {
        botRow.classList.add('error-row');
        bubble.textContent = formatError(data);
      }
    } catch (err) {
      botRow.classList.add('error-row');
      const bubble = botRow.querySelector('.bubble');
      if (bubble) bubble.textContent = '❌ ' + formatError(err?.message || 'Tidak dapat terhubung ke server CS.');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    }
  };

  // Expose loadStoreCatalog globally
  window.loadStoreCatalog = loadStoreCatalog;

  // ── Modul View Switcher di atas sudah menangani 5 Modul MitraKu AI ──

  // ── Modul 2 — Riset Pasar Instan Handler ────────────────────
  window.handleMarketResearchSubmit = async function (e) {
    if (e && e.preventDefault) e.preventDefault();

    const name  = $('mr-product-name')?.value.trim();
    const cat   = $('mr-category')?.value.trim();
    const price = $('mr-price')?.value;

    if (!name) {
      showToast('⚠️ Nama produk wajib diisi.');
      return;
    }

    const submitBtn    = $('mr-submit-btn');
    const emptyState   = $('mr-result-empty');
    const loadingState = $('mr-result-loading');
    const contentState = $('mr-result-content');

    if (submitBtn) submitBtn.disabled = true;
    if (emptyState) emptyState.style.display = 'none';
    if (contentState) contentState.style.display = 'none';
    if (loadingState) loadingState.style.display = 'flex';
    setRegenBusy('mr-regen-btn', true);

    // Progressive loading text sequence
    const loadingSub = document.querySelector('#mr-result-loading .cw-loading-sub');
    const loadingText = document.querySelector('#mr-result-loading .cw-loading-text');

    const steps = [
      { text: '🔍 Menganalisis Tren Pasar & Kata Kunci SEO...', sub: 'AI sedang membandingkan rentang harga kompetitor di Shopee & Tokopedia...' },
      { text: '📊 Menghitung Estimasi Demand E-Commerce...', sub: 'Mengevaluasi posisi produk dan strategi harga jual...' },
      { text: '💡 Menyusun Strategi Diferensiasi UMKM...', sub: 'Menyiapkan rekomendasi platform jualan & kata kunci teratas...' }
    ];

    let stepIdx = 0;
    const stepInterval = setInterval(() => {
      stepIdx = (stepIdx + 1) % steps.length;
      if (loadingText) loadingText.textContent = steps[stepIdx].text;
      if (loadingSub) loadingSub.textContent = steps[stepIdx].sub;
    }, 1800);

    try {
      const { ok, data } = await apiFetch('/api/market-research', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ product_name: name, category: cat, current_price: price })
      });

      if (ok && data.success && data.result) {
        renderMarketResearchOutput(data.result);
        if (contentState) contentState.style.display = 'block';
        showToast('🎉 Laporan Riset Pasar AI berhasil dibuat!');
      } else {
        showToast('❌ ' + formatError(data));
        if (emptyState) emptyState.style.display = 'flex';
      }
    } catch (err) {
      showToast('❌ Gagal riset pasar: ' + (err?.message || err));
      if (emptyState) emptyState.style.display = 'flex';
    } finally {
      clearInterval(stepInterval);
      if (loadingState) loadingState.style.display = 'none';
      if (submitBtn) submitBtn.disabled = false;
      setRegenBusy('mr-regen-btn', false);
    }
  };

  /* Regen buttons re-submit their respective tools */
  ['cw', 'bk', 'mr'].forEach(prefix => {
    const btn = $(`${prefix}-regen-btn`);
    if (btn) {
      btn.addEventListener('click', function () {
        if (this.disabled) return;
        if (prefix === 'cw')  window.handleCopywritingSubmit();
        if (prefix === 'bk')  window.handleBrandKitSubmit();
        if (prefix === 'mr')  window.handleMarketResearchSubmit();
      });
    }
  });

  function renderMarketResearchOutput(resData) {
    const container = $('mr-cards-container');
    if (!container) return;

    const { competitor_price_range, price_positioning, differentiation_strategies = [], seo_keywords = [], recommended_platforms = [] } = resData;

    let html = `
      <div class="cw-card" style="padding: 20px; border-left: 4px solid #3b82f6;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="font-size:15px; font-weight:800; color:var(--text-main);">💰 Analisis Rentang Harga &amp; Positioning</h3>
          <span style="font-size:11px; font-weight:800; background:rgba(59, 130, 246, 0.15); color:#3b82f6; padding:4px 10px; border-radius:99px;">Shopee &amp; Tokopedia</span>
        </div>
        <div style="background:var(--bg-app); padding:14px; border-radius:12px; font-size:13px; font-weight:700; color:var(--text-main); margin-bottom:10px;">
          📊 Rentang Harga Kompetitor: <span style="color:#3b82f6;">${escHtml(competitor_price_range)}</span>
        </div>
        <p style="font-size:13px; line-height:1.6; color:var(--text-muted);">${escHtml(price_positioning)}</p>
      </div>

      <div class="cw-card" style="padding: 20px; border-left: 4px solid #10b981;">
        <h3 style="font-size:15px; font-weight:800; color:var(--text-main); margin-bottom:12px;">⚡ 3 Strategi Diferensiasi Produk</h3>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${differentiation_strategies.map((strat, i) => `
            <div style="display:flex; gap:10px; align-items:flex-start; font-size:13px; color:var(--text-main); background:var(--bg-app); padding:12px; border-radius:10px;">
              <span style="background:#10b981; color:white; font-weight:800; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:11px;">${i + 1}</span>
              <span style="line-height:1.5;">${escHtml(strat)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="cw-card" style="padding: 20px; border-left: 4px solid #8b5cf6;">
        <h3 style="font-size:15px; font-weight:800; color:var(--text-main); margin-bottom:12px;">🔍 5 Kata Kunci SEO Teratas E-Commerce</h3>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${seo_keywords.map(kw => `
            <span style="font-size:12px; font-weight:700; background:rgba(139, 92, 246, 0.12); color:#8b5cf6; padding:6px 12px; border-radius:8px; border:1px solid rgba(139, 92, 246, 0.25); cursor:pointer;" onclick="copyToClipboard('${escHtml(kw)}').then(()=>showToast('✓ Keyword tersalin!'))">
              🔎 ${escHtml(kw)}
            </span>
          `).join('')}
        </div>
      </div>

      <div class="cw-card" style="padding: 20px; border-left: 4px solid #f59e0b;">
        <h3 style="font-size:15px; font-weight:800; color:var(--text-main); margin-bottom:12px;">🚀 Rekomendasi Platform Jualan Utama</h3>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          ${recommended_platforms.map(plat => `
            <div style="background:var(--bg-app); padding:14px; border-radius:12px; border:1px solid var(--border-subtle);">
              <div style="font-size:13.5px; font-weight:800; color:var(--text-main); margin-bottom:6px;">
                🛒 ${escHtml(plat.platform)}
              </div>
              <p style="font-size:12px; line-height:1.5; color:var(--text-muted); margin:0;">
                ${escHtml(plat.reason)}
              </p>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  /* Price Format Preview Listener */
  function initPricePreviewHelpers() {
    [{ id: 'tp-input-price', previewId: 'tp-price-preview' }, { id: 'mr-price', previewId: 'mr-price-preview' }].forEach(({ id, previewId }) => {
      const input = $(id);
      if (!input) return;
      let preview = $(previewId);
      if (!preview) {
        preview = document.createElement('div');
        preview.id = previewId;
        preview.className = 'price-format-preview';
        preview.style.display = 'none';
        input.parentNode.appendChild(preview);
      }
      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        if (!isNaN(val) && val >= 0) {
          preview.textContent = 'Rp ' + Math.floor(val).toLocaleString('id-ID');
          preview.style.display = 'inline-block';
        } else {
          preview.style.display = 'none';
        }
      });
    });
  }

  // Pre-load store catalog & price preview helpers on startup
  if (typeof loadStoreCatalog === 'function') {
    loadStoreCatalog();
  }
  initPricePreviewHelpers();
  initSettingsPanel();

})();

/* ── SETTINGS / INTEGRASI PANEL ──────────────────────────────────── */
function initSettingsPanel() {
  // Load saved config from backend and populate form
  fetch('/api/config').then(r => r.json()).then(cfg => {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('cfg-langflow-url',      cfg.langflowUrl);
    set('cfg-ingestion-flow-id', cfg.ingestionFlowId);
    set('cfg-rag-flow-id',       cfg.ragFlowId);
    set('cfg-astra-token',       cfg.astraToken); // masked value from backend
    set('cfg-astra-endpoint',    cfg.astraEndpoint);
    set('cfg-astra-collection',  cfg.astraCollection);
    updateLangflowStatusBadge(cfg.langflowEnabled ? 'ok' : 'unknown');
  }).catch((err) => {
    console.warn('[initSettingsPanel] fetch /api/config failed:', err);
  });
}

window.saveIntegrationConfig = async function () {
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const payload = {
    langflowUrl:      get('cfg-langflow-url'),
    ingestionFlowId:  get('cfg-ingestion-flow-id'),
    ragFlowId:        get('cfg-rag-flow-id'),
    astraToken:       get('cfg-astra-token'),
    astraEndpoint:    get('cfg-astra-endpoint'),
    astraCollection:  get('cfg-astra-collection'),
  };
  try {
    const res = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Konfigurasi Langflow berhasil disimpan!');
      addSettingsLog('ok', 'Config disimpan. Langflow ' + (data.langflowEnabled ? 'AKTIF ✓' : 'belum lengkap'));
      updateLangflowStatusBadge(data.langflowEnabled ? 'ok' : 'unknown');
    }
  } catch (err) {
    showToast('❌ Gagal menyimpan config: ' + err.message);
  }
};

window.testLangflowConnection = async function () {
  const lfBadge = document.getElementById('lf-status-badge');
  if (lfBadge) { lfBadge.className = 'settings-status-badge settings-status-unknown'; lfBadge.textContent = '● Menguji...'; }
  addSettingsLog('info', 'Menguji koneksi ke Langflow...');
  try {
    const res = await fetch('/api/test-langflow', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      updateLangflowStatusBadge('ok');
      addSettingsLog('ok', 'Langflow terhubung ✓ — ' + data.message);
      showToast('✅ Langflow terhubung!');
    } else {
      updateLangflowStatusBadge('error');
      addSettingsLog('err', 'Gagal: ' + data.error);
      showToast('❌ ' + data.error);
    }
  } catch (err) {
    updateLangflowStatusBadge('error');
    addSettingsLog('err', 'Error: ' + err.message);
  }
};

window.syncCatalogToLangflow = async function () {
  addSettingsLog('info', 'Memulai sync katalog ke AstraDB via Langflow...');
  try {
    const res = await fetch('/api/toko-pintar/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store_id: 'default' }) });
    const data = await res.json();
    if (data.success) {
      addSettingsLog('ok', `Sync selesai — ${data.synced} produk dikirim ke Langflow ✓`);
      showToast(`✅ ${data.synced} produk berhasil di-sync ke AstraDB!`);
    } else {
      addSettingsLog('err', 'Sync gagal: ' + data.error);
    }
  } catch (err) {
    addSettingsLog('err', 'Sync error: ' + err.message);
  }
};


window.toggleCfgVisibility = function (inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  if (el.type === 'password') { el.type = 'text'; btn.textContent = 'Sembunyikan'; }
  else { el.type = 'password'; btn.textContent = 'Tampilkan'; }
};

window.clearSettingsLog = function () {
  const body = document.getElementById('settings-log-body');
  if (body) body.innerHTML = '';
  const log = document.getElementById('settings-log');
  if (log) log.style.display = 'none';
};

function updateLangflowStatusBadge(status) {
  const badge = document.getElementById('lf-status-badge');
  if (!badge) return;
  const map = {
    ok:      ['settings-status-ok',      '● Terhubung'],
    error:   ['settings-status-error',   '● Error'],
    unknown: ['settings-status-unknown', '● Belum dicek'],
  };
  const [cls, label] = map[status] || map.unknown;
  badge.className = 'settings-status-badge ' + cls;
  badge.textContent = label;
}

function addSettingsLog(type, msg) {
  const log = document.getElementById('settings-log');
  const body = document.getElementById('settings-log-body');
  if (!log || !body) return;
  log.style.display = 'block';
  const prefix = { ok: '✓', err: '✗', info: '→' }[type] || '·';
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = `[${new Date().toLocaleTimeString('id-ID')}] ${prefix} ${msg}`;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}


