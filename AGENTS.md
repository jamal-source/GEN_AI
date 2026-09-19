# AGENTS.md — Konteks Project untuk Agent (IBM Bob & rekan AI)

File ini otomatis dibaca agent (terutama **IBM Bob**) setiap sesi agar paham struktur,
keputusan arsitektur, dan sumber kebenaran (source of truth / SOT) sebelum mengubah apa pun.

## Apa project ini

- **Nama app**: Mitraku (Mitraku AI) — asisten bisnis UKM Indonesia.
- **Repositori root** berisi **5 modul** (kotak modular; jangan satukan):
  - **Dashboard** — ringkasan performa bisnis per kategori.
  - **CS Chat RAG** — tanya-jawab pelanggan dengan _retrieval-augmented generation_
    (RAG) bertenaga **Langflow** (flow Mitraku RAG).
  - **Copywriting** — generasi copy iklan/deskripsi (multi-moda: gambar/video).
  - **Brand Kit** — identitas brand (logo, palet, panduan).
  - **Riset Pasar** — riset pasar untuk produk/bisnis.
- **Arsitektur teknis**: SPA frontend (`public/`) + API backend Express (`api/`)
  + API Serverless Vercel. Lihat **MASTER_PROJECT.md** untuk arsitektur penuh
  (gambar diagram + peta endpoint lengkap).

## Sumber kebenaran (SOT) — BACA DULU SEBELUM MENGUBAH

1. **MASTER_PROJECT.md** — satu-satunya dokumen sumber kebenaran arsitektur & roadmap.
   Semua perubahan arsitektur/plan TULIS di changelog-nya.
2. **`getActiveProductContext()`** di `public/script.js` — konteks produk AKTIF
   (dari `localStorage["PRODUCT_KEY"]`). Ini SOT **_product context_** yang di-prefill
   otomatis ke handler AI di **3 modul**: Copywriting, Brand Kit, Riset Pasar.
3. **`api/index.js`** — SOT backend Express: semua endpoint `/api/*`, logika fallback
   AI (Gemini → Groq → OpenRouter), dan default `product_context` di `apiFetch`.

## Aturan konvensi kode (kepatuhan)

- **Cache-busting**: app adalah SPA yang dideploy Vercel. SETIAP perubahan file di
  `public/` (JS/CSS) WAJIB bump versi di query string pemuatannya (pola `?v=X.Y`),
  mis. `script.js?v=7.0`, `app.js?v=4.9`. Jangan pernah menimpa cache ke versi lama.
- **Jangan hapus/ubah file `public/` secara buta** — SPA indikatornya: perubahan
  `?v=` harus naik. Verifikasi dengan uji-contoh (menjaga SPA berfungsi).
- **Buat perubahan terverifikasi** — jangan insert code tanpa tes terhadap behavior
  aktual (lihat route di `api/*` dan flow aktif di konfigurasi Langflow).

## Peta endpoint cepat (ringkas; detail di MASTER_PROJECT.md)

Buka `api/index.js` untuk daftar persis. Pola umum:
- `POST /api/v1/...` handler AI, menerima `{}`/multipart (gambar/video), memakai
  `product_context` default + fallback chain Gemini→Groq→OpenRouter.
- `apiFetch(route, opts)` di `public/script.js` menambahkan `product_context` premium
  secara transparan ke semua request AI.

## Langflow ↔ MCP (IBM Bob)

- **Flow RAG Mitraku** dijalankan Langflow **docker lokal** `localhost:7860`
  (service `mitraku_langflow`; `docker compose up -d langflow`).
- **Bob terhubung ke Langflow via MCP SSE** — server MCP `langflow` diregistrasi di
  `.bob/mcp.json` → `http://localhost:7860/api/v1/mcp/sse`. Setelah langflow docker
  UP, Bob bisa memanggil tool MCP Langflow (rag) untuk menjawab pertanyaan RAG.
- Tunnel ngrok yang dipakai app **TIDAK expose MCP** (hanya REST API flow run);
  koneksi MCP Bob→Langflow yang benar adalah via docker lokal, bukan tunnel.
- Cek status sambungan: `bob mcp list` (harus tampak `langflow` sse, enabled).

## Menjalankan & verifikasi

```bash
bob mcp list                    # cek MCP terhubung (termasuk langflow sse)
docker compose up -d langflow   # nyalakan Langflow kalau belum
# verifikasi SPA: load index + cek file ?v= konsisten dengan versi terbaru
```

## Prinsip kerja agent di sini

- **Investigate dulu, edit kemudian**: baca `api/index.js` & `public/script.js`
  sebelum mengubah; jangan menebak SOT.
- **Perubahan kecil yang terverifikasi**: buat perubahan atomic, uji, baru lanjut.
- **Jangan menimpa aset agent lain**: folder agent (mis. `.agents`, `.opencode`)
  digunakan ai-rekan; jika ragu, tanyakan dulu sebelum menghapus.
