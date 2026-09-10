import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import rateLimit from 'express-rate-limit';

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
    fallbackModels: ['gemini-2.5-flash-lite', 'gemini-1.5-flash']
  },
  groq: {
    model: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B (Groq)',
    fallbackModels: ['llama-3.1-70b-versatile', 'llama3-70b-8192']
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
  const provider = req.body.provider === 'groq' ? 'groq' : 'gemini';
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

    if (provider === 'openrouter') {
      try {
        text = await callOpenRouter(safeConv, activeSystemPrompt);
      } catch (orErr) {
        console.warn('[chat] OpenRouter error, trying Gemini fallback:', orErr.message);
        if (process.env.GEMINI_API_KEY?.trim()) {
          text = await callGemini(safeConv, activeSystemPrompt);
          actualProvider = 'gemini (fallback)';
        } else {
          throw orErr;
        }
      }
    } else if (provider === 'gemini') {
      try {
        text = await callGemini(safeConv, activeSystemPrompt);
      } catch (geminiErr) {
        console.warn('[chat] Gemini error, trying Groq fallback:', geminiErr.message);
        if (process.env.GROQ_API_KEY?.trim()) {
          text = await callGroq(safeConv, activeSystemPrompt);
          actualProvider = 'groq (fallback)';
        } else {
          throw geminiErr;
        }
      }
    } else {
      try {
        text = await callGroq(safeConv, activeSystemPrompt);
      } catch (groqErr) {
        console.warn('[chat] Groq error, trying Gemini fallback:', groqErr.message);
        if (process.env.GEMINI_API_KEY?.trim()) {
          text = await callGemini(safeConv, activeSystemPrompt);
          actualProvider = 'gemini (fallback)';
        } else {
          throw groqErr;
        }
      }
    }

    return res.json({ result: text, provider: actualProvider });
  } catch (err) {
    console.error(`[chat] ${provider}:`, err?.message || err);
    return res.status(500).json({ error: err?.message || 'Terjadi kesalahan pada server AI.' });
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

  try {
    const client = getGeminiClient();
    if (!client) throw new Error('GEMINI_API_KEY belum diisi di file .env.');

    const response = await client.models.generateContent({
      model: PROVIDERS.gemini.model,
      contents: [{ role: 'user', parts: [{ text: userInfo }] }],
      config: {
        temperature: 0.8,
        topP: 0.95,
        systemInstruction: basePrompt
      }
    });

    if (!response?.text) throw new Error('AI tidak mengembalikan respons.');

    let rawText = response.text.trim();
    rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const siStart = rawText.indexOf('{');
    const siEnd   = rawText.lastIndexOf('}');
    if (siStart !== -1 && siEnd !== -1 && siEnd >= siStart) rawText = rawText.substring(siStart, siEnd + 1);

    const result = JSON.parse(rawText);
    return res.json({ success: true, platform, result });
  } catch (err) {
    console.error('[copywriting]', err?.message || err);
    return res.status(500).json({ error: 'Gagal generate copywriting: ' + (err?.message || err) });
  }
});

// ── POST /api/brand-kit ───────────────────────────────────────
// Modul 3 — Brand Kit Generator
app.post('/api/brand-kit', async (req, res) => {
  const { brand_name, product_type, personality } = req.body;

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

  const promptInput = `
Nama Brand: ${brand_name}
Jenis Produk / Industri: ${product_type || 'Umum'}
Kepribadian / Impression Brand: ${personality || 'Modern & Terpercaya'}

PENTING: Berikan palet warna HEX yang sangat harmonis dan kontras yang pas sesuai karakter brand. Output HANYA JSON valid tanpa markdown, tanpa teks tambahan apapun.`;

  try {
    const client = getGeminiClient();
    if (!client) throw new Error('GEMINI_API_KEY belum diisi di file .env.');

    const response = await client.models.generateContent({
      model: PROVIDERS.gemini.model,
      contents: [{ role: 'user', parts: [{ text: promptInput }] }],
      config: {
        temperature: 0.75,
        topP: 0.95,
        systemInstruction: brandKitSystemPrompt
      }
    });

    if (!response?.text) throw new Error('AI tidak mengembalikan respons.');

    let rawText = response.text.trim();
    rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const bkStart = rawText.indexOf('{');
    const bkEnd   = rawText.lastIndexOf('}');
    if (bkStart !== -1 && bkEnd !== -1 && bkEnd >= bkStart) rawText = rawText.substring(bkStart, bkEnd + 1);

    const result = JSON.parse(rawText);
    return res.json({ success: true, result });
  } catch (err) {
    console.error('[brand-kit]', err?.message || err);
    return res.status(500).json({ error: 'Gagal generate brand kit: ' + (err?.message || err) });
  }
});

// ── POST /api/brand-kit/render-png ────────────────────────────
// Puppeteer PNG Export for Brand Kit
app.post('/api/brand-kit/render-png', async (req, res) => {
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

  try {
    const client = getGeminiClient();
    if (!client) throw new Error('GEMINI_API_KEY belum diisi di file .env.');

    const response = await client.models.generateContent({
      model: PROVIDERS.gemini.model,
      contents: [{ role: 'user', parts: [{ text: promptInput }] }],
      config: {
        temperature: 0.7,
        topP: 0.9,
        systemInstruction: marketResearchPrompt
      }
    });

    if (!response?.text) throw new Error('AI tidak mengembalikan respons.');

    let rawText = response.text.trim();
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
    return res.status(500).json({ error: 'Gagal analisis riset pasar: ' + (err?.message || err) });
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

// GET /api/toko-pintar/catalog
app.get('/api/toko-pintar/catalog', (req, res) => {
  const storeId = req.query.store_id || 'default';
  const list = storeCatalogs[storeId] || storeCatalogs.default || [];
  res.json({ success: true, store_id: storeId, catalog: list });
});

// POST /api/toko-pintar/catalog
app.post('/api/toko-pintar/catalog', (req, res) => {
  const { store_id = 'default', name, category, price, stock, description, shipping_info } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Nama produk dan harga wajib diisi.' });
  }

  if (!storeCatalogs[store_id]) {
    storeCatalogs[store_id] = [...DEFAULT_CATALOG];
  }

  const newProd = {
    id: 'prod_' + Date.now(),
    name: name.trim(),
    category: (category || 'Umum').trim(),
    price: Number(price) || 0,
    stock: Number(stock) || 0,
    description: (description || '').trim(),
    shipping_info: (shipping_info || '').trim()
  };

  storeCatalogs[store_id].unshift(newProd);
  saveCatalogs(storeCatalogs);

  res.json({ success: true, product: newProd, catalog: storeCatalogs[store_id] });
});

// DELETE /api/toko-pintar/catalog/:id
app.delete('/api/toko-pintar/catalog/:id', (req, res) => {
  const { id } = req.params;
  const storeId = req.query.store_id || 'default';

  if (!storeCatalogs[storeId]) {
    storeCatalogs[storeId] = [...DEFAULT_CATALOG];
  }

  storeCatalogs[storeId] = storeCatalogs[storeId].filter(p => p.id !== id);
  saveCatalogs(storeCatalogs);

  res.json({ success: true, catalog: storeCatalogs[storeId] });
});

// POST /api/toko-pintar/chat (RAG CS Engine — Hybrid: Langflow RAG → Gemini fallback)
app.post('/api/toko-pintar/chat', csChatLimiter, async (req, res) => {
  const { store_id = 'default', store_name = 'Toko UMKM Pintar', query, conversation = [] } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Field "query" wajib diisi.' });
  }

  // ── Jalur Gemini/Groq dengan katalog sebagai context ─────
  const catalog = storeCatalogs[store_id] || storeCatalogs.default || [];

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
    return res.status(500).json({ error: 'Gagal merespons pertanyaan CS: ' + (err?.message || err) });
  }
});

// ── LLM Caller: Gemini ────────────────────────────────────────
async function callGemini(conversation, customInstruction = SYSTEM_PROMPT) {
  const client = getGeminiClient();
  if (!client) throw new Error('GEMINI_API_KEY belum diisi di file .env.');

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
  if (!client) throw new Error('GROQ_API_KEY belum diisi di file .env.');

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
  if (!key) throw new Error('OPENROUTER_API_KEY belum diisi di file .env.');

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
