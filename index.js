import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const SYSTEM_PROMPT = `\
Kamu adalah KontenKu AI, asisten pintar khusus untuk pelaku UMKM Indonesia.

Tujuanmu adalah membantu pemilik usaha kecil dan menengah membuat konten produk \
yang menarik, faktual, dan siap dipasarkan di Shopee, TikTok Shop, atau Instagram.

Cara kerjamu:
1. Sapa dengan ramah dan tanyakan nama brand/usaha mereka.
2. Panduan langkah demi langkah: kumpulkan info produk (nama varian, bahan, berat, \
   cara penyajian, cara penyimpanan, nomor legalitas NIB/SPP-IRT/Halal).
3. Setelah data lengkap, ringkas dan konfirmasi ulang ke pengguna.
4. Informasikan bahwa sistem akan memproses pembuatan 9 konten visual + 1 video promosi.
5. Jika pengguna sudah konfirmasi, katakan kamu sedang memproses via pipeline otomasi.

Aturan penting:
- Gunakan Bahasa Indonesia yang hangat, santai, dan mudah dipahami pelaku UMKM.
- JANGAN mengarang data faktual — jika pengguna belum memberikan NIB atau bahan, tanyakan.
- Fokus pada topik: produk UMKM, konten e-commerce, legalitas usaha, branding sederhana.
- Untuk pertanyaan di luar topik bisnis UMKM, tolak dengan sopan dan arahkan kembali.
- Gunakan emoji secukupnya agar terasa lebih personal dan tidak kaku.`;

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
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/providers', (_req, res) => {
  res.json({
    gemini: { ...PROVIDERS.gemini, available: !!process.env.GEMINI_API_KEY?.trim() },
    groq: { ...PROVIDERS.groq, available: !!process.env.GROQ_API_KEY?.trim() }
  });
});

app.post('/api/chat', async (req, res) => {
  const provider = req.body.provider === 'groq' ? 'groq' : 'gemini';
  const conversation = req.body.conversation;

  if (!Array.isArray(conversation) || conversation.length === 0) {
    return res.status(400).json({ error: 'Field "conversation" harus berupa array dan tidak boleh kosong.' });
  }

  try {
    const text = provider === 'groq'
      ? await callGroq(conversation)
      : await callGemini(conversation);

    return res.json({ result: text, provider });
  } catch (err) {
    console.error(`[chat] ${provider}:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/trigger-pipeline', async (req, res) => {
  const webhookUrl = process.env.N8N_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return res.status(503).json({
      error: 'Pipeline otomasi belum terhubung. Tambahkan N8N_WEBHOOK_URL di file .env.'
    });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    const result = await response.json();
    return res.json({ success: true, pipeline: result });
  } catch (err) {
    console.error('[pipeline]', err.message);
    return res.status(500).json({ error: 'Gagal menghubungi pipeline n8n: ' + err.message });
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

app.listen(PORT, () => {
  const geminiReady = !!process.env.GEMINI_API_KEY?.trim();
  const groqReady = !!process.env.GROQ_API_KEY?.trim();
  const n8nReady = !!process.env.N8N_WEBHOOK_URL?.trim();

  console.log(`KontenKu AI — http://localhost:${PORT}`);
  console.log(`  Gemini   : ${geminiReady ? '✓' : '✗ (isi GEMINI_API_KEY)'}`);
  console.log(`  Groq     : ${groqReady ? '✓' : '✗ (opsional)'}`);
  console.log(`  n8n Hook : ${n8nReady ? '✓' : '✗ (isi N8N_WEBHOOK_URL untuk pipeline penuh)'}`);
});
