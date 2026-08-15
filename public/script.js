/**
 * DevTutor AI — Frontend Script
 * Author  : Jamaludin
 * Univ    : Universitas Putra Bangsa Kebumen
 * Hacktiv8 Final Project Sesi 3
 */

// ── State ─────────────────────────────────────────────────
let conversationHistory = [];
let messageCount        = 0;

// ── State ─────────────────────────────────────────────────
let selectedProvider = 'gemini';

// ── DOM References ─────────────────────────────────────────
const form              = document.getElementById('chat-form');
const input             = document.getElementById('user-input');
const chatBox           = document.getElementById('chat-box');
const sendBtn           = document.getElementById('send-btn');
const emptyState        = document.getElementById('empty-state');
const newChatBtn        = document.getElementById('new-chat-btn');
const mobileNewBtn      = document.getElementById('mobile-new-chat');
const sidebarToggle     = document.getElementById('sidebar-toggle');
const sidebarOverlay    = document.getElementById('sidebar-overlay');
const sidebar           = document.querySelector('.sidebar');
const msgCountEl        = document.getElementById('msg-count');
const sidebarModelLabel = document.getElementById('sidebar-model-label');

// ── Model Selector ─────────────────────────────────────────
const PROVIDER_LABELS = {
  gemini : 'Gemini 2.5 Flash',
  groq   : 'Llama 3.3 70B (Groq)'
};

document.querySelectorAll('input[name="ai-provider"]').forEach((radio) => {
  radio.addEventListener('change', function () {
    selectedProvider = this.value;
    if (sidebarModelLabel) {
      sidebarModelLabel.textContent = PROVIDER_LABELS[selectedProvider] || selectedProvider;
    }
  });
});

// ── Auto-resize textarea ──────────────────────────────────
input.addEventListener('input', autoResizeInput);

function autoResizeInput() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 160) + 'px';
}

// ── Enter to send (Shift+Enter = newline) ─────────────────
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

// ── Submit Handler ─────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const text = input.value.trim();
  if (!text) return;

  hideEmptyState();

  const userRow = buildMessageRow('user', text, 'J');
  chatBox.appendChild(userRow);
  conversationHistory.push({ role: 'user', text });
  updateMsgCount(++messageCount);

  resetInput();
  setLoading(true);

  // Bot placeholder (thinking indicator)
  const botRow    = buildThinkingRow();
  const bubbleEl  = botRow.querySelector('.bubble');
  chatBox.appendChild(botRow);
  scrollBottom();

  try {
    const res  = await fetch('/api/chat', {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({ conversation: conversationHistory, provider: selectedProvider })
    });

    const data = await res.json();

    if (res.ok && data.result) {
      conversationHistory.push({ role: 'model', text: data.result });
      updateMsgCount(++messageCount);

      // Ganti thinking indicator dengan pesan asli
      bubbleEl.innerHTML = renderMarkdown(data.result);

      // Jalankan syntax highlighting pada semua code block di bubble ini
      bubbleEl.querySelectorAll('pre code').forEach((block) => {
        if (window.hljs) window.hljs.highlightElement(block);
      });
    } else {
      botRow.classList.add('error-row');
      bubbleEl.textContent = `❌ ${data.error || 'Terjadi kesalahan pada server.'}`;
    }
  } catch {
    botRow.classList.add('error-row');
    bubbleEl.textContent = '❌ Tidak dapat terhubung ke server. Pastikan backend sudah dijalankan.';
  } finally {
    setLoading(false);
    scrollBottom();
  }
});

// ── New Chat / Clear ───────────────────────────────────────
function clearChat() {
  conversationHistory = [];
  messageCount        = 0;
  updateMsgCount(0);
  chatBox.innerHTML   = '';
  chatBox.appendChild(emptyState);
  emptyState.style.display = '';
  attachChipListeners();
  input.focus();
}

if (newChatBtn)    newChatBtn.addEventListener('click', clearChat);
if (mobileNewBtn)  mobileNewBtn.addEventListener('click', clearChat);

// ── Mobile Sidebar Toggle ──────────────────────────────────
if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    sidebarOverlay.classList.toggle('open');
  });
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('open');
  });
}

// ── Quick Prompt Chips ─────────────────────────────────────
attachChipListeners();

function attachChipListeners() {
  document.querySelectorAll('.chip-btn').forEach((chip) => {
    chip.addEventListener('click', function () {
      const text = this.getAttribute('data-prompt');
      if (!text) return;
      input.value = text;
      autoResizeInput();
      form.requestSubmit();
    });
  });
}

// ── Message Builders ───────────────────────────────────────
function buildMessageRow(role, text, avatarChar) {
  const isUser = role === 'user';
  const now    = formatTime(new Date());

  const row = document.createElement('div');
  row.classList.add('message-row', isUser ? 'user-row' : 'bot-row');

  row.innerHTML = `
    <div class="message-inner">
      <div class="message-meta">
        <div class="meta-avatar">${avatarChar}</div>
        <span class="meta-name">${isUser ? 'Kamu' : 'DevTutor AI'}</span>
        <span class="meta-time">${now}</span>
      </div>
      <div class="bubble"></div>
    </div>`;

  const bubble = row.querySelector('.bubble');
  if (isUser) {
    bubble.textContent = text;
  } else {
    bubble.innerHTML = renderMarkdown(text);
    bubble.querySelectorAll('pre code').forEach((block) => {
      if (window.hljs) window.hljs.highlightElement(block);
    });
  }

  return row;
}

function buildThinkingRow() {
  const now = formatTime(new Date());
  const row = document.createElement('div');
  row.classList.add('message-row', 'bot-row');

  row.innerHTML = `
    <div class="message-inner">
      <div class="message-meta">
        <div class="meta-avatar">D</div>
        <span class="meta-name">DevTutor AI</span>
        <span class="meta-time">${now}</span>
      </div>
      <div class="bubble">
        <div class="thinking">
          <span>Sedang berpikir</span>
          <span class="thinking-dots">
            <span class="tdot"></span>
            <span class="tdot"></span>
            <span class="tdot"></span>
          </span>
        </div>
      </div>
    </div>`;

  return row;
}

// ── Markdown Renderer ──────────────────────────────────────
function renderMarkdown(raw) {
  // Escape HTML di luar code block terlebih dahulu
  let text = raw;

  // Simpan code blocks sementara agar tidak ikut diproses
  const codeBlocks = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const safeLang = lang || 'text';
    const header   = `<div class="code-header">
      <span class="code-lang">${safeLang}</span>
      <button class="copy-btn" onclick="copyCode(this)">Copy</button>
    </div>`;
    const block    = `<pre>${header}<code class="language-${safeLang}">${escHtml(code.trim())}</code></pre>`;
    codeBlocks.push(block);
    return `\x00CODEBLOCK${codeBlocks.length - 1}\x00`;
  });

  // Escape sisa teks
  text = escHtml(text);

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold & italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Heading level 3
  text = text.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');

  // Paragraf & list
  const lines   = text.split('\n');
  const output  = [];
  let inList    = false;
  let listType  = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const ulMatch = line.match(/^(\s*)[-*]\s+(.*)/);
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)/);

    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) output.push(`</${listType}>`);
        output.push('<ul>');
        inList   = true;
        listType = 'ul';
      }
      output.push(`<li>${ulMatch[2]}</li>`);
    } else if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) output.push(`</${listType}>`);
        output.push('<ol>');
        inList   = true;
        listType = 'ol';
      }
      output.push(`<li>${olMatch[2]}</li>`);
    } else {
      if (inList) {
        output.push(`</${listType}>`);
        inList = false;
      }
      if (line.trim() === '') {
        output.push('');
      } else if (line.startsWith('<h3>') || line.startsWith('<pre>')) {
        output.push(line);
      } else {
        output.push(line);
      }
    }
  }

  if (inList) output.push(`</${listType}>`);

  // Gabungkan baris: baris kosong berurutan → pemisah paragraf
  let html = output.join('\n')
    .split(/\n{2,}/)
    .map((block) => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('<ul>') || block.startsWith('<ol>') ||
          block.startsWith('<h3>') || block.startsWith('<pre>') ||
          block.startsWith('\x00CODEBLOCK')) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  // Kembalikan code blocks yang disimpan tadi
  html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, idx) => codeBlocks[+idx]);

  return html;
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Copy code to clipboard ─────────────────────────────────
window.copyCode = function (btn) {
  const code = btn.closest('pre').querySelector('code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  }).catch(() => {
    btn.textContent = 'Gagal';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
};

// ── Helpers ───────────────────────────────────────────────
function hideEmptyState() {
  if (emptyState && chatBox.contains(emptyState)) {
    emptyState.style.display = 'none';
  }
}

function resetInput() {
  input.value        = '';
  input.style.height = 'auto';
}

function setLoading(on) {
  sendBtn.disabled = on;
  input.disabled   = on;
  if (!on) input.focus();
}

function scrollBottom() {
  chatBox.scrollTop = chatBox.scrollHeight;
}

function updateMsgCount(n) {
  if (msgCountEl) msgCountEl.textContent = `${n} pesan`;
}

function formatTime(d) {
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
