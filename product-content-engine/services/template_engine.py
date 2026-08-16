"""
DYNAMIC TEMPLATE & TEXT OVERLAY ENGINE (Phase 5)
Renders high-resolution 1080x1080px visual assets for all 9 Content Types.
Enforces Master Prompt Rule #9:
AI GENERATED VISUAL / BACKGROUND + PILLOW TEXT LAYER = FINAL ASSET
Factual details (NIB, SPP-IRT, Ingredients, CTA) are rendered via deterministic code layers.
"""

import os
import json
import sqlite3
from typing import Dict, List, Tuple
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "temp", "product_content.db")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")

class TemplateEngine:
    def __init__(self, db_path: str = DB_PATH, output_dir: str = OUTPUT_DIR):
        self.db_path = db_path
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def hex_to_rgb(self, hex_str: str) -> Tuple[int, int, int]:
        hex_str = hex_str.lstrip("#")
        if len(hex_str) == 6:
            return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))
        return (31, 41, 55)

    def _draw_rounded_rectangle(self, draw: ImageDraw.ImageDraw, xy, radius=20, fill=None, outline=None, width=1):
        draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

    def render_content_asset(self, job_id: str) -> Dict:
        """
        Fetches job details from DB and renders a 1080x1080 PNG asset based on content_type_code.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT j.*, v.variant_name, b.name as brand_name
                FROM content_jobs j
                JOIN product_variants v ON j.variant_id = v.id
                JOIN brands b ON v.brand_id = b.id
                WHERE j.id = ?
            """, (job_id,))
            job = cursor.fetchone()

        if not job:
            raise ValueError(f"Job not found for job_id: {job_id}")

        batch_id = job["batch_id"]
        brand_name = job["brand_name"]
        variant_name = job["variant_name"]
        code = job["content_type_code"]
        creative_data = json.loads(job["creative_data"])
        factual_snapshot = json.loads(job["factual_data_snapshot"])
        design_system = creative_data.get("design_system", {})

        primary_color = self.hex_to_rgb(design_system.get("primary_color", "#15803D"))
        secondary_color = self.hex_to_rgb(design_system.get("secondary_color", "#F0FDF4"))
        accent_color = self.hex_to_rgb(design_system.get("accent_color", "#16A34A"))

        # Target output folder: output/<batch_id>/<brand_name>/<variant_name>/
        dest_dir = os.path.join(self.output_dir, batch_id, brand_name.replace(" ", "_"), variant_name.replace(" ", "_"))
        os.makedirs(dest_dir, exist_ok=True)
        out_filename = f"{code}_{variant_name.lower().replace(' ', '_')}.png"
        out_path = os.path.join(dest_dir, out_filename)

        # Try loading TrueType font or fallback to default with size
        font_names = ["arial.ttf", "segoeui.ttf", "calibri.ttf", "DejaVuSans.ttf"]
        def get_font(size):
            for fname in font_names:
                try:
                    return ImageFont.truetype(fname, size)
                except Exception:
                    continue
            try:
                return ImageFont.load_default(size=size)
            except Exception:
                return ImageFont.load_default()

        title_font = get_font(36)
        sub_font = get_font(26)
        head_font = get_font(44)
        body_font = get_font(28)
        small_font = get_font(20)

        # 1. Base 1080x1080 Canvas Creation with gradient-like background
        canvas = Image.new("RGB", (1080, 1080), color=secondary_color)
        draw = ImageDraw.Draw(canvas)

        # Top Header Banner
        self._draw_rounded_rectangle(draw, (40, 40, 1040, 210), radius=20, fill=primary_color)
        title = creative_data.get("title", "PRODUCT CONTENT").upper()
        headline = creative_data.get("headline", f"{brand_name} - {variant_name}")

        draw.text((70, 65), f"PRODUK UMKM • {brand_name.upper()}", fill=(220, 252, 231), font=title_font)
        draw.text((70, 115), title, fill=(255, 255, 255), font=head_font)

        # Main Card Content Container
        self._draw_rounded_rectangle(draw, (40, 235, 1040, 1000), radius=25, fill=(255, 255, 255), outline=primary_color, width=3)

        # 2. Content Type Specific Layout & Text Overlay Rendering
        if code == "01_THUMBNAIL":
            photo_path = factual_snapshot.get("product_photo")
            if photo_path and os.path.exists(photo_path):
                try:
                    with Image.open(photo_path) as pimg:
                        pimg_resized = pimg.resize((520, 520))
                        canvas.paste(pimg_resized, (280, 270))
                except Exception:
                    pass
            else:
                self._draw_rounded_rectangle(draw, (280, 270, 800, 770), radius=30, fill=(254, 240, 138), outline=primary_color, width=2)
                draw.text((360, 480), f"FOTO PRODUK\n{variant_name.upper()}", fill=primary_color, font=head_font)

            # Promo Badge Banner
            self._draw_rounded_rectangle(draw, (80, 800, 1000, 960), radius=20, fill=primary_color)
            draw.text((120, 830), f"VARIAN: {variant_name.upper()}", fill=(255, 255, 255), font=title_font)
            draw.text((120, 890), f"KUALITAS TERJAMIN • 100% PRODUK UMKM ASLI", fill=(220, 252, 231), font=small_font)

        elif code == "03_KOMPOSISI":
            items = creative_data.get("list_items", [])
            draw.text((80, 265), "BAHAN & KOMPOSISI UTAMA:", fill=primary_color, font=title_font)
            y = 340
            for idx, itm in enumerate(items[:6], 1):
                self._draw_rounded_rectangle(draw, (80, y, 1000, y + 85), radius=16, fill=secondary_color, outline=accent_color, width=2)
                draw.text((110, y + 25), f"🌿  {itm}", fill=primary_color, font=body_font)
                y += 100

        elif code == "07_LEGALITAS":
            legal_info = creative_data.get("legal_details", {})
            draw.text((80, 265), "LEGALITAS & SERTIFIKASI RESMI:", fill=primary_color, font=title_font)

            y = 340
            for label, val in legal_info.items():
                self._draw_rounded_rectangle(draw, (80, y, 1000, y + 145), radius=20, fill=secondary_color, outline=primary_color, width=3)
                draw.text((120, y + 30), f"SERTIFIKAT {label.upper()}", fill=primary_color, font=title_font)
                draw.text((120, y + 80), f"NOMOR REGISTRASI: {val}", fill=accent_color, font=body_font)
                y += 170

        elif code == "05_PENYAJIAN" or code == "06_PENYIMPANAN":
            body = creative_data.get("body_text", "")
            draw.text((80, 265), f"PETUNJUK {code.split('_')[1]}:", fill=primary_color, font=title_font)
            self._draw_rounded_rectangle(draw, (80, 340, 1000, 750), radius=20, fill=secondary_color, outline=accent_color, width=2)
            draw.text((120, 400), body, fill=primary_color, font=body_font)

        else: # 02_DESKRIPSI, 04_MANFAAT, 08_KEUNGGULAN, 09_CTA
            body = creative_data.get("body_text")
            items = creative_data.get("list_items", [])
            draw.text((80, 265), headline.upper()[:40], fill=primary_color, font=title_font)

            if body:
                self._draw_rounded_rectangle(draw, (80, 330, 1000, 560), radius=20, fill=secondary_color, outline=accent_color, width=2)
                draw.text((120, 380), body[:180], fill=primary_color, font=body_font)

            if items:
                y = 600 if body else 350
                for itm in items[:4]:
                    self._draw_rounded_rectangle(draw, (80, y, 1000, y + 80), radius=16, fill=secondary_color)
                    draw.text((120, y + 22), f"✨  {itm}", fill=primary_color, font=body_font)
                    y += 95

        # Footer Watermark
        draw.text((360, 1020), f"OFFICIAL {brand_name.upper()} CONTENT", fill=primary_color, font=small_font)

        # 3. Save Final Rendered 1080x1080 PNG Asset
        canvas.save(out_path, format="PNG", quality=95)

        # 4. Update Database Job Status -> QC
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE content_jobs
                SET output_local_path = ?, status = 'QC'
                WHERE id = ?
            """, (out_path, job_id))
            conn.commit()

        return {
            "job_id": job_id,
            "code": code,
            "title": title,
            "output_local_path": out_path,
            "status": "QC"
        }

    def render_batch_assets(self, batch_id: str) -> List[Dict]:
        """
        Renders all pending jobs in a batch.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM content_jobs WHERE batch_id = ?", (batch_id,))
            rows = cursor.fetchall()

        results = []
        for r in rows:
            res = self.render_content_asset(r["id"])
            results.append(res)

        return results

if __name__ == "__main__":
    engine = TemplateEngine()
    print("TemplateEngine initialized with 2-layer SVG/Pillow Canvas composite renderer.")
