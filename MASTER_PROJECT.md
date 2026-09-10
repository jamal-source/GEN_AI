# 🧠 MASTER PROJECT DOCUMENT — MitraKu AI

> **Dokumen ini adalah satu-satunya sumber kebenaran (Single Source of Truth) untuk proyek ini.**
> Setiap AI Agent, developer, atau kolaborator WAJIB membaca dokumen ini sebelum menyentuh kode apapun.
> Terakhir diperbarui: 9 September 2026

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
2. Data di-embed ke Astra DB via Langflow (Flow 1 dipertahankan)
3. Pelanggan bisa tanya ke chatbot: "Ada ukuran M?", "Ongkir ke Surabaya?"
4. Chatbot menjawab berdasarkan data katalog aktual (RAG Flow 2 dipertahankan)
5. Tersedia sebagai widget embed di website atau link shareable

**Tech:** Langflow + Astra DB + Gemini 2.0 Flash (sudah ada, tinggal redirect)

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
| Frontend         | Next.js 15 (App Router)    | BARU                 | Routing per modul, SSR, modern |
| Backend API      | Node.js Express            | LANJUTKAN (refactor) | Sudah ada, solid               |
| AI / LLM         | Google Gemini 2.0 Flash    | SUDAH ADA            | API key tersedia               |
| RAG Engine       | Langflow + Astra DB        | DIPERTAHANKAN        | Tepat untuk Modul 1            |
| Database User    | PostgreSQL                 | SUDAH DI DOCKER      | Profil UMKM & history          |
| Brand Kit Render | Puppeteer (Node.js)        | GANTI PILLOW         | HTML -> PNG/PDF yang cantik    |
| Auth             | Clerk atau NextAuth        | TAMBAH               | Multi-user UMKM                |
| Deployment       | Vercel (FE) + Railway (BE) | UPGRADE              | Lebih production-ready         |

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
| Pilihan OpenRouter dropdown     | public/index.html                | Backend tidak support                  |
| Tombol Upload Foto              | public/index.html                | Membuka modal yang salah               |
| Tombol + Opsi Tambahan          | public/index.html                | Kirim chat otomatis tanpa tujuan       |
| Service n8n                     | docker-compose.yml               | Terlalu kompleks untuk tahap awal      |
| N8N_WEBHOOK_URL                 | .env                             | Tidak terpakai di arsitektur baru      |
| /api/trigger-pipeline endpoint  | index.js                         | Pipeline lama                          |
| /api/langflow-generate endpoint | index.js                         | Butuh n8n yang sudah dihapus           |

---

## 6. KOMPONEN YANG DIPERTAHANKAN

| Komponen                                | Status      | Catatan                         |
| --------------------------------------- | ----------- | ------------------------------- |
| index.js — /api/chat endpoint           | PERTAHANKAN | Bersihkan dead code             |
| index.js — /api/title endpoint          | PERTAHANKAN | Tidak ada perubahan             |
| public/script.js — Conversation Service | PERTAHANKAN | Core logic bagus                |
| public/style.css                        | PERTAHANKAN | Desain sudah bagus              |
| Langflow Flow 1 (Document Ingestion)    | PERTAHANKAN | Dipakai Modul 1                 |
| Langflow Flow 2 (RAG Chat)              | PERTAHANKAN | Dipakai Modul 1 & 5             |
| docker-compose.yml — PostgreSQL         | PERTAHANKAN | Database user                   |
| docker-compose.yml — Langflow           | PERTAHANKAN | RAG engine                      |
| product_service.py                      | ADAPTASI    | Simpan logika registrasi brand  |
| docs/langflow_system_prompt.txt         | UPDATE      | Perbarui untuk persona Mitra AI |
| docs/astra_db_metadata_spec.json        | PERTAHANKAN | Multi-tenancy spec relevan      |

---

## 7. TODO LIST — URUTAN PRIORITAS PENGERJAAN

### FASE 0 — Cleanup & Demolisi (LAKUKAN PERTAMA)

- [ ] Hapus file Python yang deprecated (lihat Bagian 5)
- [ ] Hapus tombol palsu dari public/index.html
- [ ] Perbaiki label tombol upload foto menjadi "Kelola Produk"
- [ ] Hapus service n8n dari docker-compose.yml
- [ ] Hapus N8N_WEBHOOK_URL dari .env dan .env.example
- [ ] Hapus /api/langflow-generate dari index.js
- [ ] Hapus /api/trigger-pipeline dari index.js

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

---

## 9. CHANGELOG

| Tanggal    | Versi | Perubahan                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9 Sep 2026 | v2.6  | **FASE 5 SELESAI.** Riset Pasar Instan (Modul 2): Live endpoint `POST /api/market-research`, 5th View Tab `📊 Riset Pasar` di top bar & sidebar, analisis rentang harga kompetitor, 3 strategi diferensiasi, 5 kata kunci SEO e-commerce dengan click-to-copy, dan rekomendasi platform jualan. **SELURUH 5 MODUL UTAMA MITRAKU AI SELESAI.** |
| 9 Sep 2026 | v2.5  | **FASE 4 SELESAI.** Toko Pintar AI (Modul 1 - RAG CS 24 Jam): Sub-navigasi 3 mode (Kelola Katalog, Simulasi Chat CS, Link & Embed Widget), REST API `/api/toko-pintar/catalog` & RAG engine `/api/toko-pintar/chat`, dynamic quick prompt buttons.                                                                                            |
| 9 Sep 2026 | v2.4  | **FASE 3 SELESAI.** Brand Kit Generator (Modul 3): UI Brand Kit Builder dengan 3rd View Tab, form kepribadian brand, dynamic JSON generator, Puppeteer rendering engine untuk download visual High-Res PNG & PDF, interactive color swatch cards dengan click-to-copy HEX codes.                                                              |
| 9 Sep 2026 | v2.3  | **FASE 2 SELESAI.** Perbaikan Mitra Chat AI (Modul 5): Real Regenerate AI response, dynamic system prompt injector dengan kontekstual Produk Aktif UMKM, `checkProviderAvailability()` live query status API Key, Onboarding Quick Guide Card untuk user baru dengan dismiss button, dan pembersihan total sisa-sisa code pipeline.           |
| 9 Sep 2026 | v2.2  | **FASE 1 SELESAI.** UI & Flow Copywriting Factory (Modul 4) live di frontend. Tab View Switcher (Chat AI & Copywriting Factory), form interaktif per platform (Shopee, TikTok, Instagram), dynamic result cards dengan copy 1-klik per section + salin semua, clean sidebar footer & dead code removal di script.js.                          |
| 9 Sep 2026 | v2.1  | **FASE 0 SELESAI.** Hapus 9 file Python deprecated, 4 n8n workflow JSON, semua scratch scripts, test scripts, output render lama, credentials Google, temp files, folder \_\_MACOSX, starter, duplikat docker-compose & .env. Bersih dari 40+ file tidak perlu.                                                                               |
| 9 Sep 2026 | v2.0  | Pivot total dari KontenKu AI ke MitraKu AI. Deprecasi render engine Python. Definisi 5 modul baru. Dokumen MASTER_PROJECT dibuat.                                                                                                                                                                                                             |
| 4 Sep 2026 | v1.5  | Integrasi Langflow RAG — run_langflow_adapter.py dibuat                                                                                                                                                                                                                                                                                       |
| 4 Sep 2026 | v1.0  | KontenKu AI — versi awal dengan Python Pillow render engine                                                                                                                                                                                                                                                                                   |
