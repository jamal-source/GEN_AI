import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import pg from 'pg';
import rateLimit from 'express-rate-limit';
import { lookup as dnsLookup } from 'node:dns/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── Rate Limiter ──────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan dari IP ini. Silakan coba lagi dalam 1 menit.' }
});

// Limiter khusus chatbot CS customer (widget/share link) — lebih longgar
// supaya widget di situs merchant tidak kena throttle bepergian pelanggan.
const csChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan dari IP ini. Silakan coba lagi dalam 1 menit.' }
});

// ── System Prompt — MitraKu AI ────────────────────────────────
const SYSTEM_PROMPT = `\
Kamu adalah MitraKu AI, asisten marketing digital cerdas khusus untuk pelaku UMKM Indonesia.

Misimu adalah menjadi mitra bisnis terpercaya bagi pemilik usaha kecil dan menengah — \
membantu mereka tumbuh secara digital dengan strategi marketing yang efektif, \
konten yang menarik, dan pengetahuan bisnis yang praktis.

Cara kerjamu:
1. Sapa dengan hangat, ramah, dan solutif.
2. Pahami kebutuhan UMKM: strategi jualan, copywriting, riset pasar, brand identity, atau solusi legalitas.
3. Berikan panduan yang konkret, praktis, dan terstruktur (gunakan bullet points/nomor).
4. Jika pengguna membutuhkan deskripsi Shopee, skrip TikTok, atau caption Instagram siap pakai, \
   berikan contoh singkat dan ingatkan bahwa mereka bisa pakai "Copywriting Factory" untuk versi instan.

ATURAN PENTING:
- Gunakan Bahasa Indonesia yang hangat, ramah, santai, profesional, dan penuh semangat mendukung UMKM.
- Berikan saran yang faktual dan realistis untuk skala usaha UMKM Indonesia.
- Gunakan emoji secukupnya agar percakapan terasa hidup dan menyenangkan.`;

// ── Providers ─────────────────────────────────────────────────
const PROVIDERS = {
  gemini: {
    model: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    fallbackModels: [] // model lite/1.5-flash usang (404) -> pemulihan via rantai provider ke groq/openrouter
  },
  groq: {
    model: 'openai/gpt-oss-120b',
    label: 'GPT-OSS 120B (Groq)',
    fallbackModels: ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b']
  },
  openrouter: {
    model: 'deepseek/deepseek-chat',
    label: 'OpenRouter AI',
    fallbackModels: ['meta-llama/llama-3.3-70b-instruct']
  }
};

// ── Lazy-Init Clients ─────────────────────────────────────────
let geminiClient = null;
let groqClient = null;

function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  if (!geminiClient) geminiClient = new GoogleGenAI({ apiKey: key });
  return geminiClient;
}

function getGroqClient() {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: key });
  return groqClient;
}

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/toko-pintar/chat')) return next();
  return apiLimiter(req, res, next);
});
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// ── Langflow / AstraDB runtime config (persisted ke data/langflow-config.json) ─
let langflowConfig = {
  langflowUrl:       process.env.LANGFLOW_URL        || 'http://mitraku_langflow:7860',
  ingestionFlowId:   process.env.LANGFLOW_INGESTION_FLOW_ID || '',
  ragFlowId:         process.env.LANGFLOW_RAG_FLOW_ID       || '',
  astraToken:        process.env.ASTRA_DB_APPLICATION_TOKEN  || '',
  astraEndpoint:     process.env.ASTRA_DB_API_ENDPOINT       || '',
  astraCollection:   process.env.ASTRA_DB_COLLECTION         || 'mitraku_catalog',
  apiKey:            process.env.LANGFLOW_API_KEY            || '',
};

// ── GET /api/config ───────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  // mask sensitive fields — tampilkan 4 awal + 4 akhir saja (hindari bocor prefix token)
  const masked = { ...langflowConfig };
  const maskToken = (v) => (!v ? '' : v.length <= 8 ? '•••' : `${v.slice(0, 4)}…${v.slice(-4)}`);
  if (masked.astraToken) masked.astraToken = maskToken(masked.astraToken);
  if (masked.apiKey)     masked.apiKey     = maskToken(masked.apiKey);
  res.json({ ...masked, langflowEnabled: !!(langflowConfig.langflowUrl && langflowConfig.ragFlowId) });
});

// ── SSRF guard ────────────────────────────────────────────────
// URL Langflow / AstraDB dari client HANYA boleh menunjuk host publik.
// Blok IP privat/literal, hostname internal, dan DNS yang mengarah privat
// supaya server tidak bisa dipakai untuk SSRF atau eksfil token ke pihak lain.
const PRIVATE_IP_RE = /^(10\.|127\.|0\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/;
const INTERNAL_HOST_RE = /\.(local|internal|home|lan|corp|intranet|localdomain|test)$/i;

async function assertPublicHost(rawUrl, { httpsOnly = false } = {}) {
  const v = String(rawUrl || '').trim();
  if (httpsOnly && !/^https:\/\//i.test(v)) throw new Error('URL harus aman (https://).');
  if (!/^https?:\/\//i.test(v)) throw new Error('URL Langflow harus diawali http:// atau https://');

  let u;
  try {
    u = new URL(v);
  } catch {
    throw new Error('URL tidak valid.');
  }
  if (u.username || u.password) throw new Error('URL tidak boleh mengandung username/password.');

  const host = u.hostname.toLowerCase();
  if (host.includes(':')) throw new Error('Alamat IPv6 tidak diizinkan di konfigurasi ini.');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (PRIVATE_IP_RE.test(host)) throw new Error('Alamat IP privat tidak diizinkan.');
  } else if (host === 'localhost' || !host.includes('.') || INTERNAL_HOST_RE.test(host)) {
    throw new Error('Host internal tidak diizinkan.');
  }

  // Pastikan resolusi DNS tidak mengarah ke IP privat.
  try {
    const addrs = await dnsLookup(host, { all: true });
    if (addrs.some(a => PRIVATE_IP_RE.test(a.address))) throw new Error('Host merujuk ke alamat privat.');
  } catch (err) {
    if (err.code === 'ENOTFOUND') throw new Error('Host tidak ditemukan (DNS).');
    if (err.code === 'EAI_AGAIN') throw new Error('Gagal memeriksa host. Coba lagi.');
  }

  return v;
}

// ── Masker pesan error untuk client ──────────────────────────
// Jangan bocorkan detail naik teknis (nama env, path file, token, HTTP internal)
// ke UI. Pesan di luar pola ini (mis. alasan dari provider itu sendiri) tetap tampil.
const RAW_ERROR_RE = /Langflow HTTP|AbortError|fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|ENOENT|EACCES|EPERM|Sasl|password authentication|does not exist|Pool|postgres|\.env|ASTRA_DB|GEMINI_API_KEY|GROQ_API_KEY|OPENROUTER|LANGFLOW_|AstraCS|sk-[A-Za-z0-9]{10,}|Authorization|Bearer/i;

function clientError(err, fallback = 'Terjadi kesalahan pada server AI. Silakan coba lagi.') {
  const m = (err && (err.message || String(err))) || '';
  if (!m || RAW_ERROR_RE.test(m)) return fallback;
  return m;
}

// ── POST /api/config ──────────────────────────────────────────
app.post('/api/config', async (req, res) => {
  const { langflowUrl, ingestionFlowId, ragFlowId, astraToken, astraEndpoint, astraCollection, apiKey } = req.body;

  // Token/nilai dari GET sudah dimask (mis. "AstraCS:xxx…") — JANGAN timpa
  // nilai asli di server dengan string mask saat user menyimpan tanpa edit ulang.
  const isMasked = v => typeof v === 'string' && /…/.test(v);
  const set = (key, val) => {
    if (val === undefined) return;
    const v = typeof val === 'string' ? val.trim() : val;
    if (v !== '') langflowConfig[key] = v;
  };

  // SSRF guard: langflowUrl & astraEndpoint hanya boleh host publik.
  try {
    if (langflowUrl !== undefined && langflowUrl.trim()) {
      langflowConfig.langflowUrl = await assertPublicHost(langflowUrl);
    }
    if (astraEndpoint !== undefined && astraEndpoint.trim()) {
      langflowConfig.astraEndpoint = await assertPublicHost(astraEndpoint, { httpsOnly: true });
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  set('ingestionFlowId', ingestionFlowId);
  set('ragFlowId', ragFlowId);
  if (astraToken !== undefined && !isMasked(astraToken)) set('astraToken', astraToken);
  set('astraCollection', astraCollection);
  if (apiKey !== undefined && !isMasked(apiKey))    set('apiKey', apiKey);

  saveLangflowConfig();
  res.json({ success: true, langflowEnabled: !!(langflowConfig.langflowUrl && langflowConfig.ragFlowId) });
});

// ── POST /api/test-langflow ───────────────────────────────────
app.post('/api/test-langflow', async (_req, res) => {
  const { langflowUrl, ragFlowId } = langflowConfig;
  if (!langflowUrl || !ragFlowId) {
    return res.status(400).json({ ok: false, error: 'Langflow URL atau RAG Flow ID belum diisi.' });
  }
  try {
    const healthRes = await fetch(`${langflowUrl}/health`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
    res.json({ ok: true, message: 'Langflow Server Aktif & Terhubung ✓' });
  } catch (err) {
    res.json({ ok: false, error: err.message || 'Tidak bisa terhubung ke Langflow.' });
  }
});

// ── Helper: run a Langflow flow (RAG chat or ingestion) ──────
async function langflowRun(flowId, input, { sessionId } = {}) {
  const { langflowUrl, apiKey, astraToken, astraEndpoint, astraCollection } = langflowConfig;
  if (!langflowUrl || !flowId) throw new Error('Langflow belum dikonfigurasi.');
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  const astraTweaks = {
    token: astraToken,
    api_endpoint: astraEndpoint,
    collection_name: astraCollection
  };
  const res = await fetch(`${langflowUrl}/api/v1/run/${flowId}?stream=false`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input_value: input,
      session_id: sessionId,
      tweaks: { "AstraDB-1": astraTweaks, "AstraDB-2": astraTweaks }
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`Langflow HTTP ${res.status}`);
  const data = await res.json();
  return data?.outputs?.[0]?.outputs?.[0]?.results?.message?.text
      || data?.outputs?.[0]?.outputs?.[0]?.messages?.[0]?.message
      || data?.result;
}

// ── Helper: trigger Langflow ingestion flow (fire-and-forget) ─
async function triggerLangflowIngestion(input) {
  if (!langflowConfig.ingestionFlowId) return; // skip silently if not configured
  try {
    await langflowRun(langflowConfig.ingestionFlowId, input);
    console.log('[langflow] Ingestion triggered OK');
  } catch (err) {
    console.warn('[langflow] Ingestion failed (non-fatal):', err.message);
  }
}

// ── Helper: render a catalog list as text for ingestion ───────
function catalogToText(catalog, storeId) {
  return catalog.map(p =>
    `Produk: ${p.name} | Kategori: ${p.category} | Harga: Rp${p.price} | Stok: ${p.stock} | ${p.description} | Pengiriman: ${p.shipping_info} | store_id: ${storeId}`
  ).join('\n');
}


// ── GET /api/providers ────────────────────────────────────────
app.get('/api/providers', (_req, res) => {
  res.json({
    gemini:     { ...PROVIDERS.gemini,     available: !!process.env.GEMINI_API_KEY?.trim() },
    groq:       { ...PROVIDERS.groq,       available: !!process.env.GROQ_API_KEY?.trim() },
    openrouter: { ...PROVIDERS.openrouter, available: !!process.env.OPENROUTER_API_KEY?.trim() }
  });
});

// ── POST /api/title ───────────────────────────────────────────
app.post('/api/title', async (req, res) => {
  const text = req.body.text || '';
  if (!text) return res.json({ title: 'Percakapan Baru' });

  const prompt = `Buatkan 1 judul percakapan singkat (maksimal 4 kata atau 35 karakter) tanpa tanda petik untuk topik awal berikut: "${text.substring(0, 150)}"`;

  try {
    const client = getGeminiClient();
    if (client) {
      const response = await client.models.generateContent({
        model: PROVIDERS.gemini.model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      if (response?.text) {
        const title = response.text.trim().replace(/^["']|["']$/g, '').substring(0, 40);
        return res.json({ title });
      }
    }
  } catch (err) {
    try {
      const groqClient = getGroqClient();
      if (groqClient) {
        const groqRes = await groqClient.chat.completions.create({
          model: PROVIDERS.groq.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 30,
          temperature: 0.5
        });
        const groqTitle = (groqRes.choices[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '').substring(0, 40);
        if (groqTitle) return res.json({ title: groqTitle });
      }
    } catch {}
  }

  // Fallback: pakai teks awal
  const clean = text.replace(/^(saya|bantu|tolong|halo|buatkan|bagaimana|cara)\s+/i, '').trim();
  const fallback = clean.split('\n')[0].substring(0, 30);
  return res.json({ title: fallback ? fallback.charAt(0).toUpperCase() + fallback.slice(1) : 'Percakapan Baru' });
});

// ── POST /api/chat ────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const requested  = req.body.provider;
  const provider   = (requested === 'groq' || requested === 'openrouter') ? requested : 'gemini';
  const conversation = req.body.conversation;
  const productContext = req.body.product_context;

  if (!Array.isArray(conversation) || conversation.length === 0) {
    return res.status(400).json({ error: 'Field "conversation" harus berupa array dan tidak boleh kosong.' });
  }

  const isValid = conversation.every(m => m && typeof m === 'object' && typeof m.role === 'string' && typeof m.text === 'string');
  if (!isValid) {
    return res.status(400).json({ error: 'Format percakapan tidak valid. Setiap pesan harus memiliki "role" dan "text".' });
  }

  const safeConv = conversation.length > 50 ? conversation.slice(-50) : conversation;

  // Dynamically include active product context in system prompt
  let activeSystemPrompt = SYSTEM_PROMPT;
  if (productContext && typeof productContext === 'object') {
    const { brand, variant, legalities } = productContext;
    if (brand || variant) {
      activeSystemPrompt += `\n\nPRODUK AKTIF PENGGUNA DAFTARKAN:\n- Brand Usaha: ${brand || '-'}\n- Varian Produk: ${variant || '-'}\n- Legalitas: ${legalities || '-'}\n(Gunakan informasi produk di atas secara alami bila relevan).`;
    }
  }

  try {
    let text;
    let actualProvider = provider;

    // Rantai fallback otomatis: jika provider pilihan kehabisan kuota/token,
    // server otomatis mencoba provider berikutnya sampai ada yang berhasil.
    const order = provider === 'groq'        ? ['groq', 'gemini', 'openrouter']
                : provider === 'openrouter'  ? ['openrouter', 'gemini', 'groq']
                : ['gemini', 'groq', 'openrouter'];

    let lastErr;
    for (const p of order) {
      try {
        if (p === 'gemini')        text = await callGemini(safeConv, activeSystemPrompt);
        else if (p === 'groq')     text = await callGroq(safeConv, activeSystemPrompt);
        else                       text = await callOpenRouter(safeConv, activeSystemPrompt);
        actualProvider = (p === order[0]) ? p : p + ' (fallback)';
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`[chat] ${p} gagal, mencoba berikutnya:`, err?.message || err);
      }
    }
    if (!text) throw lastErr || new Error('Semua provider AI gagal merespons.');

    return res.json({ result: text, provider: actualProvider });
  } catch (err) {
    console.error(`[chat] ${provider}:`, err?.message || err);
    return res.status(500).json({ error: clientError(err) });
  }
});

// ── POST /api/copywriting ─────────────────────────────────────
// Modul 4 — Copywriting Factory
app.post('/api/copywriting', async (req, res) => {
  const { product_name, advantages, target_audience, platform } = req.body;

  if (!product_name || !platform) {
    return res.status(400).json({ error: 'Field "product_name" dan "platform" wajib diisi.' });
  }

  const platformPrompts = {
    shopee: `Kamu adalah copywriter e-commerce ahli untuk Shopee dan Tokopedia Indonesia.
Buat copywriting produk LENGKAP dan SIAP PAKAI dalam format JSON valid berikut:
{
  "judul_produk": "judul SEO maksimal 70 karakter mengandung kata kunci utama",
  "deskripsi": "deskripsi produk 800-1500 karakter, persuasif, berisi manfaat dan keunggulan, ramah algoritma Shopee",
  "bullet_keunggulan": ["keunggulan 1", "keunggulan 2", "keunggulan 3", "keunggulan 4", "keunggulan 5"],
  "hashtag": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"]
}`,

    tiktok: `Kamu adalah content creator TikTok ahli yang spesialis konten UMKM Indonesia viral.
Buat skrip konten TikTok LENGKAP dalam format JSON valid berikut:
{
  "hook": "kalimat pembuka 3 detik pertama yang wajib bikin orang stop scroll",
  "skrip_lengkap": "skrip narasi video 30-45 detik, energik, natural seperti ngobrol",
  "caption": "caption TikTok max 150 karakter + emoji yang menarik",
  "hashtag": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6", "#hashtag7"],
  "ide_sound": "rekomendasi jenis musik/sound yang cocok (trending, upbeat, dll)"
}`,

    instagram: `Kamu adalah Instagram content strategist ahli untuk brand UMKM Indonesia.
Buat konten Instagram LENGKAP dalam format JSON valid berikut:
{
  "caption_utama": "caption storytelling 150-300 karakter, emosional, ada hook di kalimat pertama",
  "caption_alternatif": "versi caption kedua dengan pendekatan berbeda (humor/fakta/pertanyaan)",
  "cta": "call to action yang spesifik dan mendesak",
  "hashtag_niche": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
  "hashtag_umum": ["#hashtag6", "#hashtag7", "#hashtag8", "#hashtag9", "#hashtag10"],
  "ide_carousel": ["slide 1: judul/hook", "slide 2: konten", "slide 3: konten", "slide 4: CTA"]
}`
  };

  const basePrompt = platformPrompts[platform] || platformPrompts.shopee;
  const userInfo = `
Produk: ${product_name}
Keunggulan utama: ${advantages || 'tidak disebutkan'}
Target pelanggan: ${target_audience || 'umum'}

PENTING: Output HANYA JSON valid tanpa markdown, tanpa teks tambahan apapun.`;

  const providers = [
    { name: 'gemini', call: () => callGemini([{ role: 'user', text: userInfo }], basePrompt) },
    { name: 'groq',   call: () => callGroq([{ role: 'user', text: userInfo }], basePrompt) },
    { name: 'openrouter', call: () => callOpenRouter([{ role: 'user', text: userInfo }], basePrompt) },
  ];
  let resultText;
  for (const p of providers) {
    try {
      resultText = await p.call();
      break;
    } catch { /* lanjut provider berikutnya */ }
  }
  if (!resultText) {
    return res.status(500).json({ error: clientError(new Error('Semua provider AI gagal.'), 'Gagal generate copywriting. Silakan coba lagi.') });
  }

  try {
    let rawText = resultText.trim();
    rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const siStart = rawText.indexOf('{');
    const siEnd   = rawText.lastIndexOf('}');
    if (siStart !== -1 && siEnd !== -1 && siEnd >= siStart) rawText = rawText.substring(siStart, siEnd + 1);

    const result = JSON.parse(rawText);
    return res.json({ success: true, platform, result });
  } catch (err) {
    console.error('[copywriting]', err?.message || err);
    return res.status(500).json({ error: clientError(err, 'Gagal generate copywriting. Silakan coba lagi.') });
  }
});

// ── POST /api/brand-kit ───────────────────────────────────────
// Modul 3 — Brand Kit Generator
app.post('/api/brand-kit', async (req, res) => {
  const { brand_name, product_type, personality, product_context } = req.body;

  if (!brand_name) {
    return res.status(400).json({ error: 'Field "brand_name" wajib diisi.' });
  }

  const brandKitSystemPrompt = `\
Kamu adalah Brand Strategist & Visual Designer senior khusus UMKM Indonesia.
Buat Brand Kit LENGKAP & ESTETIK dalam format JSON valid berikut:
{
  "brand_name": "${brand_name}",
  "tagline_options": [
    "Tagline 1 (pendek, catchy, memorable)",
    "Tagline 2 (storytelling & emosional)",
    "Tagline 3 (fokus manfaat produk untuk pembeli)"
  ],
  "brand_story": "cerita singkat brand 80-120 kata yang menyentuh hati pelanggan, menyampaikan alasan usaha ini didirikan dan komitmen kualitasnya",
  "color_palette": [
    { "name": "Warna Utama", "hex": "#HEX", "usage": "Logo & Elemen Dominan" },
    { "name": "Warna Sekunder", "hex": "#HEX", "usage": "Header & Background Card" },
    { "name": "Warna Aksen", "hex": "#HEX", "usage": "Tombol CTA & Highlight" },
    { "name": "Warna Dark", "hex": "#HEX", "usage": "Teks Utama" },
    { "name": "Warna Light", "hex": "#HEX", "usage": "Background Halaman & Border" }
  ],
  "typography": {
    "heading_font": "Plus Jakarta Sans / Outfit / Montserrat",
    "body_font": "Inter / Roboto / Open Sans",
    "vibe_description": "deskripsi singkat karakter visual & kesan yang terpancar dari tipografi ini"
  },
  "content_pillars": [
    "Pilar 1: Edukasi produk & manfaat utama",
    "Pilar 2: Storytelling & Di Balik Layar Usaha",
    "Pilar 3: Bukti Sosial (Testimoni & Review)",
    "Pilar 4: Promosi & Penawaran Terbatas"
  ]
}`;

  const pc = (product_context && typeof product_context === 'object') ? product_context : null;
  const activeProductLines = pc
    ? `- Nama Produk: ${pc.variant || '-'}
- Nama Usaha/Brand: ${pc.brand || '-'}
- Catatan Legalitas/Sell: ${pc.legalities || '-'}`
    : 'Tidak ada produk aktif yang dipilih pengguna.';

  const promptInput = `
Nama Brand: ${brand_name}
Jenis Produk / Industri: ${product_type || 'Umum'}
Kepribadian / Impression Brand: ${personality || 'Modern & Terpercaya'}

PRODUK AKTIF UMKM (dari Pengaturan — bila lengkap, wajib gunakan sebagai acuan utama: sebut produk ini di tagline, brand_story, dan pilih palet yang cocok):
${activeProductLines}

PENTING: Berikan palet warna HEX yang sangat harmonis dan kontras yang pas sesuai karakter brand. Output HANYA JSON valid tanpa markdown, tanpa teks tambahan apapun.`;

  const providers = [
    { name: 'gemini', call: () => callGemini([{ role: 'user', text: promptInput }], brandKitSystemPrompt) },
    { name: 'groq',   call: () => callGroq([{ role: 'user', text: promptInput }], brandKitSystemPrompt) },
    { name: 'openrouter', call: () => callOpenRouter([{ role: 'user', text: promptInput }], brandKitSystemPrompt) },
  ];
  let resultText;
  for (const p of providers) {
    try {
      resultText = await p.call();
      break;
    } catch { /* lanjut provider berikutnya */ }
  }
  if (!resultText) {
    return res.status(500).json({ error: clientError(new Error('Semua provider AI gagal.'), 'Gagal generate brand kit. Silakan coba lagi.') });
  }

  try {
    let rawText = resultText.trim();
    rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const bkStart = rawText.indexOf('{');
    const bkEnd   = rawText.lastIndexOf('}');
    if (bkStart !== -1 && bkEnd !== -1 && bkEnd >= bkStart) rawText = rawText.substring(bkStart, bkEnd + 1);

    const result = JSON.parse(rawText);
    return res.json({ success: true, result });
  } catch (err) {
    console.error('[brand-kit]', err?.message || err);
    return res.status(500).json({ error: clientError(err, 'Gagal generate brand kit. Silakan coba lagi.') });
  }
});

// ── POST /api/brand-kit/render-png ────────────────────────────
// Puppeteer PNG Export for Brand Kit
app.post('/api/brand-kit/render-png', async (req, res) => {
  // Vercel = serverless + filesystem read-only: render PNG disarankan lewat
  // tombol "Print / Simpan PDF" di browser. Fungsi ini tetap aktif untuk lokal/docker.
  if (process.env.VERCEL) {
    return res.status(501).json({ error: 'Unduhan PNG server dinonaktifkan di Vercel. Gunakan tombol Print / Simpan sebagai PDF pada kartu Brand Kit.' });
  }
  const brandKitData = req.body.brand_kit;
  if (!brandKitData || !brandKitData.brand_name) {
    return res.status(400).json({ error: 'Data brand_kit tidak valid.' });
  }

  try {
    let puppeteer;
    try {
      puppeteer = (await import('puppeteer')).default;
    } catch {
      throw new Error('Modul Puppeteer sedang diinstall atau belum tersedia di server.');
    }

    const htmlContent = generateBrandKitHTML(brandKitData);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1400, deviceScaleFactor: 2 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const imageBuffer = await page.screenshot({ type: 'png', fullPage: true });
    await browser.close();

    const safeName = (brandKitData.brand_name || 'UMKM').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="BrandKit_${safeName}.png"`);
    return res.send(imageBuffer);
  } catch (err) {
    console.error('[render-png]', err?.message || err);
    return res.status(500).json({ error: 'Gagal merender PNG Brand Kit: ' + (err?.message || err) });
  }
});

// ── Helper: Brand Kit HTML Template Generator ──────────────────
function generateBrandKitHTML(data) {
  const { brand_name = 'Brand UMKM', tagline_options = [], brand_story = '', color_palette = [], typography = {}, content_pillars = [] } = data;
  const mainColor = color_palette[0]?.hex || '#10b981';

  const esc = str => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const swatches = color_palette.map(c => `
    <div style="flex:1; background:${c.hex}; padding:14px; border-radius:12px; min-height:90px; color:${isColorDark(c.hex) ? '#ffffff' : '#0f172a'}; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      <div style="font-weight:800; font-size:13px;">${esc(c.name)}</div>
      <div style="font-size:12px; font-family:monospace; opacity:0.9; margin-top:4px;">${esc(c.hex)}</div>
      <div style="font-size:10px; opacity:0.75; margin-top:6px;">${esc(c.usage)}</div>
    </div>
  `).join('');

  const taglines = tagline_options.map(t => `
    <li style="margin-bottom:8px; font-size:13.5px; font-weight:600; color:#334155; display:flex; align-items:center; gap:8px;">
      <span style="color:${mainColor}; font-size:16px;">✦</span> "${esc(t)}"
    </li>
  `).join('');

  const pillars = content_pillars.map(p => `
    <div style="background:#f1f5f9; padding:10px 14px; border-radius:10px; font-size:12.5px; font-weight:600; color:#1e293b; border:1px solid #e2e8f0;">${esc(p)}</div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="utf-8" />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Inter:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { width: 1200px; padding: 40px; background: #0f172a; font-family: 'Plus Jakarta Sans', sans-serif; }
        .card { background: #ffffff; color: #0f172a; border-radius: 24px; padding: 36px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
        .header { border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
        .brand-title { font-size: 36px; font-weight: 800; color: ${mainColor}; letter-spacing: -0.5px; margin-top: 4px; }
        .badge { background: ${mainColor}18; color: ${mainColor}; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.5px; }
        .section-title { font-size: 14px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
        .story-box { background: #f8fafc; padding: 18px; border-radius: 16px; font-size: 13px; line-height: 1.6; color: #334155; border-left: 4px solid ${mainColor}; }
        .palette-row { display: flex; gap: 12px; margin-bottom: 24px; }
        .pillars-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div>
            <span class="badge">MitraKu AI — Panduan Brand Kit UMKM 🇮🇩</span>
            <h1 class="brand-title">${esc(brand_name)}</h1>
          </div>
          <div style="text-align:right; font-size:12px; color:#94a3b8; font-weight:600;">
            Dokumen Resmi Identitas Brand
          </div>
        </div>

        <div class="grid-2">
          <div>
            <div class="section-title">💡 Pilihan Tagline Brand</div>
            <ul style="list-style:none;">${taglines}</ul>
          </div>
          <div>
            <div class="section-title">📖 Cerita Brand (Brand Story)</div>
            <div class="story-box">${esc(brand_story)}</div>
          </div>
        </div>

        <div class="section-title">🎨 Palet Warna Identitas (Color Palette)</div>
        <div class="palette-row">${swatches}</div>

        <div class="grid-2">
          <div>
            <div class="section-title">🔤 Rekomendasi Tipografi</div>
            <div style="background:#f8fafc; padding:18px; border-radius:16px; border:1px solid #e2e8f0;">
              <div style="font-size:13px; font-weight:700; color:#1e293b;">Heading: <span style="color:${mainColor}">${esc(typography.heading_font || 'Plus Jakarta Sans')}</span></div>
              <div style="font-size:13px; font-weight:700; color:#1e293b; margin-top:4px;">Body Text: <span style="color:${mainColor}">${esc(typography.body_font || 'Inter')}</span></div>
              <p style="font-size:12px; color:#64748b; margin-top:8px; line-height:1.4;">${esc(typography.vibe_description || '')}</p>
            </div>
          </div>
          <div>
            <div class="section-title">📌 Pilar Konten Marketing</div>
            <div class="pillars-grid">${pillars}</div>
          </div>
        </div>

        <div class="footer">Dibuat otomatis oleh MitraKu AI — Asisten Digital Marketing UMKM Indonesia</div>
      </div>
    </body>
    </html>
  `;
}

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

// ── POST /api/market-research ─────────────────────────────────
// Modul 2 — Riset Pasar Instan
app.post('/api/market-research', async (req, res) => {
  const { product_name, category, current_price } = req.body;

  if (!product_name) {
    return res.status(400).json({ error: 'Field "product_name" wajib diisi.' });
  }

  const marketResearchPrompt = `\
Kamu adalah Market Research Analyst & E-commerce Consultant senior spesialis pasar UMKM Indonesia (Shopee, Tokopedia, TikTok Shop, Instagram).
Lakukan analisis riset pasar instan dan berikan output LENGKAP dalam format JSON valid berikut:
{
  "product_name": "${product_name}",
  "competitor_price_range": "Estimasi rentang harga kompetitor sejenis di e-commerce (misal: Rp 20.000 - Rp 35.000)",
  "price_positioning": "Analisis posisi harga produk saat ini (apakah terjangkau, premium, atau kompetitif) serta dampaknya ke minat beli",
  "differentiation_strategies": [
    "Strategi 1: Kemasan & Branding yang menonjol dibanding pesaing",
    "Strategi 2: Nilai tambah / Bonus / Bundle produk",
    "Strategi 3: Pendekatan pemasaran / Storytelling khas"
  ],
  "seo_keywords": [
    "kata kunci 1 (paling banyak dicari)",
    "kata kunci 2",
    "kata kunci 3",
    "kata kunci 4",
    "kata kunci 5"
  ],
  "recommended_platforms": [
    { "platform": "Shopee", "reason": "alasan spesifik mengapa platform ini cocok untuk produk ini" },
    { "platform": "TikTok Shop", "reason": "alasan spesifik jenis konten visual/live streaming yang efektif" }
  ]
}`;

  const promptInput = `
Nama Produk: ${product_name}
Kategori: ${category || 'Umum / Kuliner / Fashion'}
Harga Saat Ini: ${current_price ? 'Rp ' + Number(current_price).toLocaleString('id-ID') : 'Belum ditentukan'}

PENTING: Output HANYA JSON valid tanpa markdown, tanpa teks tambahan apapun.`;

  const providers = [
    { name: 'gemini', call: () => callGemini([{ role: 'user', text: promptInput }], marketResearchPrompt) },
    { name: 'groq',   call: () => callGroq([{ role: 'user', text: promptInput }], marketResearchPrompt) },
    { name: 'openrouter', call: () => callOpenRouter([{ role: 'user', text: promptInput }], marketResearchPrompt) },
  ];
  let resultText;
  for (const p of providers) {
    try {
      resultText = await p.call();
      break;
    } catch { /* lanjut provider berikutnya */ }
  }
  if (!resultText) {
    return res.status(500).json({ error: clientError(new Error('Semua provider AI gagal.'), 'Gagal generate riset pasar. Silakan coba lagi.') });
  }

  try {
    let rawText = resultText.trim();
    rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    // Fortify JSON extraction
    const startIndex = rawText.indexOf('{');
    const endIndex = rawText.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
      rawText = rawText.substring(startIndex, endIndex + 1);
    }

    const result = JSON.parse(rawText);
    return res.json({ success: true, result });
  } catch (err) {
    console.error('[market-research]', err?.message || err);
    return res.status(500).json({ error: clientError(err, 'Gagal analisis riset pasar. Silakan coba lagi.') });
  }
});



// ── Modul 1 — Toko Pintar AI (RAG Customer Service 24 Jam) ──────
// Persistent file-based catalog storage
const DATA_DIR      = path.join(__dirname, 'data');
const CATALOG_FILE  = path.join(DATA_DIR, 'catalogs.json');

const DEFAULT_CATALOG = [
  {
    id: 'prod_1',
    name: 'Sambal Bawang Bu Ani (150g)',
    category: 'Kuliner / Sambal Kemasan',
    price: 28000, stock: 45,
    description: 'Sambal bawang homemade dengan 100% cabai rawit merah asli & bawang merah pilihan. Gurih, pedas pas, tanpa pengawet. Tahan 3 bulan di suhu ruang.',
    shipping_info: 'Dikirim dari Kebumen, packing bubble wrap tebal. Bebas ongkir Shopee/Tokopedia.'
  },
  {
    id: 'prod_2',
    name: 'Kopi Robusta Nusantara (250g)',
    category: 'Minuman / Kopi',
    price: 45000, stock: 20,
    description: 'Biji kopi Robusta petik merah kualitas super dari lereng pegunungan. Dark roast, aroma bold & manis alami.',
    shipping_info: 'Pengiriman H+1 setelah sangrai segar.'
  },
  {
    id: 'prod_3',
    name: 'Keripik Singkong Coklat Lumer (200g)',
    category: 'Cemilan',
    price: 22000, stock: 60,
    description: 'Keripik singkong renyah yang dilumuri coklat lumer tebal yang tidak bikin enek.',
    shipping_info: 'Garansi ganti baru jika melempem saat pengiriman.'
  }
];

function loadCatalogs() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CATALOG_FILE)) {
      const initial = { default: DEFAULT_CATALOG };
      fs.writeFileSync(CATALOG_FILE, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
  } catch (err) {
    console.warn('[catalog] Gagal load file, menggunakan data default:', err.message);
    return { default: [...DEFAULT_CATALOG] };
  }
}

function saveCatalogs(catalogs) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalogs, null, 2), 'utf8');
  } catch (err) {
    console.warn('[catalog] Gagal simpan file:', err.message);
  }
}

let storeCatalogs = loadCatalogs();

// ── Catalog storage: Postgres (Vercel / DATABASE_URL) dengan fallback file lokal ──
// Vercel = serverless + filesystem read-only/ephemeral, jadi saat DATABASE_URL ada
// katalog disimpan ke Postgres agar data persist antar-boot function.
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const USE_CATALOG_PG = !!DATABASE_URL;
let catalogPgPool = null;
let catalogPgInit = null;

async function getCatalogPg() {
  if (!USE_CATALOG_PG) return null;
  if (!catalogPgInit) {
    catalogPgInit = (async () => {
      const pool = new pg.Pool({
        connectionString: DATABASE_URL,
        ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? undefined : { rejectUnauthorized: false }
      });
      await pool.query(`CREATE TABLE IF NOT EXISTS store_catalog (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Umum',
        price NUMERIC(12,2) NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        description TEXT NOT NULL DEFAULT '',
        shipping_info TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_store_catalog_store ON store_catalog (store_id)`);
      console.log('[catalog] Postgres store siap (Vercel/production).');
      return pool;
    })().catch(err => {
      console.error('[catalog] Postgres init gagal, fallback ke file:', err.message);
      return null;
    });
  }
  return catalogPgInit;
}

const rowToProduct = r => ({
  id: r.id,
  name: r.name,
  category: r.category,
  price: Number(r.price),
  stock: Number(r.stock),
  description: r.description,
  shipping_info: r.shipping_info
});

async function catalogEnsureSeed(storeId) {
  const pool = await getCatalogPg();
  if (pool) {
    const { rows } = await pool.query('SELECT 1 FROM store_catalog WHERE store_id=$1 LIMIT 1', [storeId]);
    if (rows.length === 0) {
      for (const p of DEFAULT_CATALOG) {
        await pool.query(
          'INSERT INTO store_catalog (id, store_id, name, category, price, stock, description, shipping_info) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING',
          [p.id, storeId, p.name, p.category, p.price, p.stock, p.description, p.shipping_info]
        );
      }
    }
    return;
  }
  if (!storeCatalogs[storeId]) storeCatalogs[storeId] = [...DEFAULT_CATALOG];
}

async function catalogList(storeId) {
  const pool = await getCatalogPg();
  if (pool) {
    const { rows } = await pool.query(
      'SELECT id, name, category, price, stock, description, shipping_info FROM store_catalog WHERE store_id=$1 ORDER BY created_at DESC',
      [storeId]
    );
    return rows.map(rowToProduct);
  }
  return storeCatalogs[storeId] || storeCatalogs.default || [];
}

async function catalogCreate(storeId, product) {
  const pool = await getCatalogPg();
  if (pool) {
    await pool.query(
      'INSERT INTO store_catalog (id, store_id, name, category, price, stock, description, shipping_info) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [product.id, storeId, product.name, product.category, product.price, product.stock, product.description, product.shipping_info]
    );
    return;
  }
  if (!storeCatalogs[storeId]) storeCatalogs[storeId] = [...DEFAULT_CATALOG];
  storeCatalogs[storeId].unshift(product);
  saveCatalogs(storeCatalogs);
}

async function catalogRemove(storeId, id) {
  const pool = await getCatalogPg();
  if (pool) {
    await pool.query('DELETE FROM store_catalog WHERE store_id=$1 AND id=$2', [storeId, id]);
    return;
  }
  if (!storeCatalogs[storeId]) storeCatalogs[storeId] = [...DEFAULT_CATALOG];
  storeCatalogs[storeId] = storeCatalogs[storeId].filter(p => p.id !== id);
  saveCatalogs(storeCatalogs);
}

// ── Persistensi konfigurasi Langflow/AstraDB (survive restart server) ──
const CONFIG_FILE = path.join(DATA_DIR, 'langflow-config.json');

function loadLangflowConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return;
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (saved && typeof saved === 'object') {
      Object.keys(saved).forEach(k => {
        if (k in langflowConfig && typeof saved[k] === 'string' && saved[k]) {
          langflowConfig[k] = saved[k];
        }
      });
    }
    console.log('[config] Langflow config dimuat dari file.');
  } catch (err) {
    console.warn('[config] Gagal load file config:', err.message);
  }
}

function saveLangflowConfig() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(langflowConfig, null, 2), 'utf8');
  } catch (err) {
    console.warn('[config] Gagal simpan file config:', err.message);
  }
}

loadLangflowConfig();

// GET /api/toko-pintar/catalog
app.get('/api/toko-pintar/catalog', async (req, res) => {
  const storeId = (req.query.store_id || 'default').toString().slice(0, 100);
  try {
    await catalogEnsureSeed(storeId);
    const list = await catalogList(storeId);
    res.json({ success: true, store_id: storeId, catalog: list });
  } catch (err) {
    console.error('[catalog] GET gagal:', err.message);
    res.status(500).json({ error: 'Gagal memuat katalog produk.' });
  }
});

// POST /api/toko-pintar/catalog
app.post('/api/toko-pintar/catalog', async (req, res) => {
  const { store_id = 'default', name, category, price, stock, description, shipping_info } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Nama produk dan harga wajib diisi.' });
  }

  const storeId = store_id.toString().slice(0, 100);
  const newProd = {
    id: 'prod_' + Date.now(),
    name: name.trim(),
    category: (category || 'Umum').trim(),
    price: Number(price) || 0,
    stock: Number(stock) || 0,
    description: (description || '').trim(),
    shipping_info: (shipping_info || '').trim()
  };

  try {
    await catalogEnsureSeed(storeId);
    await catalogCreate(storeId, newProd);
    const list = await catalogList(storeId);
    res.json({ success: true, product: newProd, catalog: list });

    // Trigger Langflow ingestion async (non-blocking)
    triggerLangflowIngestion(catalogToText(list, storeId));
  } catch (err) {
    console.error('[catalog] POST gagal:', err.message);
    res.status(500).json({ error: 'Gagal menyimpan produk.' });
  }
});

// DELETE /api/toko-pintar/catalog/:id
app.delete('/api/toko-pintar/catalog/:id', async (req, res) => {
  const { id } = req.params;
  const storeId = (req.query.store_id || 'default').toString().slice(0, 100);
  try {
    await catalogEnsureSeed(storeId);
    await catalogRemove(storeId, id);
    const list = await catalogList(storeId);
    res.json({ success: true, catalog: list });

    // Re-sync after delete
    triggerLangflowIngestion(catalogToText(list, storeId));
  } catch (err) {
    console.error('[catalog] DELETE gagal:', err.message);
    res.status(500).json({ error: 'Gagal menghapus produk.' });
  }
});

// POST /api/toko-pintar/sync — manual sync trigger from Settings UI
app.post('/api/toko-pintar/sync', async (req, res) => {
  const storeId = (req.body.store_id || 'default').toString().slice(0, 100);
  try {
    const catalog = await catalogList(storeId);
    await triggerLangflowIngestion(catalogToText(catalog, storeId));
    res.json({ success: true, synced: catalog.length, store_id: storeId });
  } catch (err) {
    console.error('[catalog] sync gagal:', err.message);
    res.status(500).json({ success: false, error: 'Sync katalog gagal.' });
  }
});

// POST /api/toko-pintar/chat (RAG CS Engine — Langflow RAG → Gemini fallback)
app.post('/api/toko-pintar/chat', csChatLimiter, async (req, res) => {
  const { store_id = 'default', store_name = 'Toko UMKM Pintar', query, conversation = [] } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Field "query" wajib diisi.' });
  }

  // ── Try Langflow RAG first ────────────────────────────────
  if (langflowConfig.ragFlowId) {
    try {
      const answer = await langflowRun(langflowConfig.ragFlowId, query, { sessionId: store_id });
      if (!answer) throw new Error('Langflow tidak mengembalikan respons.');
      return res.json({ success: true, answer, store_name, engine: 'langflow-rag' });
    } catch (err) {
      console.warn('[toko-pintar/chat] Langflow failed, falling back to Gemini:', err.message);
    }
  }

  // ── Fallback: Gemini/Groq with full catalog context ───────
  await catalogEnsureSeed(store_id);
  const catalog = await catalogList(store_id);
  const formattedCatalog = catalog.length > 0 ? catalog.map((p, i) => `
[Produk ${i + 1}]
- Nama Produk: ${p.name}
- Kategori: ${p.category || '-'}
- Harga: Rp ${Number(p.price).toLocaleString('id-ID')}
- Stok Tersedia: ${p.stock} pcs
- Deskripsi: ${p.description || '-'}
- Catatan Pengiriman: ${p.shipping_info || '-'}
`).join('\n') : 'Belum ada produk di katalog toko.';

  const csSystemPrompt = `\
Kamu adalah Customer Service AI resmi 24/7 untuk toko "${store_name}".
Tugasmu adalah membantu pelanggan toko yang bertanya tentang ketersediaan barang, harga, varian, ongkir, dan deskripsi produk secara ramah, sopan, dan akurat.

KATALOG PRODUK TOKO SAAT INI:
${formattedCatalog}

ATURAN CUSTOMER SERVICE SANGAT PENTING:
1. Jawab pertanyaan pelanggan HANYA berdasarkan data katalog toko resmi di atas.
2. Jika pelanggan menanyakan stok/harga/spesifikasi, berikan angka dan informasi yang tepat dari katalog.
3. Jika barang yang ditanyakan TIDAK ADA di katalog, katakan dengan sopan: "Mohon maaf Kak, produk tersebut belum ada di katalog toko kami saat ini."
4. Selalu sapa pelanggan dengan kata "Kak", gunakan Bahasa Indonesia yang ramah, sopan, dan membantu.
5. Berikan saran cara order jika pembeli ingin memesan (contoh: checkout atau via WhatsApp toko).`;

  const chatHistory = [
    ...conversation.map(m => ({ role: m.role === 'model' ? 'model' : 'user', text: m.text || '' })),
    { role: 'user', text: query }
  ];

  try {
    let resultText;
    try {
      resultText = await callGemini(chatHistory, csSystemPrompt);
    } catch {
      resultText = await callGroq(chatHistory, csSystemPrompt);
    }
    return res.json({ success: true, answer: resultText, store_name, engine: 'gemini-fallback' });
  } catch (err) {
    console.error('[toko-pintar/chat]', err);
    return res.status(500).json({ error: clientError(err, 'Gagal merespons pertanyaan CS. Silakan coba lagi.') });
  }
});

// ── LLM Caller: Gemini ────────────────────────────────────────
async function callGemini(conversation, customInstruction = SYSTEM_PROMPT) {
  const client = getGeminiClient();
  if (!client) throw new Error('Kunci API Google AI belum dikonfigurasi di server.');

  const contents = conversation.map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text || '' }]
  }));

  const modelsToTry = [PROVIDERS.gemini.model, ...PROVIDERS.gemini.fallbackModels];
  let lastErr;
  for (const modelId of modelsToTry) {
    try {
      const response = await client.models.generateContent({
        model: modelId,
        contents,
        config: { temperature: 0.7, topP: 0.9, topK: 40, systemInstruction: customInstruction }
      });
      if (!response?.text) throw new Error('Gemini tidak mengembalikan respons.');
      return response.text;
    } catch (err) {
      lastErr = err;
      console.warn(`[gemini] Model ${modelId} failed: ${err.message}.`);
    }
  }
  throw lastErr;
}

// ── LLM Caller: Groq ──────────────────────────────────────────
async function callGroq(conversation, customInstruction = SYSTEM_PROMPT) {
  const client = getGroqClient();
  if (!client) throw new Error('Kunci API Groq belum dikonfigurasi di server.');

  const messages = [
    { role: 'system', content: customInstruction },
    ...conversation.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.text || ''
    }))
  ];

  const modelsToTry = [PROVIDERS.groq.model, ...PROVIDERS.groq.fallbackModels];
  let lastErr;
  for (const modelId of modelsToTry) {
    try {
      const completion = await client.chat.completions.create({
        model: modelId, messages, temperature: 0.7, max_tokens: 2048, top_p: 0.9
      });
      const text = completion.choices?.[0]?.message?.content;
      if (!text) throw new Error('Groq tidak mengembalikan respons.');
      return text;
    } catch (err) {
      lastErr = err;
      console.warn(`[groq] Model ${modelId} failed: ${err.message}.`);
    }
  }
  throw lastErr;
}

// ── LLM Caller: OpenRouter ───────────────────────────────────
async function callOpenRouter(conversation, customInstruction = SYSTEM_PROMPT) {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error('Kunci API OpenRouter belum dikonfigurasi di server.');

  const messages = [
    { role: 'system', content: customInstruction },
    ...conversation.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.text || ''
    }))
  ];

  const modelsToTry = [PROVIDERS.openrouter.model, ...PROVIDERS.openrouter.fallbackModels];
  let lastErr;
  for (const modelId of modelsToTry) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'MitraKu AI'
        },
        body: JSON.stringify({
          model: modelId,
          messages: messages,
          temperature: 0.7,
          max_tokens: 2048
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || `OpenRouter model ${modelId} error`);
      }

      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('OpenRouter tidak mengembalikan respons.');
      return text;
    } catch (err) {
      lastErr = err;
      console.warn(`[openrouter] Model ${modelId} failed: ${err.message}.`);
    }
  }
  throw lastErr;
}

// ── Server Start ──────────────────────────────────────────────
// Guard: hanya listen saat index.js dijalankan langsung (node index.js / npm start);
// saat di-import oleh Vercel (api/index.js) cukup export app-nya saja.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const server = app.listen(PORT, () => {
    const geminiReady = !!process.env.GEMINI_API_KEY?.trim();
    const groqReady   = !!process.env.GROQ_API_KEY?.trim();
    const openRouterReady = !!process.env.OPENROUTER_API_KEY?.trim();

    console.log(`\n🚀 MitraKu AI — http://localhost:${PORT}`);
    console.log(`   Gemini     : ${geminiReady ? '✓ Siap' : '✗ Isi GEMINI_API_KEY di .env'}`);
    console.log(`   Groq       : ${groqReady   ? '✓ Siap' : '✗ Opsional (GROQ_API_KEY)'}`);
    console.log(`   OpenRouter : ${openRouterReady ? '✓ Siap' : '✗ Opsional (OPENROUTER_API_KEY)'}\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${PORT} sedang digunakan. Tutup proses lain lalu jalankan 'npm start'.\n`);
    } else {
      console.error('Server error:', err);
    }
  });
}

export default app;
