# RESEARCH REPORT: PRODUCT CONTENT AUTOMATION ENGINE

**Tanggal Audit:** 12 Agustus 2026  
**Status:** STEP 1 — RESEARCH & AUDIT  
**Penulis:** Senior Software Architect & AI/ML Engineer  

---

## 1. AUDIT HARDWARE SPESIFIKASI SISTEM

Berdasarkan audit hardware menggunakan `Get-CimInstance` pada mesin eksekusi:

* **CPU:** AMD Ryzen 5 PRO 4650G with Radeon Graphics (6 Cores, 12 Threads, ~3.7GHz Base / 4.2GHz Boost)
* **RAM Terpasang:** 12 GB DDR4 3200 MHz
* **RAM Terdeteksi/Tersedia untuk Sistem:** **6.38 GB** (sebagian dialokasikan sebagai Shared VRAM iGPU dan System Reserves)
* **GPU Dedicated (NVIDIA CUDA):** **TIDAK ADA** (Hanya Integrated AMD Radeon Vega 8 Graphics)
* **Sistem Operasi:** Windows (PowerShell)
* **Tooling Terdeteksi:** Git `2.47.1` terpasang. Docker CLI belum terkonfigurasi di System PATH (perlu instalasi / pengaktifan Docker Desktop / WSL2).

### Implikasi Arsitektural Sangat Penting:
1. **Inference GPU AI Terbatas / CPU-Bound:** Tanpa GPU VRAM NVIDIA (CUDA), model AI generatif berat (seperti FLUX.1, SDXL, LLaVA 13B, SVD, Stable Diffusion 3) yang membutuhkan 8GB–16GB VRAM **TIDAK BISA** dijalankan di lokal tanpa crash out-of-memory (OOM) atau runtime puluhan menit per gambar.
2. **Strategi Hybrid & Micro-Worker:** 
   - Komponen **OCR, Text Layer Rendering, Template Engine, Video Motion Engine (FFmpeg/MoviePy), dan Database** dijalankan 100% di lokal berbasis CPU.
   - Komponen **AI Vision / LLM**: Menggunakan model ultra-ringan lokal di Ollama (`moondream2` 1.4B / `qwen2-vl:2b` CPU quantized) dengan opsi fallback Cloud AI API (Gemini / OpenAI / Claude) via n8n.
   - Komponen **Image & Video Worker**: Arsitektur worker bersifat terpisah/modular (*decoupled*). Pemprosesan komposisi teks & visual utama dilakukan secara lokal (SVG/HTML canvas rendering), sedangkan AI background generation menggunakan worker yang dapat bertransisi antara local CPU mode dan Cloud API (Fal.ai / Replicate / HuggingFace).

---

## 2. EVALUASI TEKNOLOGI & KOMPARASI ALTERNATIF

### A. Orchestrator: n8n Community Edition
* **Versi Target:** `n8n:latest` (v2.34.x / Docker-based)
* **Alternatif Dipertimbangkan:** Apache Airflow, Prefect, LangChain / LlamaIndex standalone scripts.
* **Alasan Pemilihan:**
  - n8n merupakan visual workflow orchestrator berbasis Node.js yang sangat ringan dalam konsumsi RAM (~200MB - 400MB RAM).
  - Memiliki native Webhook trigger, REST API node, PostgreSQL node, dan Google Drive node yang matang.
  - Memungkinkan pemisahan tugas (*decoupling*): n8n hanya mengorkestrasi urutan eksekusi dan memanggil worker API Python/FastAPI, bukan memroses AI secara langsung di dalam n8n.
* **License:** Sustainable Use License (N8N Fair-code). Bebas digunakan untuk internal automation bisnis.

### B. Database: PostgreSQL 16 (Docker)
* **Alternatif Dipertimbangkan:** SQLite, MySQL, MongoDB.
* **Alasan Pemilihan:**
  - PostgreSQL 16 mendukung tipe data `JSONB` yang ideal untuk menyimpan metadata produk yang fleksibel, *brand design tokens*, *content definitions*, dan *job log histories*.
  - Relasional ketat menjamin integritas data antara `brands`, `variants`, `products`, `content_plans`, dan `assets`.
* **License:** PostgreSQL License (Open Source).

### C. OCR Engine (Product Packaging & Legal Docs Extraction)
* **Teknologi Terpilih:** **RapidOCR** (ONNX Runtime CPU) + **Tesseract OCR** fallback.
* **Alternatif Dipertimbangkan:** EasyOCR (butuh PyTorch overhead tinggi ~1.5GB RAM), PaddleOCR (GPU heavy), Cloud Vision API.
* **Alasan Pemilihan:**
  - RapidOCR berbasis ONNX Runtime CPU, berukuran sangat kecil (~100MB RAM footprint), cepat (~200ms per gambar di CPU AMD Ryzen 5).
  - Sangat akurat membaca teks Indonesia pada kemasan botol/pouch (NIB, SPP-IRT, komposisi, takaran sajian).
* **License:** Apache 2.0.

### D. Vision & Product Intelligence Engine
* **Teknologi Terpilih:** **Ollama (Moondream2 / Qwen2-VL 2B CPU Quantized)** + API Bridge n8n.
* **Alternatif Dipertimbangkan:** LLaVA-v1.6-13B, BakLLaVA.
* **Alasan Pemilihan:**
  - Moondream2 (1.4B params) hanya membutuhkan ~800MB RAM di CPU.
  - Qwen2-VL 2B Q4_K_M hanya membutuhkan ~1.8GB RAM dan sangat andal dalam mengekstrak informasi terstruktur dari kemasan makanan/minuman ke JSON.
* **License:** Apache 2.0.

### E. Template Engine & Text Layer Renderer (PERATURAN TANPA HALUSINASI)
* **Teknologi Terpilih:** **Python SVG/HTML-to-Image Canvas Renderer** (Playwright / Pillow / CairoSVG).
* **Alternatif Dipertimbangkan:** Pure AI Image Generator Text (DALL-E 3 / SDXL Text).
* **Alasan Pemilihan:**
  - **DILARANG MENGARANG TEKS:** Menurut Prinsip #9 dan #3 Master Prompt, AI Image Generator TIDAK BOHLEH dipercaya merender nomor legalitas (NIB, SPP-IRT), komposisi, atau headline penting karena rentan halusinasi typo/karakter palsu.
  - Teks factual dan elemen legalitas **WAJIB** dirender menggunakan Text Layer terpisah berbasis kode (Vector SVG / HTML Canvas) yang kemudian ditumpuk (*composited*) di atas visual background.
* **License:** Open Source.

### F. Image Worker & Video Worker Architecture
* **Image Worker:** Microservice Python (FastAPI). 
  - Mode A (Lokal CPU): HTML/SVG Composite + Canvas Styling + PIL Enhancer.
  - Mode B (Cloud API Adapter): ComfyUI Server / Fal.ai / Replicate API jika butuh latar belakang fotorealistik kompleks.
* **Video Worker:** **FFmpeg + Python MoviePy / OpenCV Video Engine**.
  - Menggabungkan 9 visual asset hasil template engine menjadi 1 video promosi berdurasi 15-30 detik dengan efek transisi Ken Burns (pan/zoom), overlay teks dinamis, dan latar musik.
  - 100% CPU-friendly, cepat (<30 detik render di Ryzen 5 4650G), tanpa dependensi GPU CUDA.
* **License:** MIT / GPL (FFmpeg).

### G. Google Drive Integration (Output Utama V1)
* **Teknologi Terpilih:** **Google Drive API v3 via Google Service Account**.
* **Alasan Pemilihan:**
  - Service Account memungkinkan eksekusi otomatis *machine-to-machine* tanpa perlu interaksi login browser manual setiap kali workflow berjalan.
  - Folder target di Google Drive personal/shared di-share ke email Service Account sebagai *Editor*.
  - Pembuatan struktur folder bertingkat (`BRAND / BATCH / PRODUCT / Assets...`) dan penyimpanan File ID ke PostgreSQL.
* **License:** Google APIs Terms of Service.

---

## 3. RISIKOI, LISENSI, DAN BATASAN TEKNIS

| Komponen | Potensi Risiko / Batasan | Strategi Mitigasi |
| :--- | :--- | :--- |
| **Hardware (RAM 6GB)** | Memory Pressure saat n8n + Postgres + Ollama berjalan bersamaan. | Batasi RAM container Docker, jalankan Ollama dengan model ultra-compact (Qwen2-VL 2B / Moondream2), gunakan swap file jika diperlukan. |
| **Legalitas & Faktual Data** | AI melukis nomor NIB/SPP-IRT yang salah. | Gunakan 2-layer rendering: Background visual + Dynamic Text Overlay terpisah. Data faktual yang tak ditemukan wajib bernilai `null` / `DATA_NOT_FOUND`. |
| **Docker di Windows** | Docker CLI belum ada di PATH. | Mengaktifkan Docker Desktop / WSL2 Ubuntu backend pada panduan Phase 1. |
| **Google Drive Quota** | Rate limit upload API jika batch besar. | Gunakan exponential backoff retry di n8n & Python upload worker. |
| **TikTok & Shopee API** | Perlu akun Partner/Developer terverifikasi, OAuth2 user consent, dan perizinan bisnis khusus. | Ditegaskan sebagai opsional post-V1, tidak membendung pipeline V1. |

---

## 4. BATCH & VARIANT DYNAMIC PROCESSING RULE CHECK

Sesuai kebutuhan brand (Contoh: Brand **COD** dengan varian *Lemon Sereh*, *Lemon Talang*, *Beras Kencur*, *Kunyit Asem*):
* 1 Brand memuat **N Varian**.
* 4 Varian × 9 Content Types = 36 Visual Assets + 4 Videos.
* Workflow n8n diarsitekturkan secara batch loop (`Split In Batches` / Dynamic Array Processing) sehingga **TIDAK BUKAN** membuat 4 workflow terpisah.

---

## 5. TANGGAL PENGECEKAN DOKUMENTASI RESMI

* n8n Official Docs: August 2026 (`n8n:latest` v2.34.x / Docker)
* Google Drive API v3: August 2026 (Service Account OAuth2 integration)
* RapidOCR / ONNXRuntime Python: August 2026 (v1.3+ ONNX CPU execution)
* Ollama Docs: August 2026 (Vision model API endpoints `/api/generate` & `/api/chat`)
