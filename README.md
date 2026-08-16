# KontenKu AI  AI Content Creation Workspace UMKM



KontenKu AI adalah aplikasi chatbot berbasis web yang membantu mahasiswa dan pemula (*learner*) memahami konsep pemrograman web (HTML, CSS, JavaScript, Node.js, Express, REST API) serta membimbing mereka dalam melakukan debugging error secara terstruktur — bukan sekadar memberikan solusi, tetapi juga menjelaskan *mengapa* error terjadi.

---

## 🎯 Use Case & Persona

* **Nama Bot**: KontenKu AI
* **Persona**: Mentor Pemrograman Web Senior yang sabar, ramah, dan komunikatif.
* **Target Pengguna**: Mahasiswa, pemula web development, dan peserta bootcamp.
* **Tujuan Utama**: Membantu pengguna memahami konsep dasar pemrograman dan membimbing pemecahan masalah (debugging) secara bertahap tanpa sekadar memberikan perbaikan kode tanpa pemahaman.

---

## 🛠️ Tech Stack & Model AI

* **Frontend**: HTML5, Vanilla CSS3, Vanilla JavaScript (DOM Manipulation & Fetch API).
* **Backend**: Node.js, Express.js, `cors`, `dotenv`, `@google/genai`, `groq-sdk`.
* **Multi-Provider AI**:
  * **Google Gemini 2.5 Flash** (`gemini-2.5-flash`) — Model utama (Akurat, presisi, cepat).
  * **Groq Llama 3.3 70B** (`llama-3.3-70b-versatile`) — Model Open-Source ultra-fast dengan kuota gratis besar (14.400 request/hari).

---

## ✨ Fitur Utama

1. **Multi-Model Selector**: Memungkinkan pengguna berpindah antara Google Gemini 2.5 Flash dan Open-Source Llama 3.3 70B via Groq langsung dari sidebar UI.
2. **Percakapan Multi-turn (Session Memory)**: Frontend menyimpan riwayat percakapan selama sesi browser aktif dan meneruskannya ke backend pada setiap request.
3. **Markdown & Code Syntax Highlighting**: Mendukung rendering blok kode dengan tombol Copy dan penyorotan warna via `highlight.js`.
4. **Indikator Loading ("Thinking State")**: Memberikan feedback visual saat AI sedang memproses jawaban.
5. **Empty State & Quick Prompt Chips**: Grid 2x2 pertanyaan populer untuk langsung mulai berinteraksi.
6. **Validasi Request & Penanganan Error**: Menangani input kosong, kesalahan jaringan, atau kredensial API key yang tidak terkonfigurasi secara aman.
7. **Antarmuka Responsive Modern**: Desain 2-panel (sidebar drawer di mobile) bernuansa developer workspace yang nyaman digunakan.

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

## 📁 Struktur Project

```text
GEN_AI/
├── public/
│   ├── index.html     # Halaman UI Chatbot (Sidebar + Chat Pane)
│   ├── style.css      # Styling CSS Premium (Developer Dark Theme)
│   └── script.js      # Logika Frontend, Provider Selector, State & Fetch API
├── index.js           # Server Backend Express (Multi-Provider Routing Gemini + Groq)
├── package.json       # Manifes proyek Node.js (ES Modules)
├── .env               # Kredensial Environment (GEMINI_API_KEY & GROQ_API_KEY)
├── .gitignore         # Berkas pengabaian Git (node_modules, .env, package-lock.json)
└── README.md          # Dokumentasi Proyek
```

---

## 🚀 Cara Instalasi & Menjalankan Proyek

### 1. Prasyarat
* Node.js v18 atau versi yang lebih baru (`node -v`)
* Gemini API Key dari [Google AI Studio](https://aistudio.google.com)
* (Opsional) Groq API Key dari [Groq Console](https://console.groq.com)

### 2. Instalasi Dependensi
Jalankan perintah berikut di terminal:
```bash
npm install
```

### 3. Konfigurasi Environment Variable
Buka atau buat berkas `.env` di direktori utama:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
```

### 4. Menjalankan Server
Jalankan perintah:
```bash
npm start
```
Server backend dan frontend akan berjalan pada:
```text
http://localhost:3000
```

---

## 📡 API Endpoints

### `GET /api/providers`
Mengembalikan daftar provider AI beserta status ketersediaan API key.

### `POST /api/chat`
Menerima array riwayat percakapan dan pilihan provider (`gemini` atau `groq`).

**Request Body Example:**
```json
{
  "provider": "gemini",
  "conversation": [
    {
      "role": "user",
      "text": "Kenapa saya mendapat error Cannot read properties of undefined?"
    }
  ]
}
```

**Response Success (200 OK):**
```json
{
  "result": "Error 'Cannot read properties of undefined' terjadi ketika...",
  "provider": "gemini"
}
```

---

## 📄 Lisensi
Dibuat oleh: Jamaludin  
Universitas: Universitas Putra Bangsa Kebumen  
Program: AI Productivity and AI API Integration for Developers — Sesi 3  
Penyelenggara: Hacktiv8
