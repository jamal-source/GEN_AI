# KontenKu AI — AI Content Creation Workspace UMKM

KontenKu AI adalah aplikasi AI Content Creation Workspace berbasis web yang membantu pelaku UMKM Indonesia menghasilkan paket konten visual (9 slot image PNG 1080x1080px), video promosi MP4, dan copywriting jualan e-commerce (Shopee, TikTok, Instagram) secara otomatis.

---

## 🎯 Use Case & Persona

* **Nama Bot**: KontenKu AI
* **Persona**: Asisten Strategi & Konten Kreatif UMKM Indonesia yang berpengalaman, komunikatif, dan penuh semangat.
* **Target Pengguna**: Pemilik Usaha Mikro, Kecil, dan Menengah (UMKM), reseller, dan pembuat konten lokal.
* **Tujuan Utama**: Mengubah ide produk menjadi materi pemasaran visual, video, dan narasi copywriting yang siap dipublikasikan.

---

## 🛠️ Tech Stack & Model AI

* **Frontend**: HTML5, Vanilla CSS3, Vanilla JavaScript (ES6+, DOM Manipulation & Fetch API).
* **Backend**: Node.js, Express.js, `cors`, `dotenv`, `express-rate-limit`, `express-validator`, `@google/genai`, `groq-sdk`.
* **Multi-Provider AI**:
  * **Google Gemini 2.5 Flash** (`gemini-2.5-flash`) — Model utama (Akurat, presisi, cepat).
  * **Groq Llama 3.3 70B** (`llama-3.3-70b-versatile`) — Model Open-Source ultra-fast dengan kuota gratis besar.

---

## ✨ Fitur Utama & Logika Sistem

1. **Multi-Model Selector & Automatic Fallback**: Memungkinkan pengguna memilih Google Gemini atau Groq Llama 3.3. Jika Gemini mengalami gangguan/kuota habis, sistem otomatis berpindah (*fallback*) ke Groq.
2. **Penyimpanan LocalStorage & Truncation Safety**: Riwayat percakapan disimpan secara aman di browser dan dipotong otomatis jika melebihi 100 pesan per percakapan untuk mencegah *overflow*.
3. **Pencarian Riwayat Ter-debounce**: Fitur pencarian percakapan dilengkapi utilitas *debounce* agar responsif tanpa membebankan memori browser.
4. **Proteksi API Rate Limiting**: Server dilengkapi middleware `express-rate-limit` (maksimal 30 request/menit per IP) untuk melindungi dari penyalahgunaan.
5. **Format Error User-Friendly**: Pesan kesalahan teknis (seperti `403 Permission Denied` atau `429 Rate Limit`) diterjemahkan secara otomatis menjadi pesan Bahasa Indonesia yang ramah pengguna.
6. **Markdown & Code Syntax Highlighting**: Mendukung rendering Markdown, penyorotan sintaksis via `highlight.js`, dan penanganan tautan yang aman (*sanitized*).
7. **Indikator Loading ("Thinking State")**: Mengunci tombol kirim dan menampilkan animasi memuat saat AI sedang menyiapkan jawaban.
8. **Konfirmasi Pengosongan Data**: Menghapus seluruh riwayat dilengkapi dengan dialog konfirmasi (*confirmation modal*) untuk mencegah kehilangan data tidak sengaja.

---

## ⚙️ Model Configurations

### 1. Google Gemini 2.5 Flash
* **Model**: `gemini-2.5-flash`
* **Temperature**: `0.2`
* **Top P**: `0.85` | **Top K**: `40`

### 2. Groq Llama 3.3 70B (Open Source)
* **Model**: `llama-3.3-70b-versatile`
* **Temperature**: `0.2`
* **Top P**: `0.85` | **Max Tokens**: `4096`

---

## 🚀 Cara Instalasi & Deploy

### 1. Jalankan di Lokal (Localhost)
```bash
# Clone repositori dan masuk ke direktori
npm install

# Buat berkas .env dari template
cp .env.example .env

# Jalankan server lokal
npm start
```
Akses di browser: `http://localhost:3000`

### 2. Deploy ke Vercel (Produksi)
1. Hubungkan repositori GitHub ini ke **Vercel**.
2. Masuk ke **Project Settings -> Environment Variables** di Dashboard Vercel.
3. Tambahkan variabel lingkungan berikut:
   * `GEMINI_API_KEY`: API Key baru dari Google AI Studio.
   * `GROQ_API_KEY`: (Opsional) API Key dari Groq Console.
4. Buka tab **Deployments**, klik `...` pada deployment terbaru, lalu pilih **Redeploy**.

---

## 📄 Lisensi & Kredit
Dibuat oleh: Jamaludin  
Universitas: Universitas Putra Bangsa Kebumen  
Program: AI Productivity and AI API Integration for Developers — Sesi 3  
Penyelenggara: Hacktiv8
