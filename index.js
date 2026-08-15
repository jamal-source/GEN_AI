/**
 * DevTutor AI — Backend Server
 * Final Project Sesi 3 — Hacktiv8
 *
 * Author  : Jamaludin
 * Univ    : Universitas Putra Bangsa Kebumen
 *
 * Providers:
 *   - gemini  → Google Gemini 2.5 Flash
 *   - groq    → Llama 3.3 70B via Groq (open-source)
 */

import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import path    from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI }   from '@google/genai';
import Groq              from 'groq-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

// ── System Instruction (sama untuk kedua provider) ────────
const SYSTEM_INSTRUCTION = `\
Kamu adalah DevTutor AI, seorang mentor pemrograman web dan software engineer senior \
yang ramah, sabar, dan komunikatif.

Tujuan utama kamu adalah membantu pemula (mahasiswa/learner) memahami konsep pemrograman \
— khususnya HTML, CSS, JavaScript, Node.js, Express, dan REST API — serta membimbing \
mereka dalam melakukan debugging kode error secara terstruktur.

Aturan & Batasan:
1. Bahasa     : Gunakan Bahasa Indonesia yang jelas dan mudah dipahami oleh pemula.
2. Komunikasi : Berikan penjelasan teknis berstruktur; gunakan analogi jika membantu; \
                sampaikan dalam poin-poin agar mudah dibaca.
3. Debugging  : Ketika pengguna mengirim pesan error atau kode bermasalah, jelaskan \
                PENYEBAB-nya terlebih dahulu, lalu berikan SOLUSI bertahap. \
                Jangan sekadar menempel perbaikan kode tanpa penjelasan.
4. Domain     : Fokus pada pemrograman, pengembangan web, arsitektur software, \
                dan AI integration. Tolak pertanyaan di luar domain ini secara sopan.
5. Faktual    : Jangan mengarang sintaksis, library, atau API yang tidak ada. \
                Jika tidak yakin, katakan dengan jujur.
6. Format     : Gunakan blok kode Markdown (triple backtick) saat menampilkan kode.`;

// ── Provider Config ───────────────────────────────────────
const PROVIDERS = {
  gemini : { model: 'gemini-2.5-flash',    label: 'Gemini 2.5 Flash' },
  groq   : { model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Groq)' }
};

// Singleton clients — inisiasi sekali saja
let geminiClient = null;
let groqClient   = null;

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

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── GET /api/providers — info provider yang tersedia ─────
app.get('/api/providers', (_req, res) => {
  res.json({
    gemini : { ...PROVIDERS.gemini, available: !!process.env.GEMINI_API_KEY?.trim() },
    groq   : { ...PROVIDERS.groq,   available: !!process.env.GROQ_API_KEY?.trim()   }
  });
});

// ── POST /api/chat ────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const provider         = req.body.provider === 'groq' ? 'groq' : 'gemini';
  const conversationInput = req.body.conversation;

  if (!Array.isArray(conversationInput) || conversationInput.length === 0) {
    return res.status(400).json({
      error: 'Request tidak valid: field "conversation" harus berupa array dan tidak boleh kosong.'
    });
  }

  try {
    let responseText;

    if (provider === 'groq') {
      responseText = await callGroq(conversationInput);
    } else {
      responseText = await callGemini(conversationInput);
    }

    return res.status(200).json({ result: responseText, provider });
  } catch (err) {
    console.error(`[/api/chat] ${provider} error:`, err.message);
    return res.status(500).json({
      error: err.message || `Terjadi kesalahan saat berkomunikasi dengan ${PROVIDERS[provider].label}.`
    });
  }
});

// ── Gemini Handler ────────────────────────────────────────
async function callGemini(conversation) {
  const client = getGeminiClient();
  if (!client) throw new Error('GEMINI_API_KEY belum diisi di file .env.');

  const contents = conversation.map((msg) => ({
    role  : msg.role === 'model' ? 'model' : 'user',
    parts : [{ text: msg.text || '' }]
  }));

  const response = await client.models.generateContent({
    model    : PROVIDERS.gemini.model,
    contents : contents,
    config   : {
      temperature       : 0.2,
      topP              : 0.85,
      topK              : 40,
      systemInstruction : SYSTEM_INSTRUCTION
    }
  });

  if (!response?.text) throw new Error('Gemini API tidak mengembalikan respons teks.');
  return response.text;
}

// ── Groq / Llama Handler ──────────────────────────────────
async function callGroq(conversation) {
  const client = getGroqClient();
  if (!client) throw new Error('GROQ_API_KEY belum diisi di file .env. Dapatkan gratis di https://console.groq.com');

  // Format pesan ke OpenAI-compatible messages array
  const messages = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...conversation.map((msg) => ({
      role    : msg.role === 'model' ? 'assistant' : 'user',
      content : msg.text || ''
    }))
  ];

  const completion = await client.chat.completions.create({
    model       : PROVIDERS.groq.model,
    messages    : messages,
    temperature : 0.2,
    max_tokens  : 4096,
    top_p       : 0.85
  });

  const text = completion.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq API tidak mengembalikan respons teks.');
  return text;
}

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  const geminiReady = !!process.env.GEMINI_API_KEY?.trim();
  const groqReady   = !!process.env.GROQ_API_KEY?.trim();
  console.log(`DevTutor AI berjalan di http://localhost:${PORT}`);
  console.log(`  Gemini  : ${geminiReady ? '✓ siap' : '✗ API key belum diisi'}`);
  console.log(`  Groq    : ${groqReady   ? '✓ siap' : '✗ API key belum diisi'}`);
});
