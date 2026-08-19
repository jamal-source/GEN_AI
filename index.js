import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import rateLimit from 'express-rate-limit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// API Rate Limiter: Max 30 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan dari IP ini. Silakan coba lagi dalam 1 menit.' }
});

const SYSTEM_PROMPT = `\
Kamu adalah KontenKu AI, asisten pintar khusus untuk pelaku UMKM Indonesia.

Tujuanmu adalah membantu pemilik usaha kecil dan menengah membuat paket konten produk \
yang menarik, faktual, dan siap dipasarkan di Shopee, TikTok Shop, atau Instagram.

Cara kerjamu:
1. Sapa dengan ramah dan tanyakan nama brand/usaha serta produk mereka.
2. Panduan langkah demi langkah: kumpulkan info produk (nama varian, bahan/komposisi, berat/netto, \
   cara penyajian, cara penyimpanan, nomor legalitas NIB/SPP-IRT/Halal).
3. Setelah data lengkap, ringkas info produk tersebut dan konfirmasikan ke pengguna.
4. Tegaskan bahwa sistem KontenKu AI secara otomatis memproses dan merender 9 GAMBAR VISUAL (PNG 1080x1080) + 1 VIDEO PROMOSI (MP4) siap pakai.
5. Arahkan pengguna untuk menekan tombol "Buat Konten Sekarang" atau "Jalankan Pipeline" di layar untuk memulai generasi file gambar & video.

ATURAN SANGAT PENTING:
- JANGAN PERNAH katakan kamu tidak bisa membuat gambar atau video! Sistem aplikasi ini memiliki mesin render otomatis (Python Engine) yang akan membuat 9 file PNG 1080x1080px dan 1 file video MP4 asli.
- Gunakan Bahasa Indonesia yang hangat, ramah, santai, dan penuh semangat mendukung UMKM.
- JANGAN mengarang data faktual — jika pengguna belum memberikan NIB atau bahan, tanyakan dengan sopan.
- Gunakan emoji secukupnya agar terasa personal dan menyenangkan.`;

const PROVIDERS = {
  gemini: { model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  groq: { model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' }
};

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

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api/', apiLimiter);
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));
app.use('/output', express.static(path.join(__dirname, 'product-content-engine', 'output')));

app.get('/api/providers', (_req, res) => {
  res.json({
    gemini: { ...PROVIDERS.gemini, available: !!process.env.GEMINI_API_KEY?.trim() },
    groq: { ...PROVIDERS.groq, available: !!process.env.GROQ_API_KEY?.trim() }
  });
});

app.post('/api/title', async (req, res) => {
  const text = req.body.text || '';
  if (!text) return res.json({ title: 'Percakapan Baru' });

  const prompt = `Buatkan 1 judul percakapan singkat (maksimal 4 kata atau 35 karakter) tanpa tanda petik untuk topik awal berikut: "${text.substring(0, 150)}"`;

  // Try Gemini first
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
    // Try Groq fallback for title
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

  // Smart rule fallback
  let clean = text.replace(/^(saya|bantu|tolong|halo|ingat|saya punya|buatkan|bagaimana|cara)\s+/i, '').trim();
  clean = clean.split('\n')[0].substring(0, 30);
  const fallbackTitle = clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Percakapan Baru';
  return res.json({ title: fallbackTitle });
});

app.post('/api/chat', async (req, res) => {
  const provider = req.body.provider === 'groq' ? 'groq' : 'gemini';
  const conversation = req.body.conversation;

  if (!Array.isArray(conversation) || conversation.length === 0) {
    return res.status(400).json({ error: 'Field "conversation" harus berupa array dan tidak boleh kosong.' });
  }

  const isValidConv = conversation.every(m => m && typeof m === 'object' && typeof m.role === 'string' && typeof m.text === 'string');
  if (!isValidConv) {
    return res.status(400).json({ error: 'Format percakapan tidak valid. Setiap pesan harus memiliki atribut "role" dan "text".' });
  }

  try {
    let text;
    let actualProvider = provider;

    if (provider === 'gemini') {
      try {
        text = await callGemini(conversation);
      } catch (geminiErr) {
        console.warn('[chat] Gemini error (' + (geminiErr?.message || geminiErr) + '), attempting automatic fallback to Groq...');
        if (process.env.GROQ_API_KEY?.trim()) {
          try {
            text = await callGroq(conversation);
            actualProvider = 'groq (fallback)';
          } catch (groqErr) {
            throw new Error(`Gemini Error: ${geminiErr.message} | Groq Fallback Error: ${groqErr.message}`);
          }
        } else {
          throw new Error(`Gemini error: ${geminiErr.message}. (Tips: Tambahkan GROQ_API_KEY di Vercel/Environment Variables untuk cadangan otomatis)`);
        }
      }
    } else {
      try {
        text = await callGroq(conversation);
      } catch (groqErr) {
        console.warn('[chat] Groq error (' + (groqErr?.message || groqErr) + '), attempting automatic fallback to Gemini...');
        if (process.env.GEMINI_API_KEY?.trim()) {
          try {
            text = await callGemini(conversation);
            actualProvider = 'gemini (fallback)';
          } catch (geminiErr) {
            throw new Error(`Groq Error: ${groqErr.message} | Gemini Fallback Error: ${geminiErr.message}`);
          }
        } else {
          throw new Error(`Groq error: ${groqErr.message}. (Tips: Tambahkan GEMINI_API_KEY di Vercel/Environment Variables untuk cadangan otomatis)`);
        }
      }
    }

    return res.json({ result: text, provider: actualProvider });
  } catch (err) {
    console.error(`[chat] ${provider}:`, err?.message || err);
    return res.status(500).json({ error: err?.message || 'Terjadi kesalahan pada server AI.' });
  }
});

app.post('/api/trigger-pipeline', async (req, res) => {
  const conversation = req.body.conversation || [];
  const productCtx = req.body.product_context || {};

  // Extract brand name, variant, and text from product context or conversation history
  let brandName = productCtx.brand || '';
  let variantName = productCtx.variant || '';
  let infoText = productCtx.legalities ? `Legalitas: ${productCtx.legalities} ` : '';

  for (const msg of conversation) {
    const text = msg.text || '';
    infoText += text + ' ';
    if (!brandName && (text.toLowerCase().includes('brand') || text.toLowerCase().includes('merek') || text.toLowerCase().includes('usaha'))) {
      const parts = text.split(/brand|merek|usaha/i);
      if (parts.length > 1) {
        brandName = parts[1].replace(/[:=]/g, '').trim().split('\n')[0].substring(0, 30);
      }
    }
    if (!variantName && (text.toLowerCase().includes('varian') || text.toLowerCase().includes('produk'))) {
      const parts = text.split(/varian|produk/i);
      if (parts.length > 1) {
        variantName = parts[1].replace(/[:=]/g, '').trim().split('\n')[0].substring(0, 30);
      }
    }
  }

  const payload = {
    brand_name: (brandName || 'KontenKu UMKM').trim(),
    variant_name: (variantName || 'Produk Herbal').trim(),
    info: infoText.substring(0, 200)
  };

  const scriptPath = path.join(__dirname, 'product-content-engine', 'run_chat_pipeline.py');
  const tempInputPath = path.join(__dirname, 'product-content-engine', 'temp', `req_${Date.now()}.json`);

  try {
    const fs = await import('fs/promises');
    await fs.mkdir(path.dirname(tempInputPath), { recursive: true });
    await fs.writeFile(tempInputPath, JSON.stringify(payload), 'utf8');

    const { exec } = await import('child_process');
    const util = await import('util');
    const execPromise = util.promisify(exec);

    const { stdout } = await execPromise(`python "${scriptPath}" "${tempInputPath}"`);
    await fs.unlink(tempInputPath).catch(() => {});

    let jsonResult;
    try {
      const jsonStart = stdout.indexOf('{');
      if (jsonStart !== -1) {
        jsonResult = JSON.parse(stdout.substring(jsonStart));
      } else {
        jsonResult = { status: 'SUCCESS', message: stdout };
      }
    } catch (e) {
      jsonResult = { status: 'SUCCESS', message: stdout };
    }

    return res.json({ success: true, pipeline: jsonResult });
  } catch (err) {
    console.error('[pipeline error]', err);
    return res.status(500).json({ error: 'Gagal memproses pipeline Python: ' + (err?.message || err) });
  }
});

async function callGemini(conversation) {
  const client = getGeminiClient();
  if (!client) throw new Error('GEMINI_API_KEY belum diisi di file .env.');

  const contents = conversation.map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text || '' }]
  }));

  const response = await client.models.generateContent({
    model: PROVIDERS.gemini.model,
    contents,
    config: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      systemInstruction: SYSTEM_PROMPT
    }
  });

  if (!response?.text) throw new Error('Gemini tidak mengembalikan respons.');
  return response.text;
}

async function callGroq(conversation) {
  const client = getGroqClient();
  if (!client) throw new Error('GROQ_API_KEY belum diisi di file .env.');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversation.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.text || ''
    }))
  ];

  const completion = await client.chat.completions.create({
    model: PROVIDERS.groq.model,
    messages,
    temperature: 0.7,
    max_tokens: 2048,
    top_p: 0.9
  });

  const text = completion.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq tidak mengembalikan respons.');
  return text;
}

const server = app.listen(PORT, () => {
  const geminiReady = !!process.env.GEMINI_API_KEY?.trim();
  const groqReady = !!process.env.GROQ_API_KEY?.trim();
  const n8nReady = !!process.env.N8N_WEBHOOK_URL?.trim();

  console.log(`KontenKu AI — http://localhost:${PORT}`);
  console.log(`  Gemini   : ${geminiReady ? '✓' : '✗ (isi GEMINI_API_KEY)'}`);
  console.log(`  Groq     : ${groqReady ? '✓' : '✗ (opsional)'}`);
  console.log(`  n8n Hook : ${n8nReady ? '✓' : '✗ (isi N8N_WEBHOOK_URL untuk pipeline penuh)'}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ ERROR: Port ${PORT} sedang digunakan oleh proses lain.`);
    console.error(`   Tutup aplikasi/terminal yang menggunakan port ${PORT} lalu jalankan 'npm start' kembali.\n`);
  } else {
    console.error('Server error:', err);
  }
});
