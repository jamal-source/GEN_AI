# 🧠 MASTER PROJECT DOCUMENT — MitraKu AI

> **Dokumen ini adalah satu-satunya sumber kebenaran (Single Source of Truth) untuk proyek ini.**
> Setiap AI Agent, developer, atau kolaborator WAJIB membaca dokumen ini sebelum menyentuh kode apapun.
> Terakhir diperbarui: 13 September 2026

---

## 1. KONTEKS & SEJARAH PROYEK

### 1.1 Siapa Pembuatnya

- **Nama:** Jamaludin
- **Status:** Mahasiswa S1 Ilmu Komputer, Universitas Putra Bangsa Kebumen
- **Program:** Hacktiv8 — IBM Skillsbuild University Education | Hackathon Nasional - 1 Sept (Batch 1)
- **Level:** Full-stack developer mahir, nyaman debugging mandiri

### 1.2 Apa yang Terjadi Sebelumnya (Versi Lama — GAGAL)

Proyek awalnya bernama **KontenKu AI** dengan konsep:

> _"AI yang otomatis generate 9 gambar PNG (1080x1080px) + 1 video MP4 promosi untuk UMKM"_

**Mengapa konsep lama gagal:**

1. **Output visual jelek** — Template engine pakai Python Pillow menghasilkan kotak-kotak teks polos di background abu-abu. Tidak layak pakai untuk marketing.
2. **Terlalu kompleks** — Stack: Node.js + Python + Langflow + n8n + Astra DB + PostgreSQL + SQLite + Docker. Terlalu banyak moving parts untuk satu mahasiswa.
3. **Value proposition lemah** — UMKM tidak butuh 9 gambar teks polos. Canva gratis sudah jauh lebih bagus.
4. **Banyak fitur palsu** — Tombol upload file, tombol OpenRouter, regenerate button — semuanya tidak berfungsi seperti yang dijanjikan.
5. **Alur UX membingungkan** — Pengguna baru tidak tahu harus mulai dari mana.

### 1.3 Keputusan: PIVOT ke Konsep Baru

Setelah audit menyeluruh pada 9 September 2026, proyek di-**pivot total** ke MitraKu AI.

---

## 2. VISI PRODUK BARU

### 2.1 Nama Produk

**MitraKu AI** — _"Mitra Digital Cerdas untuk UMKM Indonesia"_

### 2.2 Tagline

> _"Satu AI, Semua Kebutuhan Marketing UMKM"_

### 2.3 Masalah yang Dipecahkan

UMKM Indonesia (khususnya skala kecil) menghadapi:

- Tidak punya tim marketing / tidak mampu bayar copywriter
- Tidak tahu cara menulis deskripsi produk yang menjual
- Tidak tahu harga kompetitor dan strategi positioning produk
- Tidak ada customer service 24 jam untuk menjawab pertanyaan pembeli
- Tidak punya identitas brand yang kuat dan konsisten

**MitraKu AI memecahkan semua ini dengan 5 modul terintegrasi.**

### 2.4 Target Pengguna

- Pemilik UMKM Indonesia skala mikro-kecil
- Usia 20-45 tahun, melek smartphone
- Jualan di Shopee, Tokopedia, TikTok Shop, atau Instagram
- Tidak punya latar belakang marketing formal

---

## 3. ARSITEKTUR PRODUK — 5 MODUL

```
+-------------------------------------------------------------+
|                      MitraKu AI Platform                    |
|             Dashboard UMKM -- Login & Multi-produk          |
+------------+-----------+-----------+-----------+------------+
|  MODUL 1   |  MODUL 2  |  MODUL 3  |  MODUL 4  |  MODUL 5  |
|   Toko     |  Riset    |  Brand    |   Copy    |   Mitra   |
|  Pintar    |  Pasar    |  Kit      |  Factory  |  Chat AI  |
|  (RAG)     |  Instan   |  Builder  |           |           |
+------------+-----------+-----------+-----------+-----------+
```

### MODUL 1 — Toko Pintar AI (RAG Customer Service)

**Apa:** Chatbot berbasis RAG yang menjadi customer service otomatis 24 jam.
**Cara kerja:**

1. UMKM input katalog produk (nama, harga, stok, deskripsi) via form web
2. Data otomatis di-embed ke Astra DB via Langflow saat produk ditambah/dihapus (fire-and-forget)
3. Pelanggan bisa tanya ke chatbot: "Ada ukuran M?", "Ongkir ke Surabaya?"
4. Chatbot menjawab dari vector search AstraDB (RAG) — bila Langflow tidak tersedia, otomatis fallback ke Gemini/Groq dengan konteks katalog penuh
5. Tersedia sebagai widget embed di website atau link shareable

**Konfigurasi:** Tab **⚙️ Pengaturan → kartu Integrasi** (kanan bawah grup "Pengaturan") → isi URL Langflow, Flow ID, dan kredensial AstraDB. Config tersimpan di `data/langflow-config.json` (bertahan saat server restart).

> **Catatan penamaan (v2.8):** Di UI pengguna, istilah teknis "RAG" disebut **"Pengetahuan AI"** agar ramah UMKM. ID field backend tetap `cfg-rag-flow-id` (wiring save/load tidak berubah).

**Tech:** Langflow + Astra DB + Gemini 2.5 Flash + Groq (fallback berlapis via "Pengetahuan AI")

### MODUL 2 — Riset Pasar Instan

**Apa:** Analisis cepat posisi produk di pasar.
**Input:** Nama produk + kategori + harga jual saat ini
**Output:**

- Estimasi rentang harga kompetitor sejenis
- 3 strategi diferensiasi produk
- 5 kata kunci SEO Shopee/Tokopedia yang relevan
- Rekomendasi platform jualan yang paling cocok

**Tech:** Gemini 2.0 Flash dengan prompt engineering khusus riset pasar

### MODUL 3 — Brand Kit Generator

**Apa:** Generator identitas brand lengkap yang bisa di-download.
**Input:** Nama usaha + jenis produk + pilihan kepribadian (Elegan/Playful/Tradisional/Modern)
**Output halaman HTML yang bisa di-screenshot/PDF:**

- 3 pilihan tagline
- Brand story (paragraf pendek)
- Palet warna (3 warna + kode hex)
- Panduan tone of voice
- 10 ide konten untuk feed Instagram/TikTok

**Tech:** Gemini 2.0 Flash -> render ke template HTML cantik -> Puppeteer screenshot -> PNG/PDF download

### MODUL 4 — Copywriting Factory (MULAI DARI SINI)

**Apa:** Mesin teks copywriting per platform, teroptimasi algoritma masing-masing.
**3 mode:**

- **Mode Shopee/Tokopedia:** Judul produk SEO + deskripsi 1500 karakter + bullet keunggulan + hashtag
- **Mode TikTok/Reels:** Hook 3 detik + skrip 30 detik + 15 hashtag FYP + ide sound
- **Mode Instagram:** Caption storytelling + CTA kuat + 20 hashtag + ide caption alternatif

**Input:** Nama produk + keunggulan utama + target pelanggan + pilihan mode
**Output:** Teks siap copas, 1-klik salin ke clipboard

**Tech:** Gemini 2.0 Flash dengan system prompt spesifik per platform

### MODUL 5 — Mitra Chat AI (Chatbot Utama)

**Apa:** Chatbot AI yang tahu konteks bisnis UMKM dan bisa ditanya apa saja seputar marketing.
**Fitur:**

- Tahu produk aktif yang diisi UMKM (product context)
- Riwayat percakapan per sesi
- Bisa generate copy on-the-fly dari chat
- Bisa redirect ke modul lain

**Tech:** Gemini 2.0 Flash (sudah ada di index.js, tinggal diperhalus)

---

## 4. TECH STACK KEPUTUSAN FINAL

| Layer            | Teknologi                  | Status               | Alasan                         |
| ---------------- | -------------------------- | -------------------- | ------------------------------ |
| Frontend         | HTML/CSS/JS single-page (tanpa framework) | SUDAH ADA       | Keputusan redesign: tetap satu file, dirapikan di tempat |
| Backend API      | Node.js Express (ESM)                     | LANJUTKAN       | Sudah ada, solid, dipakai di Vercel serverless          |
| AI / LLM         | Gemini 2.5 Flash + Groq GPT-OSS 120B + OpenRouter | SUDAH ADA | Rantai fallback otomatis (kuota habis → pindah provider) |
| RAG Engine       | IBM Langflow + Astra DB                   | ✅ LIVE         | Diintegrasikan ke Modul 1 (v2.7); UI menyebut "Pengetahuan AI" |
| Database User    | PostgreSQL (Neon di Vercel / Docker lokal) | ✅ LIVE (v2.8)  | Persist katalog toko multi-instance                     |
| Brand Kit Render | Puppeteer (Node.js)                       | SUDAH ADA       | HTML -> PNG/PDF yang cantik                             |
| Auth             | Clerk atau NextAuth                        | TAMBAH          | Multi-user UMKM (di luar scope fase ini)                |
| Deployment       | Vercel serverless (root `index.js`)       | ✅ LIVE (v2.8)  | Alias `gen-ai-theta-gold.vercel.app`; DB Neon terhubung |

---

## 5. KOMPONEN YANG DIHAPUS (DEPRECATED)

> JANGAN restore komponen ini. Sudah diputuskan untuk dihapus.

| File / Komponen                 | Lokasi                           | Alasan Dihapus                         |
| ------------------------------- | -------------------------------- | -------------------------------------- |
| template_engine.py              | product-content-engine/services/ | Pillow render jelek, diganti Puppeteer |
| video_worker.py                 | product-content-engine/services/ | OpenCV video terlalu kompleks          |
| ocr_vision_worker.py            | product-content-engine/services/ | Fitur sampingan, tidak terpakai        |
| quality_control.py              | product-content-engine/services/ | Hanya relevan untuk render engine lama |
| content_planner.py              | product-content-engine/services/ | Logic dipindah ke Langflow/Gemini      |
| gdrive_worker.py                | product-content-engine/services/ | Google Drive export bukan prioritas    |
| pipeline.py                     | product-content-engine/          | Master pipeline lama, tidak relevan    |
| run_chat_pipeline.py            | product-content-engine/          | Pipeline chat lama                     |
| run_langflow_adapter.py         | product-content-engine/          | Adapter untuk pipeline yang dihapus    |
| Tombol Lampirkan File           | public/index.html                | Fitur palsu hanya alert()              |
| Pilihan OpenRouter dropdown     | public/index.html                | ~~Backend tidak support~~ **REVERT v2.8: OpenRouter diaktifkan lagi** sebagai cadangan otomatis |
| Tombol Upload Foto              | public/index.html                | Membuka modal yang salah               |
| Tombol + Opsi Tambahan          | public/index.html                | Kirim chat otomatis tanpa tujuan       |
| Service n8n                     | docker-compose.yml               | Terlalu kompleks untuk tahap awal      |
| N8N_WEBHOOK_URL                 | .env                             | Tidak terpakai di arsitektur baru      |
| /api/trigger-pipeline endpoint  | index.js                         | Pipeline lama                          |
| /api/langflow-generate endpoint | index.js                         | Butuh n8n yang sudah dihapus           |
| langflow/mitraku_ingestion_flow.json | langflow/                  | Digabung ke satu file `langflow/Mitraku AI.json` (v2.7) |
| langflow/mitraku_rag_chat_flow.json  | langflow/                  | Digabung ke satu file `langflow/Mitraku AI.json` (v2.7) |
| Script migrasi & dump JSON        | root proyek                     | Scratch artifact sekali pakai (deleted) |

---

## 6. KOMPONEN YANG DIPERTAHANKAN

| Komponen                                | Status      | Catatan                         |
| --------------------------------------- | ----------- | ------------------------------- |
| index.js — /api/chat endpoint           | PERTAHANKAN | Bersihkan dead code             |
| index.js — /api/title endpoint          | PERTAHANKAN | Tidak ada perubahan             |
| public/script.js — Conversation Service | PERTAHANKAN | Core logic bagus                |
| public/style.css                        | PERTAHANKAN | Desain sudah bagus              |
| langflow/Mitraku AI.json                | PERTAHANKAN | Satu file flow gabungan (ingestion + RAG chat) |
| docker-compose.yml — PostgreSQL         | PERTAHANKAN | Database user                   |
| docker-compose.yml — Langflow           | PERTAHANKAN | RAG engine                      |
| data/langflow-config.json               | BARU (v2.7) | Config Integrasi, dibuat otomatis |
| product_service.py                      | ADAPTASI    | Simpan logika registrasi brand  |
| docs/langflow_system_prompt.txt         | UPDATE      | Perbarui untuk persona Mitra AI |
| docs/astra_db_metadata_spec.json        | PERTAHANKAN | Multi-tenancy spec relevan      |

---

## 7. TODO LIST — URUTAN PRIORITAS PENGERJAAN

### FASE 0 — Cleanup & Demolisi (LAKUKAN PERTAMA)

- [x] Hapus file Python yang deprecated (lihat Bagian 5)
- [x] Hapus tombol palsu dari public/index.html
- [x] Perbaiki label tombol upload foto menjadi "Kelola Produk"
- [x] Hapus service n8n dari docker-compose.yml
- [x] Hapus N8N_WEBHOOK_URL dari .env dan .env.example
- [x] Hapus /api/langflow-generate dari index.js
- [x] Hapus /api/trigger-pipeline dari index.js

### FASE 1 — Modul 4: Copywriting Factory (✅ SELESAI)

- [x] Buat halaman/section UI baru: "Copywriting Factory"
- [x] Buat form input: nama produk, keunggulan, target pelanggan, pilih platform
- [x] Buat 3 system prompt khusus per platform (Shopee, TikTok, Instagram)
- [x] Buat endpoint API baru: POST /api/copywriting di index.js
- [x] Tampilkan output teks dengan tombol "1-Klik Salin" per section
- [x] Tambahkan animasi loading yang nyata

### FASE 2 — Perbaikan Modul 5: Mitra Chat AI (✅ SELESAI)

- [x] Bersihkan SYSTEM_PROMPT di index.js untuk persona Mitra AI baru
- [x] Perbaiki checkProviderAvailability() — integrasi dengan GET /api/providers
- [x] Hapus pipeline banner yang bergantung keyword detection
- [x] Tambahkan onboarding tooltip untuk pengguna baru
- [x] Perbaiki tombol Buat Ulang — implementasi regenerate yang benar (real API re-fetch & state update)

### FASE 3 — Modul 3: Brand Kit Generator (✅ SELESAI)

- [x] Buat form input: nama usaha, jenis produk, kepribadian brand
- [x] Buat system prompt untuk generate identitas brand
- [x] Install Puppeteer: npm install puppeteer
- [x] Buat template HTML cantik untuk brand kit output (1200x1400 high-res format)
- [x] Implementasi: Gemini -> JSON -> inject HTML -> Puppeteer -> PNG
- [x] Endpoint API: POST /api/brand-kit dan POST /api/brand-kit/render-png
- [x] Tombol download PNG dan PDF / Cetak

### FASE 4 — Modul 1: Toko Pintar AI (✅ SELESAI)

- [x] Buat halaman "Katalog Produk" untuk UMKM input produk
- [x] Hubungkan form ke REST API `GET/POST/DELETE /api/toko-pintar/catalog`
- [x] Buat UI chatbot CS live simulation (`POST /api/toko-pintar/chat`)
- [x] Buat panel Link Shareable & Embed Code Widget Iframe untuk website UMKM
- [x] Test end-to-end RAG CS engine: input produk -> catalog memory -> CS AI merespons akurat

### FASE 5 — Modul 2: Riset Pasar Instan (✅ SELESAI)

- [x] Buat form input: nama produk, kategori, harga jual saat ini
- [x] Buat system prompt khusus analisis riset pasar e-commerce
- [x] Endpoint API: `POST /api/market-research` di index.js
- [x] Tampilkan output terstruktur: rentang harga kompetitor, 3 strategi diferensiasi, 5 kata kunci SEO e-commerce, rekomendasi platform jualan
- [x] Tambahkan View Tab ke-5: 📊 Riset Pasar di topbar & sidebar menu

### FASE 6 — Deployment & Infrastructure Readiness (✅ SELESAI)

- [x] Docker Multi-Container setup (`docker-compose.yml` dengan service `mitraku_web`, `mitraku_postgres`, `mitraku_langflow`)
- [x] Optimization `Dockerfile` dengan Alpine Chromium & font dependencies untuk Puppeteer PNG engine
- [x] PostgreSQL database initialization script (`database/init.sql`)
- [x] Pembersihan total codebase & pembaruan `package.json` v2.6.0
- [ ] Opsional Tahap Lanjutan: Migrasi ke Next.js 15 & Auth (Clerk/NextAuth) untuk skala enterprise Multi-Tenant

### FASE 7 — Integrasi Langflow RAG + AstraDB (✅ SELESAI)

- [x] Endpoint `/api/config` (GET dengan masking secret, POST dengan validasi URL)
- [x] Endpoint `/api/test-langflow` untuk uji koneksi server Langflow
- [x] Endpoint `/api/toko-pintar/sync` — sync manual katalog ke AstraDB
- [x] View baru **⚙️ Integrasi** (tab ke-6) — form konfigurasi Langflow & AstraDB
- [x] `POST /api/toko-pintar/chat` hybrid: RAG Langflow dulu → fallback otomatis ke Gemini/Groq
- [x] Trigger ingestion otomatis saat produk ditambah/dihapus (non-blocking)
- [x] Persistensi config ke `data/langflow-config.json` (survive restart)
- [x] Helper `langflowRun()` + `catalogToText()` — deduplikasi kode Langflow
- [x] Gabungkan 2 file flow lama menjadi `langflow/Mitraku AI.json`
- [x] Ketahanan frontend: localStorage budget (3.5MB), `apiFetch` dengan body-read timeout, modal accessibility

### FASE 8 — Pemeliharaan & Cleanup (✅ SELESAI)

- [x] Hapus ~50.400 baris artifact untracked (script migrasi, dump JSON Langflow/OpenAPI, screenshot)
- [x] Deduplikasi: `apiFetch`/`apiFetchJSON` → satu `apiFetch` dengan `bodyParser`
- [x] Hapus dead code: `widgetFetch`, `_emergencyPrune`, `loadingWatchdog`, guard counter
- [x] Bump `package.json` ke v2.7.0

### FASE 9 — Keamanan, Redesign UX & Deployment Live (P0–P6)

**Fase ini selesai bertahap; progress = status checkbox di bawah. Roadmap jalan terakhir 13 Sep 2026.**

- [x] **P0 — Keamanan & SSRF guard (v2.8).** `assertPublicHost()` memblokir semua host non-publik (IP privat/literal, localhost, hostname 1-label, TLD internal, IPv6, user:pass) sebelum request Langflow; DNS hostname harus resolve ke IP publik. `clientError()` mem-mask pola raw (nama env, token, path lengkap, detail network) di semua respons error → payload RAG trio (URL Langflow + Flow ID + koleksi) tidak pernah bocor ke log/respons. Pesan error kini ramah Bahasa Indonesia, tidak lagi menampilkan nama variabel env.
- [x] **P1 — Information Architecture.** Navigasi top-center diganti **sidebar grup** (Dashboard / AI Tools / Toko / Pengaturan / Workspace: riwayat). Tab *Integrasi* terpisah dihapus → konfigurasi Langflow pindah ke Pengaturan. Selector model: Recommended = Gemini, Fast = Groq. Istilah teknis "RAG" → **"Pengetahuan AI"** di semua label pengguna (badge chat, banner produk aktif, header chat tambahan, katalog, about, settings). Cache-bust `?v=5.0`.
- [x] **P2 — Design tokens.** Semua warna mentah diganti CSS custom property: `--color-success/-info/-warning/-danger/-danger-strong`, `--color-ai-{teal,purple,pink,orange}`, skala spacing `--space-1..10`, skala type `--text-xs..3xl`, focus ring konsisten. Nilai identik → **zero visual change** (diverifikasi, braces seimbang, status-dot `rgb(34,197,94)` tetap).
- [x] **BONUS — OpenRouter re-aktif + auto-fallback (v2.8).** Provider OpenRouter tampil lagi di selector sebagai "Cadangan otomatis · Multi-LM". Backend di-overhaul: rantai fallback BERTINGKAT di `POST /api/chat` — `gemini→groq→openrouter`, `groq→gemini→openrouter`, atau `openrouter→gemini→groq`; server otomatis geser ke provider berikutnya saat kuota/token habis, `provider` respons menandai `(fallback)`, UI menampilkan toast pemberitahuan. **Keputusan v2.8 ini membalik keputusan lama "hapus OpenRouter".**
- [x] **P3 — Core UX (SELESAI).** (a) RAG **jujur**: backend sudah menandai `engine` (`langflow-rag` / fallback), UI kini menampilkan tag sumber per jawaban CS — hijau "⚡ Dijawab oleh Pengetahuan AI (katalog toko)" hanya BILA RAG benar-benar menjawab, abu-abu "🧠 konteks katalog" bila fallback; sub-label static di-word-wrap jujur ("setiap jawaban menandai sumbernya"); \n(b) Produk Aktif kini dikirim ke Brand Kit (`product_context`) dan disuntik ke prompt (tagline/story/legalitas mengacu pada produk aktif); (c) dead refs OpenRouter/Gemini-ultra di script.js: bersih (sisa referensi = fitur aktif yang sah). Cache-bust `?v=5.1`.
- [x] **P4 — Sekunder (SELESAI).** script.js dibersihkan dengan hasil ukur: scanning id → HTML (tidak ada id yatim, keduanya dinamik: toast & chat-area), daftar fungsi vs pemanggilan JS/HTML (hanya `window.toggleModelMenu` yang mati → dihapus; handler menu ternyata sudah bind via `addEventListener`), tanpa TODO/FIXME/console.log/debugger. Tidak ada refactor berisiko tinggi; struktur IIFE + modul Settings standalone dibiarkan (koheren). Cache-bust `?v=5.2`.
- [x] **P6 - QA end-to-end & regenerasi MASTER_PLAN.md (SELESAI).** Peta & uji 21 endpoint (QA script `qa_local.mjs`): 21/21 PASS lokal. Ditemukan 3 endpoint AI (copywriting, brand-kit, market-research) yang sebelumnya Gemini-only & tanpa fallback -> dipasang rantai failover `gemini -> groq -> openrouter` (uji Gemini 503 teratasi otomatis). QA UI (Puppeteer): 6 view switch mulus, 3 model terpilih, 0 error konsol/HTTP (favicon data-URI ditambahkan); asersi katalog/asesi QA diperbaiki. LIVE QA Vercel (`qa_live.mjs`): 10/10 PASS pada alias produksi `gen-ai-theta-gold.vercel.app` - mask token `Astr…b7ac`, openrouter chain, copywriting, brand-kit + context, market-research, katalog, CS chat auto-fallback semua hijau. Cache-bust `?v=5.3`.

### FASE 10 — Redesign UX MitraKu v3.0 (Dashboard, Chat Hub, Settings) (✅ SELESAI)

**Keputusan: DESAIN LOCKED "GAS" 13 Sep 2026. Semua fase dikerjakan satu sesi, QA per fase (Puppeteer).**

- [x] **FASE 2 — Layout & Navigasi.** Sidebar dirapikan: tambah item **Dashboard**, Mitra Chat, Copywriting, Brand Kit, Riset Pasar; grup Toko dipecah ke-2 entri: **Produk & Katalog** (`switchView('tokopintar')` + `switchTpSubView('catalog')`) dan **AI Customer Service** (`switchTpSubView('chat')`); **Settings** tetap. Semua label relabel. Emoji ikon diganti **inline SVG sprite** (`<svg><use href="#ic-…">`): dashboard, chat, pen, palette, chart, box, bot, gear, box-open, shield, launch. **Dashboard jadi halaman default** (ganti chat): hero, kartu Produk Aktif (tombol Ganti Produk → `openProductModal()`), 4 pintu AI Tools, aktivitas terakhir (riwayat percakapan, klik → buka chat). Bug fix: init lama hanya `switchView` bila view tersimpan — kini selalu panggil (meng-hydrate dashboard). Cache-bust `?v=6.0`. (QA `p2` 19/19, `p2b` 7/7.)
- [x] **FASE 3 — Chat Hub + Prefill.** State kosong chat jadi "hub": 6 kartu saran (Copywriting, Brand Kit, Riset Pasar, AI Customer Service, quickPrompt Deskripsi Shopee SEO, quickPrompt Legalitas UMKM), semua SVG. Prefill global sudah ada sejak v5.x (`prod`→`cw-product-name`/`bk-brand-name`/`mr-product-name`) — diverifikasi, tidak digandakan. Teks onboarding diperbarui ke nama IA baru tanpa emoji. (QA `p3` 9/9.)
- [x] **FASE 4 — Hasil Terstruktur.** Audit: copywriting sudah memiliki copy-per-kartu + salin semua + regenerate; brand kit & riset pasar ada regenerate tapi belum salin semua. Tambah helper baru `copySectionedReport(containerId, btnEl)` (mengumpulkan judul+isi tiap `.cw-card`, salin ke clipboard, feedback "✓ Tersalin!" + toast) dan tombol **"Salin Laporan"** di header hasil Brand Kit & Riset Pasar. (QA `p4` copy-section 6/6 — 2 asersi "no error" flaky karena error console 429 Gemini kuota, bukan regresi.)
- [x] **FASE 5 — Toko: Sub-label & Panel CS.** Sub-nav Toko → **Produk & Katalog** (dengan pil jumlah produk), **AI Customer Service**, **Integrasi & Embed**; semuanya ber-ikon SVG. Tab AI CS kini punya strip status (Status Online 24/7, Pengetahuan AI = jumlah produk katalog via `loadStoreCatalog`, Publikasi) dan bar aksi: **Salin Link CS** + **Kode Embed Widget** (→ sub-view embed). (QA `p5` 11/11.)
- [x] **FASE 6 — Settings: Umum / Integrasi.** Settings mendapat sub-nav 2 tab: **Integrasi AI** (konfigurasi Langflow + AstraDB, form `cfg-*` tetap utuh) dan **Tentang** (profil pembuat, tech stack, tombol Ganti Produk Aktif + Bersihkan Riwayat). Modal "Tentang Pembuat" dihapus → `about-btn` di topbar kini membuka **Settings → Tentang**. `initSettingsPanel()` tetap dipanggil saat membuka tab Integrasi. (QA `p6` 11/11.)
- [x] **FASE 7 — Verifikasi & Deploy v6.0.** Regresi UI penuh 61/61 PASS (`p2/p2b/p3/p4/p5/p6`), QA API lokal 20/21 (1 gagal = kuota Gemini, environmental, fallback terbukti bekerja), **LIVE QA Vercel 10/10** pada alias `gen-ai-theta-gold.vercel.app`. Deploy via `vercel build --prod` + `vercel deploy --prebuilt --prod --yes`, `vercel.json` tidak berubah.

> **Catatan kuota Gemini (13 Sep 2026):** free-tier 20 request/hari untuk gemini-2.5-flash; saat habis, backend otomatis fallback `gemini→groq→openrouter`. Ini perilaku yang dirancang, bukan kegagalan.

---

## 8. ATURAN UNTUK AI AGENT

1. Baca dokumen ini dulu sebelum membuat perubahan apapun
2. Jangan restore komponen deprecated — lihat Bagian 5
3. Fase harus dikerjakan berurutan — jangan skip
4. Setiap endpoint API baru harus mengikuti pola yang ada di index.js
5. Jangan tambah dependencies baru tanpa alasan jelas
6. Python Pillow/OpenCV TIDAK BOLEH digunakan untuk rendering — gunakan Puppeteer
7. Semua teks output ke pengguna harus Bahasa Indonesia yang hangat dan ramah
8. Update Bagian 9 Changelog setiap kali ada perubahan besar
9. Progress fase 9 dicatat sebagai checkbox di Bagian 7 — cek dulu sebelum menandai selesai

---

## 9. CHANGELOG

| Tanggal    | Versi | Perubahan                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13 Sep 2026 | v3.0  | **REDESIGN UX FASE 10 SELESAI + DEPLOY LIVE.** Dashboard jadi halaman default (hero, Produk Aktif, 4 pintu AI, aktivitas); sidebar ikon SVG sprite; Toko dipecah jadi 2 entri (Produk & Katalog, AI CS) dengan sub-label baru & strip status CS (Online 24/7, Pengetahuan AI, Publikasi) + Salin Link CS / Kode Embed; chat empty-state jadi hub 6 kartu saran; hasil Brand Kit & Riset Pasar dapat "Salin Laporan" (helper `copySectionedReport`); Settings sub-nav **Integrasi AI / Tentang** (`cfg-*` utuh, modal pembuat dihapus, `about-btn` → Settings→Tentang). QA: UI 61/61, API 20/21 (1 env kuota Gemini), LIVE 10/10. Cache-bust `?v=6.0`. |
| 13 Sep 2026 | v2.9.1 | **FASE 0 Cleanup selesai.** Semua item legacy (python deprecated, tombol palsu, n8n service, N8N_WEBHOOK_URL, /api/langflow-generate, /api/trigger-pipeline) sudah dihapus dari codebase pada iterasi sebelumnya; checkbox & judul section sekarang tercentang. |
| 13 Sep 2026 | v2.9  | **FASE 9 (P3-P6) SELESAI + DEPLOY LIVE.** P3: tag sumber jawaban CS (RAG jujur) + Produk Aktif disuntik ke prompt Brand Kit; P4: dead-code bersih (hapus `toggleModelMenu`); P6: QA end-to-end 21 endpoint lokal + 10 live di Vercel = semua PASS. 3 endpoint AI (copywriting/brand-kit/market-research) diberi rantai failover `gemini->groq->openrouter` (kasus Gemini 503 kini auto-cadangan). Mask token dipersempt jadi `xxxx...xxxx`. Favicon data-URI (konsol bersih). Live di `gen-ai-theta-gold.vercel.app`. |
| 13 Sep 2026 | v2.8  | **FASE 9 (P0–P2 + BONUS) SELESAI + DEPLOY LIVE.** SSRF guard + mask error di semua endpoint; IA baru (sidebar grup, istilah "Pengetahuan AI", tab Integrasi dipindah ke Pengaturan); design tokens zero-visual-change; OpenRouter DIAKTIFKAN LAGI dengan auto-fallback berlapis (`gemini→groq→openrouter` dsb.) saat kuota/token habis + toast pemberitahuan. Deploy serverless Vercel (`gen-ai-theta-gold.vercel.app`). |
| 12 Sep 2026 | v2.7  | **FASE 7 & 8 SELESAI.** Integrasi Langflow RAG + AstraDB di Modul 1 Toko Pintar: endpoint `/api/config`, `/api/test-langflow`, `/api/toko-pintar/sync`; tab baru ⚙️ Integrasi (konfigurasi Langflow & AstraDB dengan persistensi `data/langflow-config.json`); chat hybrid RAG → fallback Gemini/Groq; auto-ingestion saat katalog berubah. Cleanup FASE 8: deduplikasi `apiFetch` + hapus ~50.400 baris artifact untracked. |
| 9 Sep 2026 | v2.6  | **FASE 5 SELESAI.** Riset Pasar Instan (Modul 2): Live endpoint `POST /api/market-research`, 5th View Tab `📊 Riset Pasar` di top bar & sidebar, analisis rentang harga kompetitor, 3 strategi diferensiasi, 5 kata kunci SEO e-commerce dengan click-to-copy, dan rekomendasi platform jualan. **SELURUH 5 MODUL UTAMA MITRAKU AI SELESAI.** |
| 9 Sep 2026 | v2.5  | **FASE 4 SELESAI.** Toko Pintar AI (Modul 1 - RAG CS 24 Jam): Sub-navigasi 3 mode (Kelola Katalog, Simulasi Chat CS, Link & Embed Widget), REST API `/api/toko-pintar/catalog` & RAG engine `/api/toko-pintar/chat`, dynamic quick prompt buttons.                                                                                            |
| 9 Sep 2026 | v2.4  | **FASE 3 SELESAI.** Brand Kit Generator (Modul 3): UI Brand Kit Builder dengan 3rd View Tab, form kepribadian brand, dynamic JSON generator, Puppeteer rendering engine untuk download visual High-Res PNG & PDF, interactive color swatch cards dengan click-to-copy HEX codes.                                                              |
| 9 Sep 2026 | v2.3  | **FASE 2 SELESAI.** Perbaikan Mitra Chat AI (Modul 5): Real Regenerate AI response, dynamic system prompt injector dengan kontekstual Produk Aktif UMKM, `checkProviderAvailability()` live query status API Key, Onboarding Quick Guide Card untuk user baru dengan dismiss button, dan pembersihan total sisa-sisa code pipeline.           |
| 9 Sep 2026 | v2.2  | **FASE 1 SELESAI.** UI & Flow Copywriting Factory (Modul 4) live di frontend. Tab View Switcher (Chat AI & Copywriting Factory), form interaktif per platform (Shopee, TikTok, Instagram), dynamic result cards dengan copy 1-klik per section + salin semua, clean sidebar footer & dead code removal di script.js.                          |
| 9 Sep 2026 | v2.1  | **FASE 0 SELESAI.** Hapus 9 file Python deprecated, 4 n8n workflow JSON, semua scratch scripts, test scripts, output render lama, credentials Google, temp files, folder \_\_MACOSX, starter, duplikat docker-compose & .env. Bersih dari 40+ file tidak perlu.                                                                               |
| 9 Sep 2026 | v2.0  | Pivot total dari KontenKu AI ke MitraKu AI. Deprecasi render engine Python. Definisi 5 modul baru. Dokumen MASTER_PROJECT dibuat.                                                                                                                                                                                                             |
| 4 Sep 2026 | v1.5  | Integrasi Langflow RAG — run_langflow_adapter.py dibuat                                                                                                                                                                                                                                                                                       |
| 4 Sep 2026 | v1.0  | KontenKu AI — versi awal dengan Python Pillow render engine                                                                                                                                                                                                                                                                                   |
