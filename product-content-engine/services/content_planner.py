"""
CONTENT ENGINE PLANNER (Phase 4)
Maps product factual data and brand design system into 9 Content Type definitions.
Enforces flexible slot rules (e.g., Keunggulan fallback if no testimonials, safe non-medical benefits).
"""

import os
import json
import uuid
import sqlite3
from typing import Dict, List, Optional

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "temp", "product_content.db")

class ContentPlanner:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_content_jobs_table()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_content_jobs_table(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS content_jobs (
                id TEXT PRIMARY KEY,
                batch_id TEXT NOT NULL,
                variant_id TEXT NOT NULL,
                content_type_code TEXT NOT NULL,
                template_version TEXT DEFAULT 'v1',
                prompt_version TEXT DEFAULT 'v1',
                creative_data TEXT DEFAULT '{}',
                factual_data_snapshot TEXT NOT NULL,
                output_local_path TEXT,
                gdrive_file_id TEXT,
                gdrive_web_link TEXT,
                status TEXT DEFAULT 'PENDING',
                qc_notes TEXT,
                error_log TEXT,
                retry_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
            );
            """)
            conn.commit()

    def generate_content_plan(self, batch_id: str, variant_id: str) -> List[Dict]:
        """
        Fetches brand info, variant info, and factual product data to create 9 content job definitions.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT v.variant_name, v.raw_image_urls, b.name as brand_name, b.logo_url, b.design_system, f.*
                FROM product_variants v
                JOIN brands b ON v.brand_id = b.id
                JOIN product_factual_data f ON v.id = f.variant_id
                WHERE v.id = ?
            """, (variant_id,))
            row = cursor.fetchone()

        if not row:
            raise ValueError(f"Variant or factual data not found for variant_id: {variant_id}")

        brand_name = row["brand_name"]
        variant_name = row["variant_name"]
        design_system = json.loads(row["design_system"])
        legalities = json.loads(row["legalities"]) if row["legalities"] else {"nib": None, "spirt": None, "halal": None}
        ingredients = json.loads(row["ingredients"]) if row["ingredients"] else []
        verified_claims = json.loads(row["verified_claims"]) if row["verified_claims"] else []
        verified_benefits = json.loads(row["verified_benefits"]) if row["verified_benefits"] else []
        net_weight = row["net_weight"] or "Porsi Pas"
        serving_suggestion = row["serving_suggestion"] or "Siap dinikmati kapan saja."
        storage_instruction = row["storage_instruction"] or "Simpan di tempat sejuk dan bersih."

        raw_images = json.loads(row["raw_image_urls"]) if row["raw_image_urls"] else []
        product_photo = raw_images[0] if raw_images else None

        factual_snapshot = {
            "brand_name": brand_name,
            "variant_name": variant_name,
            "net_weight": net_weight,
            "legalities": legalities,
            "ingredients": ingredients,
            "serving_suggestion": serving_suggestion,
            "storage_instruction": storage_instruction,
            "verified_claims": verified_claims,
            "verified_benefits": verified_benefits,
            "product_photo": product_photo
        }

        # 9 CONTENT TYPES DEFINITIONS (Strictly follows Master Prompt Sections 1, 8 & 9)
        content_types = [
            {
                "code": "01_THUMBNAIL",
                "title": "Thumbnail Utama Produk",
                "headline": f"{brand_name} - {variant_name}",
                "subheadline": f"Netto: {net_weight}",
                "badges": verified_claims[:2] if verified_claims else ["Herbal Pilihan"],
                "layout_type": "hero_product_card"
            },
            {
                "code": "02_DESKRIPSI",
                "title": "Deskripsi Produk",
                "headline": f"Keharmonisan Rasa {variant_name}",
                "body_text": f"Diproses higienis dari bahan herbal pilihan untuk memberikan kesegaran dan cita rasa alami terbaik.",
                "badges": ["Fresh & Natural"],
                "layout_type": "text_with_product"
            },
            {
                "code": "03_KOMPOSISI",
                "title": "Komposisi Produk",
                "headline": "Bahan-Bahan Alami",
                "list_items": ingredients if ingredients else ["Bahan Alami Pilihan"],
                "badges": ["100% Alami"],
                "layout_type": "bullet_ingredients"
            },
            {
                "code": "04_MANFAAT",
                "title": "Manfaat Produk",
                "headline": "Kebaikan Untuk Tubuh",
                "list_items": verified_benefits if verified_benefits else ["Menyegarkan tubuh", "Teman aktivitas harian"],
                "badges": ["Kesegaran Alami"],
                "layout_type": "benefit_cards"
            },
            {
                "code": "05_PENYAJIAN",
                "title": "Cara Penyajian",
                "headline": "Saran Penyajian",
                "body_text": serving_suggestion,
                "badges": ["Nikmat Dingin"],
                "layout_type": "instruction_step"
            },
            {
                "code": "06_PENYIMPANAN",
                "title": "Cara Penyimpanan",
                "headline": "Petunjuk Penyimpanan",
                "body_text": storage_instruction,
                "badges": ["Kualitas Terjaga"],
                "layout_type": "storage_guide"
            },
            {
                "code": "07_LEGALITAS",
                "title": "Legalitas & Sertifikasi",
                "headline": "Terjamin & Terdaftar Resmi",
                "legal_details": {
                    "SPP-IRT": legalities.get("spirt") or "Dalam Proses",
                    "NIB": legalities.get("nib") or "Dalam Proses",
                    "HALAL": legalities.get("halal") or "Terdaftar"
                },
                "badges": ["100% Legal & Aman"],
                "layout_type": "legal_badges"
            },
            {
                "code": "08_KEUNGGULAN",
                "title": "Keunggulan Produk", # Flexible fallback slot if no testimonial
                "headline": f"Mengapa Memilih {brand_name}?",
                "list_items": verified_claims if verified_claims else ["Kualitas Alami", "Resep Tradisional Terjamin"],
                "badges": ["Pilihan Terpercaya"],
                "layout_type": "feature_highlights"
            },
            {
                "code": "09_CTA",
                "title": "Call To Action / Terima Kasih",
                "headline": "Segera Nikmati Kesegarannya!",
                "body_text": f"Terima kasih telah memilih {brand_name}. Dapatkan varian {variant_name} sekarang!",
                "badges": ["Pesan Sekarang"],
                "layout_type": "cta_banner"
            }
        ]

        jobs = []
        with self._get_connection() as conn:
            cursor = conn.cursor()

            for ctype in content_types:
                job_id = f"job_{uuid.uuid4().hex[:8]}"
                creative_data = {
                    "title": ctype["title"],
                    "headline": ctype["headline"],
                    "badges": ctype.get("badges", []),
                    "layout_type": ctype["layout_type"],
                    "body_text": ctype.get("body_text"),
                    "list_items": ctype.get("list_items"),
                    "legal_details": ctype.get("legal_details"),
                    "design_system": design_system
                }

                cursor.execute("""
                    INSERT INTO content_jobs (id, batch_id, variant_id, content_type_code, creative_data, factual_data_snapshot, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
                """, (
                    job_id,
                    batch_id,
                    variant_id,
                    ctype["code"],
                    json.dumps(creative_data),
                    json.dumps(factual_snapshot)
                ))

                jobs.append({
                    "job_id": job_id,
                    "batch_id": batch_id,
                    "variant_id": variant_id,
                    "content_type_code": ctype["code"],
                    "title": ctype["title"],
                    "headline": ctype["headline"],
                    "status": "PENDING"
                })

            conn.commit()

        return jobs

if __name__ == "__main__":
    planner = ContentPlanner()
    print("ContentPlanner engine initialized successfully.")
