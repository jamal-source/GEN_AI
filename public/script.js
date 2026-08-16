(function () {
  'use strict';

  /* ==========================================================================
     1. STATE & CONSTANTS
     ========================================================================== */
  const STORAGE_KEY   = 'kontenku_conversations_v2';
  const ACTIVE_ID_KEY = 'kontenku_active_conv_id';
  const THEME_KEY     = 'kontenku_theme';
  const PRODUCT_KEY   = 'kontenku_active_product';
  const SIDEBAR_KEY   = 'kontenku_sidebar_open';

  let activeConvId      = localStorage.getItem(ACTIVE_ID_KEY) || null;
  let selectedProvider  = 'gemini';
  let isGenerating      = false;
  let isPipelineRunning = false;
  let pendingDeleteId   = null;

  /* Helper DOM Selector */
  const $ = id => document.getElementById(id);

  /* Safe Copy to Clipboard (Works on HTTP, HTTPS, WebViews & Old Browsers) */
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  /* ==========================================================================
     2. GLOBAL WINDOW METHOD BINDINGS (ALWAYS DEFINED FIRST)
     ========================================================================== */
  window.openAboutModal = function () {
    const modal = $('about-modal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeAboutModal = function () {
    const modal = $('about-modal');
    if (modal) modal.style.display = 'none';
  };

  window.openProductModal = function () {
    initActiveProduct();
    const modal = $('product-modal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeProductModal = function () {
    const modal = $('product-modal');
    if (modal) modal.style.display = 'none';
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
    localStorage.setItem(PRODUCT_KEY, JSON.stringify(p));
    initActiveProduct();
    window.closeProductModal();
    if (activeConvId) {
      const conv = svc.get(activeConvId);
      if (conv) { conv.product_context = p; svc._save(); }
    }
  };

  window.openImageModal = function (url, title) {
    const modal = $('image-modal');
    const img   = $('modal-img');
    const tEl   = $('modal-title');
    const dBtn  = $('modal-download-btn');
    if (modal && img) {
      img.src = url;
      if (tEl)  tEl.textContent = title || 'Visual Asset PNG';
      if (dBtn) { dBtn.href = url; dBtn.download = title || 'asset.png'; }
      modal.style.display = 'flex';
    }
  };

  window.closeImageModal = function () {
    const modal = $('image-modal');
    if (modal) modal.style.display = 'none';
  };

  window.closeDeleteModal = function () {
    pendingDeleteId = null;
    const modal = $('delete-modal');
    if (modal) modal.style.display = 'none';
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
    localStorage.removeItem(ACTIVE_ID_KEY);
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
        const raw = localStorage.getItem(STORAGE_KEY);
        const list = raw ? JSON.parse(raw) : [];
        const valid = list.filter(c => c.messages && c.messages.length > 0);
        if (valid.length !== list.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
        }
        return valid;
      } catch {
        return [];
      }
    }

    _save() {
      try {
        const valid = this.conversations.filter(c => c.messages && c.messages.length > 0);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
      } catch {}
    }

    getAll() {
      return [...this.conversations]
        .filter(c => c.messages && c.messages.length > 0)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
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
      const all = this.getAll().filter(c => !c.archived);
      if (!query || !query.trim()) return all;
      const q = query.toLowerCase().trim();
      return all.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some(m => m.text.toLowerCase().includes(q))
      );
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
  const pipelineBanner      = $('pipeline-banner');
  const pipeDot             = $('pipe-dot');
  const pipeLabel           = $('pipe-label');
  const confirmDeleteBtn    = $('confirm-delete-btn');

  // Initialize UI Settings
  initTheme();
  initSidebar();
  initActiveProduct();
  checkProviderAvailability();

  // Load Initial Conversation if valid
  const initialConv = activeConvId ? svc.get(activeConvId) : null;
  if (initialConv && initialConv.messages && initialConv.messages.length > 0) {
    loadConversation(activeConvId);
  } else {
    activeConvId = null;
    localStorage.removeItem(ACTIVE_ID_KEY);
    showEmpty();
  }
  renderHistory();

  window.toggleModelMenu = function (e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const menu = $('model-menu');
    if (menu) {
      const isHidden = menu.style.display === 'none' || !menu.style.display;
      menu.style.display = isHidden ? 'block' : 'none';
    }
  };

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
    localStorage.setItem(SIDEBAR_KEY, String(open));
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
    const saved = localStorage.getItem(THEME_KEY) || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    if (themeIcon) themeIcon.textContent = saved === 'dark' ? '☀️' : '🌙';
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const cur  = document.documentElement.getAttribute('data-theme') || 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
      if (themeIcon) themeIcon.textContent = next === 'dark' ? '☀️' : '🌙';
    });
  }

  /* ── ACTIVE PRODUCT CONTEXT ─────────────────────────────────── */
  function getActiveProductContext() {
    try {
      const raw = localStorage.getItem(PRODUCT_KEY);
      return raw ? JSON.parse(raw) : { brand: '', variant: '', legalities: '' };
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

  document.querySelectorAll('input[name="model-choice"]').forEach(radio => {
    radio.addEventListener('change', function () {
      if (this.checked) {
        selectedProvider = this.value;
        if (modelLabel) {
          modelLabel.textContent = selectedProvider === 'groq' ? 'Llama 3.3 70B' : 'Gemini 2.5 Flash';
        }
        if (modelMenu) modelMenu.style.display = 'none';
      }
    });
  });

  async function checkProviderAvailability() {
    try {
      const res = await fetch('/api/providers');
      if (!res.ok) return;
      const data = await res.json();
      const groqRadio = document.querySelector('input[name="model-choice"][value="groq"]');
      if (groqRadio && data.groq && !data.groq.available) {
        groqRadio.disabled = true;
      }
    } catch {}
  }

  /* ── ESCAPE KEY LISTENER ────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeMobileDrawer();
      window.closeProductModal();
      window.closeImageModal();
      window.closeDeleteModal();
      window.closeAboutModal();
      if (modelMenu) modelMenu.style.display = 'none';
    }
  });

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

  if (historySearch) {
    historySearch.addEventListener('input', e => {
      const q = e.target.value;
      if (searchClear) searchClear.style.display = q ? 'block' : 'none';
      renderHistory(q);
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
    const deleteModal = $('delete-modal');
    if (deleteModal) deleteModal.style.display = 'flex';
  }

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', () => {
      if (pendingDeleteId) {
        svc.delete(pendingDeleteId);
        if (activeConvId === pendingDeleteId) {
          activeConvId = null;
          localStorage.removeItem(ACTIVE_ID_KEY);
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
    localStorage.setItem(ACTIVE_ID_KEY, id);

    hideEmpty();
    if (chatBox) {
      chatBox.innerHTML = '';
      conv.messages.forEach(msg => {
        chatBox.appendChild(buildRow(msg.role, msg.text, msg.created_at, msg.metadata));
      });
    }

    renderHistory();
    closeMobileDrawer();
    scrollToBottom();
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

  /* ── CHAT FORM SUBMISSION ───────────────────────────────────── */
  window.handleChatSubmit = async function () {
    const text = input ? input.value.trim() : '';
    if (!text || isGenerating) return;

    hideEmpty();

    let isFirst = false;
    if (!activeConvId || !svc.get(activeConvId)) {
      const conv = svc.create();
      activeConvId = conv.id;
      localStorage.setItem(ACTIVE_ID_KEY, activeConvId);
      isFirst = true;
    }

    svc.addMessage(activeConvId, 'user', text);
    if (chatBox) chatBox.appendChild(buildRow('user', text, new Date().toISOString()));
    clearInput();
    setLoading(true);

    const botRow = buildThinkingRow();
    const bubble = botRow.querySelector('.bubble');
    if (chatBox) chatBox.appendChild(botRow);
    scrollToBottom();

    const conv    = svc.get(activeConvId);
    const history = conv ? conv.messages.map(m => ({ role: m.role, text: m.text })) : [];

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ conversation: history, provider: selectedProvider })
      });
      const data = await res.json();

      if (res.ok && data.result) {
        svc.addMessage(activeConvId, 'model', data.result);
        bubble.innerHTML = renderMd(data.result);
        bubble.querySelectorAll('pre code').forEach(b => window.hljs && window.hljs.highlightElement(b));
        checkPipelineTrigger(data.result);
        if (isFirst) autoTitle(text);
      } else {
        botRow.classList.add('error-row');
        bubble.textContent = data.error || 'Terjadi kesalahan pada server.';
      }
    } catch {
      botRow.classList.add('error-row');
      bubble.textContent = 'Tidak dapat terhubung ke server.';
    } finally {
      setLoading(false);
      renderHistory();
      scrollToBottom();
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
      const res = await fetch('/api/title', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: firstMsg })
      });
      const data = await res.json();
      if (data.title && activeConvId) {
        svc.rename(activeConvId, data.title);
        renderHistory();
      }
    } catch {}
  }

  /* ── PIPELINE AUTOMATION ────────────────────────────────────── */
  const PIPELINE_KEYWORDS = ['memproses via pipeline', 'proses pembuatan 9 konten', '9 konten visual + 1 video'];

  function checkPipelineTrigger(aiResponse) {
    const low = aiResponse.toLowerCase();
    if (PIPELINE_KEYWORDS.some(kw => low.includes(kw)) && pipelineBanner) {
      pipelineBanner.style.display = 'flex';
    }
  }

  function setPipelineStatus(state, label) {
    if (pipeDot) {
      pipeDot.className = 'pipe-dot';
      if (state === 'running') pipeDot.classList.add('dot-orange');
      else if (state === 'success') pipeDot.classList.add('dot-green');
      else if (state === 'error') pipeDot.classList.add('dot-red');
    }
    if (pipeLabel) pipeLabel.textContent = label || 'Siap';
  }

  window.triggerPipeline = async function () {
    if (isPipelineRunning) return;
    if (!activeConvId) {
      alert('Mulai percakapan terlebih dahulu sebelum menjalankan pipeline.');
      return;
    }

    const conv = svc.get(activeConvId);
    if (!conv || conv.messages.length === 0) {
      alert('Kirim pesan tentang produk Anda terlebih dahulu.');
      return;
    }

    isPipelineRunning = true;

    const sidebarBtn = $('sidebar-trigger-btn');
    const bannerBtn  = pipelineBanner ? pipelineBanner.querySelector('.btn-banner-trigger') : null;

    [sidebarBtn, bannerBtn].forEach(btn => {
      if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
    });

    setPipelineStatus('running', 'Berjalan...');

    const infoRow = buildRow('model',
      '🚀 **Pipeline Dimulai!**\n\nSistem sedang memproses:\n\n' +
      '1. ✅ Menerima data produk\n' +
      '2. ⏳ Content Planner — 9 slot konten...\n' +
      '3. ⏳ Image Render Engine (PNG 1080×1080)...\n' +
      '4. ⏳ Video Generation (MP4 H.264)...\n' +
      '5. ⏳ Quality Control...\n\n' +
      'Mohon tunggu beberapa saat.',
      new Date().toISOString()
    );
    hideEmpty();
    if (chatBox) chatBox.appendChild(infoRow);
    scrollToBottom();

    const payload = conv.messages.map(m => ({ role: m.role, text: m.text }));

    try {
      const res = await fetch('/api/trigger-pipeline', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ conversation: payload, product_context: getActiveProductContext() })
      });
      const data = await res.json();

      if (res.ok && data.success && data.pipeline) {
        setPipelineStatus('success', 'Selesai');
        const p       = data.pipeline;
        const brand   = escHtml(p.brand_name   || 'Produk');
        const variant = escHtml(p.variant_name || 'Varian');
        const assets  = p.assets  || [];
        const video   = p.video_url;

        const doneRow = buildRow('model',
          `🎉 **Pipeline Selesai — ${brand} ${variant}!**\n\nBerhasil membuat **${assets.length} konten visual PNG** dan **1 video promosi MP4**.`,
          new Date().toISOString()
        );
        const bubbleEl = doneRow.querySelector('.bubble');

        let gallery = '<div class="asset-gallery">';
        assets.forEach(ast => {
          gallery += `
            <div class="asset-card" onclick="openImageModal('${ast.url}', '${escHtml(ast.name)}')">
              <img src="${ast.url}" alt="${escHtml(ast.name)}" loading="lazy" />
              <div class="asset-label">${escHtml(ast.name)}</div>
            </div>`;
        });
        gallery += '</div>';

        if (video) {
          gallery += `
            <div class="video-result-card">
              <div class="video-result-title">🎬 Video Promosi MP4</div>
              <video controls muted playsinline class="result-video">
                <source src="${video}" type="video/mp4">
              </video>
              <a href="${video}" download class="btn-primary-action btn-download-video">⬇ Download Video MP4</a>
            </div>`;
        }

        gallery += `
          <div class="result-info-bar">
            📁 <strong>Output:</strong> <code>product-content-engine/output/${escHtml(p.batch_id || '')}</code>
          </div>`;

        bubbleEl.innerHTML += gallery;
        if (chatBox) chatBox.appendChild(doneRow);
        svc.addMessage(activeConvId, 'model', `Pipeline selesai: ${assets.length} aset dibuat.`);
        if (pipelineBanner) pipelineBanner.style.display = 'none';
      } else {
        setPipelineStatus('error', 'Gagal');
        const errRow = buildRow('model', '❌ Pipeline gagal dijalankan. Coba lagi.', new Date().toISOString());
        if (chatBox) chatBox.appendChild(errRow);
      }
    } catch {
      setPipelineStatus('error', 'Koneksi gagal');
      const errRow = buildRow('model', '❌ Tidak dapat terhubung ke server.', new Date().toISOString());
      if (chatBox) chatBox.appendChild(errRow);
    } finally {
      isPipelineRunning = false;
      [sidebarBtn, bannerBtn].forEach(btn => {
        if (!btn) return;
        btn.disabled = false;
        btn.innerHTML = btn.id === 'sidebar-trigger-btn'
          ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Jalankan Pipeline'
          : '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Buat Konten Sekarang';
      });
      scrollToBottom();
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
          <span class="meta-name">${isUser ? 'Anda' : 'KontenKu AI'}</span>
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
      bubble.querySelectorAll('pre code').forEach(b => window.hljs && window.hljs.highlightElement(b));
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
          window.quickPrompt('Tolong buat ulang respons sebelumnya dengan versi yang berbeda.');
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
          <span class="meta-name">KontenKu AI</span>
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

  /* ── MARKDOWN RENDERER ──────────────────────────────────────── */
  function renderMd(raw) {
    const blocks = [];
    let text = raw.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const l = lang || 'text';
      blocks.push(`<pre><div class="code-header"><span class="code-lang">${l}</span><button class="copy-btn" onclick="copyCode(this)">Salin</button></div><code class="language-${l}">${escHtml(code.trim())}</code></pre>`);
      return `\x00CB${blocks.length - 1}\x00`;
    });

    text = escHtml(text);
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
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
  function escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function fmt(d) {
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  function clearInput() {
    if (input) { input.value = ''; input.style.height = 'auto'; }
  }

  function setLoading(on) {
    isGenerating = on;
    if (sendBtn) sendBtn.disabled = on;
    if (input)   input.disabled   = on;
    if (!on && input) input.focus();
  }

  function scrollToBottom() {
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
  }

})();
