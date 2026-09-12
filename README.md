# 🇮🇩 MitraKu AI — Platform Digital Marketing UMKM Indonesia

> **"Satu AI, Semua Kebutuhan Marketing UMKM"**

MitraKu AI adalah platform AI Marketing Suite berbasis web yang dirancang khusus untuk pemilik Usaha Mikro, Kecil, dan Menengah (UMKM) Indonesia. Dengan 5 modul AI terintegrasi, MitraKu AI membantu UMKM dari riset pasar hingga otomatisasi Customer Service 24 jam.

---

## 🚀 5 Modul Utama MitraKu AI

1. **🏪 Modul 1: Toko Pintar AI (RAG Customer Service 24/7)**
   - Kelola katalog produk UMKM (nama, kategori, harga, stok, deskripsi, info pengiriman).
   - Customer Service AI cerdas berbasis **RAG (Retrieval-Augmented Generation)** yang merespons pertanyaan pelanggan secara akurat.
   - Sapaan ramah "Kak", jawaban berdasarkan katalog toko aktual, dan graceful handling barang yang tidak ada.
   - Sediakan **Direct Chat Link** dan **Widget Embed Code (Iframe)** untuk dipasang di website toko.

2. **📊 Modul 2: Riset Pasar Instan**
   - Analisis cepat posisi produk UMKM di pasar e-commerce (Shopee, Tokopedia, TikTok Shop).
   - Estimasi rentang harga kompetitor sejenis & analisis positioning.
   - 3 strategi diferensiasi produk unik.
   - 5 kata kunci SEO teratas dengan fitur _1-click copy_.
   - Rekomendasi platform jualan yang paling pas.

3. **🎨 Modul 3: Brand Kit Builder Generator**
   - Hasilkan panduan visual identitas brand UMKM secara instan.
   - 4 pilihan kepribadian brand (_Modern & Minimalis_, _Elegan & Premium_, _Playful & Ceria_, _Tradisional & Autentik_).
   - Output: 3 pilihan tagline, cerita brand emosional, 5 palet warna HEX interaktif, rekomendasi tipografi, dan 4 pilar konten.
   - Powered by **Puppeteer Rendering Engine** untuk download visual High-Res PNG (1200x1400) dan PDF / Cetak.

4. **✍️ Modul 4: Copywriting Factory**
   - Generator teks promosi yang disesuaikan algoritma platform e-commerce & media sosial.
   - **Mode Shopee/Tokopedia**: Judul SEO 70 karakter + deskripsi 1500 karakter + bullet point keunggulan + hashtag.
   - **Mode TikTok/Reels**: Hook 3 detik + skrip video 30 detik + caption + hashtag FYP + ide sound.
   - **Mode Instagram**: Caption storytelling + CTA mendesak + 20 hashtag niche + ide carousel.
   - Fitur _1-click copy_ per section dan salin semua content.

5. **💬 Modul 5: Mitra Chat AI**
   - Asisten konsultasi strategi bisnis & marketing UMKM.
   - Pengingat otomatis produk aktif UMKM (_product context injection_).
   - Fitur **Regenerate Response AI** yang real Re-fetch & State Update.
   - Onboarding Quick Guide Card untuk pengguna baru.

6. **⚙️ Integrasi Langflow & AstraDB**
   - Tab **Integrasi** untuk menghubungkan IBM Langflow + AstraDB (kredensial token, endpoint, collection).
   - Terhubung ke **Modul 1**: chatbot CS menjawab dari vector search AstraDB (RAG) dengan **fallback otomatis ke Gemini/Groq** bila Langflow tidak aktif.
   - Uji koneksi server Langflow + sync katalog manual ke AstraDB dalam satu klik.
   - Konfigurasi tersimpan otomatis ke `data/langflow-config.json` (bertahan saat server restart).

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript ES6+ (No heavy framework required for fast load time).
- **Backend**: Node.js, Express.js, `cors`, `dotenv`, `express-rate-limit`.
- **Visual Rendering**: Puppeteer (HTML-to-PNG High-Res Export).
- **Database / Storage**: PostgreSQL 16 (init.sql included) & Astra DB RAG Catalog.
- **AI Engine**: Google Gemini 2.5 Flash (`gemini-2.5-flash`) + Groq Llama 3.3 70B (`llama-3.3-70b-versatile`).
- **RAG Engine**: IBM Langflow + AstraDB Vector Store (dikonek via tab Integrasi, auto-fallback ke API AI).

---

## 🔧 Setup Langflow & AstraDB (Opsional)

Hubungkan **Modul 1 (Toko Pintar AI)** ke RAG _vector search_ sungguhan:

1. Import flow `langflow/Mitraku AI.json` ke Langflow UI (localhost:7860).
2. Di flow, isi node **AstraDB** (Token + API Endpoint) dan node **Google Embeddings** (Gemini API Key).
3. Buka aplikasi → tab **⚙️ Integrasi** → isi:
   - URL Langflow, Ingestion Flow ID & RAG Chat Flow ID (ambil dari URL browser `/flow/ID`)
   - AstraDB Application Token, API Endpoint, Collection Name
4. Klik **Test Koneksi** → **Sync Katalog** → **Simpan & Aktifkan**.

Chatbot CS kini menjawab dari data katalog di AstraDB, dan otomatis **fallback ke Gemini/Groq** jika Langflow tidak tersedia.

Variabel env berikut (opsional, bisa juga diisi lewat UI Integrasi):

| Variabel | Default |
|---|---|
| `LANGFLOW_URL` | `http://mitraku_langflow:7860` |
| `LANGFLOW_INGESTION_FLOW_ID` | (kosong) |
| `LANGFLOW_RAG_FLOW_ID` | (kosong) |
| `LANGFLOW_API_KEY` | (kosong) |
| `ASTRA_DB_APPLICATION_TOKEN` | (kosong) |
| `ASTRA_DB_API_ENDPOINT` | (kosong) |
| `ASTRA_DB_COLLECTION` | `mitraku_catalog` |

---

## 🚀 Cara Menjalankan Aplikasi

### 1. Jalankan di Lokal (Localhost)

```bash
# Clone repositori dan install dependencies
npm install

# Buat file .env dari template
cp .env.example .env

# Jalankan server
npm start
```

Akses di browser: **`http://localhost:3000`**

### 2. Jalankan dengan Docker Compose

```bash
docker-compose up -d --build
```

---

## 📄 Lisensi & Kredit

- **Nama**: Jamaludin
- **Universitas**: Universitas Putra Bangsa Kebumen
- **Program**: Hacktiv8 — Hackton
