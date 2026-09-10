(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var STORE_ID = params.get('store') || 'default';
  var STORE_NAME = (params.get('name') ? params.get('name').trim() : '') || 'Toko UMKM Pintar';
  var CONV_KEY = 'kontenku_widget_conv_' + STORE_ID;

  function $(id) { return document.getElementById(id); }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtTime(d) {
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  /* Token aman subset markdown (bold, italic, code, link, list) */
  function inlineMd(s) {
    s = s.replace(/`([^`]+)`/g, function (m, c) { return '<code>' + c + '</code>'; });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, label, url) {
      return '<a href="' + url.replace(/["'<>]/g, '') + '" target="_blank" rel="noopener nofollow noreferrer">' + label + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    return s;
  }

  function renderMdMin(text) {
    var safe = escHtml(text).replace(/\r\n?/g, '\n');
    var lines = safe.split('\n');
    var html = '';
    var inList = false;

    function closeList() {
      if (inList) { html += '</ul>'; inList = false; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) { closeList(); continue; }
      var lMatch = line.match(/^\s*([-*•])\s+(.*)$/);
      if (lMatch) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + inlineMd(lMatch[2]) + '</li>';
        continue;
      }
      closeList();
      html += '<p>' + inlineMd(line) + '</p>';
    }
    closeList();
    return html;
  }

  /* fetch dengan timeout 25s (meniru apiFetch utama) */
  async function widgetFetch(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 25000);
    try {
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new DOMException('Waktu permintaan habis (25 detik). Silakan coba lagi.', 'AbortError');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  var chatBox = $('w-chat-box');
  var inputEl = $('w-input');
  var sendBtn = $('w-send-btn');
  var quickEl = $('w-quick');
  var storeNameEl = $('w-store-name');

  if (storeNameEl) storeNameEl.textContent = STORE_NAME + ' — CS AI';

  var conv = [];
  try {
    var saved = sessionStorage.getItem(CONV_KEY);
    if (saved) conv = JSON.parse(saved) || [];
  } catch (e) { conv = []; }

  function addRow(kind, metaName, metaTime, bubbleHTML, error) {
    var row = document.createElement('div');
    row.className = 'mrow ' + kind;
    row.innerHTML =
      '<div class="m-avatar" aria-hidden="true">' + (kind === 'user' ? 'U' : 'CS') + '</div>' +
      '<div class="m-wrap">' +
        '<div class="m-meta">' +
          '<span class="m-name">' + metaName + '</span>' +
          '<span class="m-time">' + metaTime + '</span>' +
        '</div>' +
        '<div class="m-bubble">' + bubbleHTML + '</div>' +
      '</div>';
    if (chatBox) {
      chatBox.appendChild(row);
      chatBox.scrollTop = chatBox.scrollHeight;
    }
    return row;
  }

  function greetingHTML() {
    return '<p>Halo Kak! 👋 Selamat datang di <strong>' + escHtml(STORE_NAME) + '</strong>. ' +
      'Ada yang bisa saya bantu terkait produk, stok, harga, atau pengiriman kami?</p>';
  }

  function showGreeting() {
    addRow('bot', 'CS Toko', 'Online', greetingHTML());
  }

  if (conv.length === 0) {
    showGreeting();
  } else {
    conv.forEach(function (m) {
      addRow(m.role === 'model' ? 'bot' : 'user', m.role === 'model' ? 'CS Toko' : 'Anda',
        '', (m.role === 'model' ? renderMdMin(m.text) : escHtml(m.text)));
    });
  }

  function saveConv() {
    try { sessionStorage.setItem(CONV_KEY, JSON.stringify(conv)); } catch (e) {}
  }

  function buildQuickPrompts() {
    quickEl.innerHTML = '';

    function addBtn(label, query) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'w-quick-btn';
      b.textContent = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', function () {
        if (inputEl) inputEl.value = query;
        send();
      });
      quickEl.appendChild(b);
    }

    if (window.__wCatalog && window.__wCatalog.length > 0) {
      window.__wCatalog.slice(0, 3).forEach(function (p, idx) {
        if (idx === 0) {
          addBtn('Cek stok ' + p.name + '?', 'Apakah produk ' + p.name + ' masih ada stoknya?');
        } else {
          addBtn('Harga ' + p.name + '?', 'Berapa harga ' + p.name + ' dan bagaimana pengirimannya?');
        }
      });
      addBtn('❓ Produk yang tidak ada', 'Apakah ada produk baju atau fashion?');
    } else {
      addBtn('💬 Cek stok produk?', 'Apakah masih ada stok produknya?');
      addBtn('💰 Harga & ongkir?', 'Berapa harga produknya dan bagaimana pengirimannya?');
      addBtn('❓ Produk yang tidak ada', 'Apakah ada produk baju atau fashion?');
    }
  }

  async function loadCatalog() {
    try {
      var res = await widgetFetch('/api/toko-pintar/catalog?store_id=' + encodeURIComponent(STORE_ID));
      var data = await res.json();
      if (data && Array.isArray(data.catalog)) {
        window.__wCatalog = data.catalog;
      }
    } catch (e) {
      window.__wCatalog = [];
    }
    buildQuickPrompts();
  }

  async function send() {
    var input = inputEl ? inputEl.value.replace(/\s+/g, ' ').trim() : '';
    if (!input) return;
    if (sendBtn) sendBtn.disabled = true;
    if (inputEl) inputEl.value = '';

    addRow('user', 'Anda', fmtTime(new Date()), escHtml(input));
    var botRow = addRow('bot', 'CS Toko', fmtTime(new Date()),
      '<div class="w-thinking">CS sedang memeriksa katalog toko<span class="tdot"></span><span class="tdot"></span><span class="tdot"></span></div>');

    try {
      var res = await widgetFetch('/api/toko-pintar/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: input,
          conversation: conv,
          store_id: STORE_ID,
          store_name: STORE_NAME
        })
      });
      var data = await res.json();
      var bubble = botRow.querySelector('.m-bubble');
      if (res.ok && data && data.success && data.answer) {
        bubble.innerHTML = renderMdMin(data.answer);
        conv.push({ role: 'user', text: input });
        conv.push({ role: 'model', text: data.answer });
        saveConv();
      } else {
        botRow.classList.add('error');
        bubble.textContent = data && data.error ? data.error : 'Ups, ada kendala di server. Silakan coba lagi.';
      }
    } catch (err) {
      var bubble2 = botRow.querySelector('.m-bubble');
      botRow.classList.add('error');
      bubble2.textContent = '❌ ' + (err && err.message ? err.message : 'Tidak dapat terhubung ke server CS.');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
      if (inputEl) inputEl.focus();
    }
  }

  var form = $('w-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      send();
    });
  }

  if (inputEl) {
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    var resizeInput = function () {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 110) + 'px';
    };
    inputEl.addEventListener('input', resizeInput);
  }

  var resetBtn = $('w-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      conv = [];
      try { sessionStorage.removeItem(CONV_KEY); } catch (e) {}
      if (chatBox) chatBox.innerHTML = '';
      showGreeting();
      buildQuickPrompts();
      if (inputEl) inputEl.value = '';
      inputEl.focus();
    });
  }

  loadCatalog();
})();