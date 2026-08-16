"""
PRODUCT MANAGEMENT SERVICE (Phase 2)
Handles Brand Creation, Design System Management, Variant Registration, and Product Photo Uploads.
"""

import os
import json
import uuid
import sqlite3
import shutil
from typing import Dict, List, Optional
from PIL import Image

# Path Configurations
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
DB_PATH = os.path.join(BASE_DIR, "temp", "product_content.db")

class ProductService:
    def __init__(self, db_path: str = DB_PATH, upload_dir: str = UPLOAD_DIR):
        self.db_path = db_path
        self.upload_dir = upload_dir
        os.makedirs(self.upload_dir, exist_ok=True)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_sqlite_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_sqlite_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # 1. Brands Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS brands (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                logo_url TEXT,
                design_system TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)

            # 2. Product Variants Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS product_variants (
                id TEXT PRIMARY KEY,
                brand_id TEXT NOT NULL,
                variant_name TEXT NOT NULL,
                raw_image_urls TEXT NOT NULL DEFAULT '[]',
                legal_document_urls TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE,
                UNIQUE(brand_id, variant_name)
            );
            """)

            # 3. Product Factual Data Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS product_factual_data (
                id TEXT PRIMARY KEY,
                variant_id TEXT UNIQUE NOT NULL,
                ingredients TEXT,
                net_weight TEXT,
                volume TEXT,
                expiry_date TEXT,
                legalities TEXT NOT NULL DEFAULT '{}',
                verified_claims TEXT DEFAULT '[]',
                verified_benefits TEXT DEFAULT '[]',
                serving_suggestion TEXT,
                storage_instruction TEXT,
                raw_ocr_payload TEXT DEFAULT '{}',
                status TEXT DEFAULT 'RAW_EXTRACTED',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
            );
            """)
            conn.commit()

    # --- BRAND MANAGEMENT ---
    def register_brand(self, name: str, logo_url: Optional[str] = None, design_system: Optional[Dict] = None) -> Dict:
        existing = self.get_brand(name)
        if existing:
            return existing

        if not design_system:
            design_system = {
                "primary_color": "#1F2937",
                "secondary_color": "#F3F4F6",
                "accent_color": "#10B981",
                "font_family": "Inter, sans-serif",
                "visual_style": "Modern Minimalist",
                "layout_style": "Clean Grid"
            }
            
        brand_id = f"brand_{uuid.uuid4().hex[:8]}"
        design_system_str = json.dumps(design_system)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO brands (id, name, logo_url, design_system) VALUES (?, ?, ?, ?)",
                (brand_id, name, logo_url, design_system_str)
            )
            conn.commit()

        return {
            "id": brand_id,
            "name": name,
            "logo_url": logo_url,
            "design_system": design_system
        }

    def get_brand(self, brand_name: str) -> Optional[Dict]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM brands WHERE name = ?", (brand_name,))
            row = cursor.fetchone()
            if not row:
                return None
            return {
                "id": row["id"],
                "name": row["name"],
                "logo_url": row["logo_url"],
                "design_system": json.loads(row["design_system"])
            }

    # --- VARIANT MANAGEMENT ---
    def register_variant(self, brand_id: str, variant_name: str) -> Dict:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM product_variants WHERE brand_id = ? AND variant_name = ?", (brand_id, variant_name))
            row = cursor.fetchone()
            if row:
                return {
                    "id": row["id"],
                    "brand_id": row["brand_id"],
                    "variant_name": row["variant_name"],
                    "raw_image_urls": json.loads(row["raw_image_urls"])
                }

        variant_id = f"var_{uuid.uuid4().hex[:8]}"
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO product_variants (id, brand_id, variant_name, raw_image_urls) VALUES (?, ?, ?, ?)",
                (variant_id, brand_id, variant_name, json.dumps([]))
            )
            # Initialize empty factual data record with default NULL values (Strict No Hallucination rule)
            factual_id = f"fact_{uuid.uuid4().hex[:8]}"
            cursor.execute(
                "INSERT INTO product_factual_data (id, variant_id, legalities) VALUES (?, ?, ?)",
                (factual_id, variant_id, json.dumps({"nib": None, "spirt": None, "halal": None, "other_certifications": []}))
            )
            conn.commit()

        return {
            "id": variant_id,
            "brand_id": brand_id,
            "variant_name": variant_name,
            "raw_image_urls": []
        }

    # --- PRODUCT PHOTO UPLOAD & RECORD CREATION ---
    def upload_product_photo(self, brand_name: str, variant_name: str, source_image_path: str) -> Dict:
        """
        Uploads product photo, validates image file, stores in structured folder:
        uploads/<brand_name>/<variant_name>/<filename>
        Returns updated variant product record.
        """
        # Validate input file existence & image integrity
        if not os.path.exists(source_image_path):
            raise FileNotFoundError(f"Source image not found: {source_image_path}")

        try:
            with Image.open(source_image_path) as img:
                img.verify() # Verify file is a valid image
                format_ext = img.format.lower() if img.format else "jpg"
        except Exception as e:
            raise ValueError(f"Invalid image file: {str(e)}")

        # Ensure Brand & Variant exist
        brand = self.get_brand(brand_name)
        if not brand:
            brand = self.register_brand(brand_name)
        
        # Get or create variant
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM product_variants WHERE brand_id = ? AND variant_name = ?", (brand["id"], variant_name))
            variant_row = cursor.fetchone()
        
        if variant_row:
            variant_id = variant_row["id"]
            existing_images = json.loads(variant_row["raw_image_urls"])
        else:
            new_var = self.register_variant(brand["id"], variant_name)
            variant_id = new_var["id"]
            existing_images = []

        # Target directory structure: uploads/<brand>/<variant>/
        dest_dir = os.path.join(self.upload_dir, brand_name.replace(" ", "_"), variant_name.replace(" ", "_"))
        os.makedirs(dest_dir, exist_ok=True)

        filename = f"photo_{len(existing_images) + 1}_{uuid.uuid4().hex[:6]}.{format_ext}"
        dest_path = os.path.join(dest_dir, filename)

        shutil.copy2(source_image_path, dest_path)
        existing_images.append(dest_path)

        # Update product variant record in DB
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE product_variants SET raw_image_urls = ? WHERE id = ?",
                (json.dumps(existing_images), variant_id)
            )
            conn.commit()

        return {
            "status": "SUCCESS",
            "brand": brand,
            "variant_id": variant_id,
            "variant_name": variant_name,
            "stored_image_path": dest_path,
            "total_photos": len(existing_images)
        }

if __name__ == "__main__":
    service = ProductService()
    print("ProductService initialized successfully.")
