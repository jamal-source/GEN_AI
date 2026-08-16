# PRODUCT CONTENT AUTOMATION ENGINE

Sistem otomatisasi pembuatan paket konten produk e-commerce berbasis data faktual, n8n orchestrator, PostgreSQL, dan Python Micro-workers.

## Tech Stack
* **Orchestrator:** n8n Community Edition (v2.34+)
* **Database:** PostgreSQL 16
* **Microservices:** Python 3.11 (FastAPI, RapidOCR, Ollama Vision, SVG/HTML Canvas, FFmpeg MoviePy)
* **Output:** Google Drive API (Primary V1 Output)

## Dokumentasi Teknis
* [Riset & Evaluasi Teknologi](docs/RESEARCH.md)
* [Spesifikasi Arsitektur Sistem](docs/ARCHITECTURE.md)

## Struktur Folder
```text
product-content-engine/
├── config/             # Konfigurasi n8n & Service Account
├── database/           # Skema init PostgreSQL SQL
├── docs/               # Dokumentasi RESEARCH.md & ARCHITECTURE.md
├── services/           # Python Microservices (OCR, Vision, Template Render, Video)
├── scripts/            # Script utilitas & verifikasi test
├── docker-compose.yml  # Container setup (n8n + Postgres)
├── .env.example        # Environment variable template
└── README.md
```

## Panduan Memulai (Phase 1)
1. Salin `.env.example` ke `.env`
2. Jalankan container: `docker-compose up -d`
3. Akses n8n UI di: `http://localhost:5678`
