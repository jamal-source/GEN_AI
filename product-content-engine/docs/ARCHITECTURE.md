# ARCHITECTURE SPECIFICATION: PRODUCT CONTENT AUTOMATION ENGINE

**Tanggal:** 12 Agustus 2026  
**Status:** STEP 1 — ARCHITECTURE SPECIFICATION  
**Sistem:** Product Content Automation Engine V1  

---

## 1. OVERVIEW & DIAGRAM ARSITEKTUR

Sistem dirancang sebagai **Event-Driven & Worker-Based Automation Pipeline** yang dikendalikan oleh n8n sebagai orchestrator utama, didukung oleh PostgreSQL untuk state management dan Python FastAPI Microservices untuk pemrosesan berat (OCR, Vision, Template Rendering, Video Assembly).

```text
                               +---------------------------------------+
                               |              USER / UI                |
                               +---------------------------------------+
                                                   |
                                                   v (Upload / Webhook)
+-------------------------------------------------------------------------------------------------+
|                                 n8n AUTOMATION ORCHESTRATOR                                     |
|                                                                                                 |
|  +-------------------+    +-------------------+    +--------------------+    +---------------+  |
|  | Batch Controller  | -> |  Product Analyzer | -> | Content Planner    | -> | Quality Ctrl  |  |
|  +-------------------+    +-------------------+    +--------------------+    +---------------+  |
+-------------------------------------------------------------------------------------------------+
           |                         |                         |                       |
           v                         v                         v                       v
+---------------------+   +---------------------+   +---------------------+   +-------------------+
|  PostgreSQL 16 DB   |   |   OCR & Vision      |   |  Template & Render  |   |   Google Drive    |
|                     |   |   Worker (Python)   |   |  Engine (Python)    |   |   Upload Engine   |
| - Brands            |   | - RapidOCR          |   | - SVG/HTML Canvas   |   | - Automatic Folder|
| - Variants          |   | - Ollama Vision     |   | - Text Overlay      |   | - Drive File IDs  |
| - Content Plans     |   | - JSON Parser       |   | - Asset Compositor  |   |                   |
| - Asset Jobs / QC   |   +---------------------+   | - FFmpeg Video Eng  |   +-------------------+
+---------------------+                             +---------------------+
```

---

## 2. SKEMA DATABASE (POSTGRESQL 16)

Skema database PostgreSQL dirancang secara relasional ketat dengan dukungan `JSONB` untuk data faktual dan brand design system.

```sql
-- 1. Tabel Brand (Menyimpan identitas & design system brand)
CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    logo_url TEXT,
    design_system JSONB NOT NULL DEFAULT '{
        "primary_color": "#1F2937",
        "secondary_color": "#F3F4F6",
        "accent_color": "#10B981",
        "font_family": "Inter, sans-serif",
        "visual_style": "Modern Minimalist",
        "layout_style": "Clean Grid"
    }'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel Product Variant (Menyimpan varian spesifik dalam satu brand)
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    variant_name VARCHAR(255) NOT NULL,
    raw_image_urls TEXT[] NOT NULL DEFAULT '{}',
    legal_document_urls TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(brand_id, variant_name)
);

-- 3. Tabel Factual Product Data (HANYA DATA FAKTUAL DARI OCR/USER - TANPA HALUSINASI)
CREATE TABLE product_factual_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID NOT NULL UNIQUE REFERENCES product_variants(id) ON DELETE CASCADE,
    ingredients TEXT[] DEFAULT NULL,
    net_weight VARCHAR(100) DEFAULT NULL,
    volume VARCHAR(100) DEFAULT NULL,
    expiry_date VARCHAR(100) DEFAULT NULL,
    manufacturer_name VARCHAR(255) DEFAULT NULL,
    manufacturer_address TEXT DEFAULT NULL,
    legalities JSONB NOT NULL DEFAULT '{
        "nib": null,
        "spert": null,
        "halal": null,
        "other_certifications": []
    }'::jsonb,
    verified_claims TEXT[] DEFAULT '{}',
    verified_benefits TEXT[] DEFAULT '{}',
    serving_suggestion TEXT DEFAULT NULL,
    storage_instruction TEXT DEFAULT NULL,
    raw_ocr_payload JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'RAW_EXTRACTED', -- RAW_EXTRACTED, VERIFIED, INCOMPLETE
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabel Content Generation Job (Setiap batch & item asset)
CREATE TABLE content_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    content_type_code VARCHAR(50) NOT NULL, -- 01_THUMBNAIL, 02_DESKRIPSI, 03_KOMPOSISI, 04_MANFAAT, 05_PENYAJIAN, 06_PENYIMPANAN, 07_LEGALITAS, 08_KEUNGGULAN, 09_CTA, 10_VIDEO
    template_version VARCHAR(50) NOT NULL DEFAULT 'v1',
    prompt_version VARCHAR(50) NOT NULL DEFAULT 'v1',
    creative_data JSONB DEFAULT '{}'::jsonb, -- Headline kreatif, visual background concept
    factual_data_snapshot JSONB NOT NULL, -- Snapshot data faktual saat render
    output_local_path TEXT DEFAULT NULL,
    gdrive_file_id VARCHAR(255) DEFAULT NULL,
    gdrive_web_link TEXT DEFAULT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, GENERATING, QC, APPROVED, REJECTED, FAILED
    qc_notes TEXT DEFAULT NULL,
    error_log TEXT DEFAULT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexing untuk kecepatan pencarian batch & retry
CREATE INDEX idx_content_jobs_batch ON content_jobs(batch_id);
CREATE INDEX idx_content_jobs_status ON content_jobs(status);
CREATE INDEX idx_content_jobs_variant ON content_jobs(variant_id);
```

---

## 3. ALUR DATA & PIPELINE GENERASI (DATA FLOW)

```text
[RAW INPUT] Foto Produk & Dokumen Legalitas
    │
    ▼
[OCR & VISION WORKER] (Python + RapidOCR + Ollama Qwen2-VL)
    │ ── Ektraksi data faktual (Komposisi, NIB, SPP-IRT, Berat, Produsen)
    │ ── Validasi format & buat Factual Data JSON
    │
    ▼
[FACTUAL DATA STORE] Simpan ke `product_factual_data` (Data tidak ditemukan = `null`)
    │
    ▼
[CONTENT ENGINE PLANNER] (n8n Workflow)
    │ ── Petakan data faktual ke 9 Slot Content Type:
    │     01 Thumbnail
    │     02 Deskripsi Produk
    │     03 Komposisi Produk
    │     04 Manfaat Produk (Gunakan fakta/keunggulan umum jika tidak ada klaim medis)
    │     05 Cara Penyajian
    │     06 Cara Penyimpanan
    │     07 Legalitas (Must render NIB/SPP-IRT dari Factual JSON)
    │     08 Keunggulan Produk / Testimoni Faktual
    │     09 Call To Action / Ucapan Terima Kasih
    │
    ▼
[TEMPLATE ENGINE & TEXT OVERLAY WORKER] (Python Render Worker)
    │ ── Layer 1: Background & Product Frame (Visual Layer)
    │ ── Layer 2: Dynamic Text & Badge Overlay (SVG Canvas - NO AI TYPO)
    │ ── Layer 3: Final Composited 1080x1080 / 1080x1920 PNG Image Asset
    │
    ▼
[VIDEO ENGINE WORKER] (Python FFmpeg / MoviePy Engine)
    │ ── Ambil 9 visual assets yang lolos QC
    │ ── Aplikasikan Ken Burns Pan/Zoom, Overlays, Transisi, Audio
    │ ── Render 1080x1920 MP4 Product Video
    │
    ▼
[QUALITY CONTROL ENGINE]
    │ ── Verifikasi kecocokan teks legalitas dengan Factual JSON
    │ ── Verifikasi resolusi & status (APPROVED / REJECTED)
    │
    ▼
[GOOGLE DRIVE OUTPUT WORKER]
    │ ── Buat hirarki folder otomatis di Google Drive
    │ ── Upload 9 Visual Assets + 1 Video File
    │ ── Simpan Google Drive File ID ke Database (`content_jobs`)
```

---

## 4. WORKER ARCHITECTURE (CONTAINERIZED SERVICES)

Sistem memisahkan tugas menjadi micro-worker independen:

1. **`n8n-orchestrator`**: Mengelola trigger, event loop, pemanggilan webhook worker, error handling retry, dan update status DB.
2. **`postgres-db`**: Database simpanan state relasional & data JSONB.
3. **`python-ocr-vision-worker`**:
   - Endpoint: `POST /api/v1/extract-product-data`
   - Melakukan cropping, binarization, RapidOCR text extraction, dan Ollama vision structuring.
4. **`python-template-render-worker`**:
   - Endpoint: `POST /api/v1/render-asset`
   - Menerima template ID, design system brand, data faktual snapshot, dan membuat PNG beresolusi tinggi (1080x1080 untuk feed, 1080x1920 untuk story/thumbnail).
5. **`python-video-worker`**:
   - Endpoint: `POST /api/v1/generate-video`
   - Menerima array asset path, durasi, audio track, merender MP4 video.

---

## 5. STRUKTUR AUTOMATIS GOOGLE DRIVE (OUTPUT V1)

Ekspor Google Drive mengikuti hirarki otomatis berikut:

```text
PRODUCT CONTENT ENGINE/
└── [BRAND_NAME]/                      (e.g., COD)
    └── BATCH_[BATCH_ID]/              (e.g., BATCH_20260812_001)
        ├── [VARIANT_NAME_1]/          (e.g., Lemon Sereh)
        │   ├── 01_Thumbnail.png
        │   ├── 02_Deskripsi_Produk.png
        │   ├── 03_Komposisi_Produk.png
        │   ├── 04_Manfaat_Produk.png
        │   ├── 05_Cara_Penyajian.png
        │   ├── 06_Cara_Penyimpanan.png
        │   ├── 07_Legalitas.png
        │   ├── 08_Keunggulan_Produk.png
        │   ├── 09_CTA_Terima_Kasih.png
        │   └── Video_Produk_Lemon_Sereh.mp4
        │
        ├── [VARIANT_NAME_2]/          (e.g., Lemon Talang)
        │   └── ... (9 Assets + 1 Video)
        ├── [VARIANT_NAME_3]/          (e.g., Beras Kencur)
        │   └── ... (9 Assets + 1 Video)
        └── [VARIANT_NAME_4]/          (e.g., Kunyit Asem)
            └── ... (9 Assets + 1 Video)
```

Setiap ID folder dan ID file Google Drive dicatat dalam database `content_jobs`.

---

## 6. QUALITY CONTROL (QC) & SYSTEM RETRY MEKANISME

### A. Lifecycle Status Pekerjaan
Setiap item konten (`content_jobs`) memiliki status transisi resmi:
`PENDING` ➔ `GENERATING` ➔ `QC` ➔ `APPROVED` / `REJECTED` ➔ `FAILED`

### B. QC Automated Rules:
1. **Rule 1 (Factual Matching):** Teks legalitas (NIB/SPP-IRT) pada file hasil render harus cocok 100% dengan `product_factual_data.legalities`.
2. **Rule 2 (No Fake Testimonials):** Jika `verified_claims` kosong, template 08 otomatis bertukar dari *Testimoni* ke *Keunggulan Utama Produk*.
3. **Rule 3 (Resolution Check):** File visual wajib berukuran persis 1080x1080px atau 1080x1920px dengan format PNG/MP4.

### C. Isolated Retry Mechanism (No Full-Batch Restart):
Jika pada varian *Lemon Sereh* asset `03_Komposisi` gagal (`FAILED`), n8n **HANYA** mengulang eksekusi untuk job `id` tersebut (`retry_count = retry_count + 1`), tanpa membuang atau merender ulang 8 asset lainnya yang sudah `APPROVED`.

---

## 7. LOGGING, PROMPT & TEMPLATE VERSIONING

* **Versioning Schema:**
  - Template Version: `brand_template_v1`, `minimalist_v2`, `legal_badge_v1`
  - Prompt Analysis Version: `prompt_ocr_extract_v1.0`
* **Log Entry Standard:**
  ```json
  {
    "job_id": "uuid-v4",
    "batch_id": "uuid-v4",
    "variant_name": "Lemon Sereh",
    "content_type": "07_LEGALITAS",
    "template_version": "v1.2",
    "status": "APPROVED",
    "gdrive_file_id": "1A2B3C4D5E...",
    "retry_count": 0,
    "timestamp": "2026-08-12T18:30:00Z"
  }
  ```

---

## 8. KEAMANAN & SECRET MANAGEMENT

* Tidak ada kredensial, API key, atau kata sandi database yang di-hardcode dalam repositori.
* Semua kredensial disimpan dalam `.env` (di-ignore oleh `.gitignore`) dan diakses melalui `n8n Credentials` serta variabel lingkungan Docker.
* Kredensial Google Service Account disimpan dalam file terisolasi `credentials/google_service_account.json` yang terlindungi.
