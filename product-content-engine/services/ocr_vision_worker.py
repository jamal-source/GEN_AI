"""
PRODUCT INTELLIGENCE & OCR VISION WORKER (Phase 3)
Extracts factual product details, legalities (NIB, SPP-IRT, Halal), compositions, net weight, and instructions.
Strictly obeys NON-HALLUCINATION rules: if missing from source photo/document, value MUST be null.
"""

import os
import re
import json
import sqlite3
from typing import Dict, List, Optional
from rapidocr_onnxruntime import RapidOCR

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "temp", "product_content.db")

class ProductIntelligenceWorker:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self.ocr_engine = RapidOCR()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def extract_raw_ocr_text(self, image_path: str) -> str:
        """Runs RapidOCR on image file and returns concatenated raw text."""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found for OCR: {image_path}")

        result, _ = self.ocr_engine(image_path)
        if not result:
            return ""

        extracted_lines = [line[1] for line in result if line and len(line) >= 2]
        return "\n".join(extracted_lines)

    def parse_factual_data(self, raw_text: str) -> Dict:
        """
        Parses OCR text using pattern recognition for Indonesian food/beverage packaging.
        Follows STRICT NON-HALLUCINATION RULES: Returns None if not found in text.
        """
        text = raw_text.upper()

        # 1. Legalities Parsing
        nib_match = re.search(r'NIB[:\s]*(\d{13})', text)
        spirt_match = re.search(r'(?:P-IRT|PIRT|SPP-IRT)[:\s]*([0-9\-]{10,20})', text)
        halal_match = re.search(r'(?:HALAL|LPPOM)[:\s]*(ID[0-9]{10,18}|[0-9]{10,18})', text)

        nib = nib_match.group(1) if nib_match else None
        spirt = spirt_match.group(1) if spirt_match else None
        halal = halal_match.group(1) if halal_match else None

        # 2. Net Weight / Volume Parsing
        weight_match = re.search(r'(?:BERSIH|NETTO|NET WEIGHT|ISI)[:\s]*(\d+\s*(?:ML|L|G|KG|GRAM|LITER))', text)
        net_weight = weight_match.group(1) if weight_match else None

        # 3. Expiry Date Parsing
        exp_match = re.search(r'(?:EXP|EXPIRATION|BEST BEFORE)[:\s]*(\d{2}[/\.-]\d{2}[/\.-]\d{2,4})', text)
        expiry_date = exp_match.group(1) if exp_match else None

        # 4. Ingredients Parsing
        ingredients = []
        ing_match = re.search(r'(?:KOMPOSISI|INGREDIENTS)[:\s]*(.*?)(?:\n\n|\n[A-Z]+:|$)', raw_text, re.DOTALL | re.IGNORECASE)
        if ing_match:
            ing_raw = ing_match.group(1).replace("\n", " ").strip()
            ingredients = [item.strip() for item in re.split(r'[,;\.]', ing_raw) if item.strip()]

        # 5. Serving Suggestion & Storage Instruction Parsing
        serving_match = re.search(r'(?:CARA PENYAJIAN|SARAN PENYAJIAN)[:\s]*(.*?)(?:\n\n|\n[A-Z]+:|$)', raw_text, re.DOTALL | re.IGNORECASE)
        serving_suggestion = serving_match.group(1).strip() if serving_match else None

        storage_match = re.search(r'(?:CARA PENYIMPANAN|SARAN PENYIMPANAN)[:\s]*(.*?)(?:\n\n|\n[A-Z]+:|$)', raw_text, re.DOTALL | re.IGNORECASE)
        storage_instruction = storage_match.group(1).strip() if storage_match else None

        # 6. Verified Claims & Benefits
        verified_claims = []
        if "100% HERBAL" in text or "TANPA PENGAWET" in text:
            if "100% HERBAL" in text:
                verified_claims.append("100% Herbal Alami")
            if "TANPA PENGAWET" in text:
                verified_claims.append("Tanpa Pengawet Buatan")

        legalities = {
            "nib": nib,
            "spirt": spirt,
            "halal": halal,
            "other_certifications": []
        }

        # Status determination: VERIFIED if legalities or ingredients present, otherwise INCOMPLETE
        status = "VERIFIED" if (nib or spirt or halal or ingredients) else "INCOMPLETE"

        return {
            "ingredients": ingredients if ingredients else None,
            "net_weight": net_weight,
            "volume": net_weight,
            "expiry_date": expiry_date,
            "manufacturer_name": None,  # Strict null if not in text
            "manufacturer_address": None, # Strict null if not in text
            "legalities": legalities,
            "verified_claims": verified_claims,
            "verified_benefits": [], # Strict null/empty if no medical claim text
            "serving_suggestion": serving_suggestion,
            "storage_instruction": storage_instruction,
            "raw_ocr_payload": {"raw_text": raw_text},
            "status": status
        }

    def process_variant_intelligence(self, variant_id: str, image_paths: List[str], legal_doc_paths: Optional[List[str]] = None) -> Dict:
        """
        Runs OCR & Vision pipeline across variant packaging photos & legal documents,
        synthesizes factual JSON payload and saves to product_factual_data table.
        """
        all_paths = list(image_paths) + (list(legal_doc_paths) if legal_doc_paths else [])
        ocr_text_blocks = []

        for p in all_paths:
            if os.path.exists(p):
                txt = self.extract_raw_ocr_text(p)
                if txt:
                    ocr_text_blocks.append(txt)

        combined_text = "\n---\n".join(ocr_text_blocks)
        factual_data = self.parse_factual_data(combined_text)

        # Update product_factual_data record in DB
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE product_factual_data 
                SET ingredients = ?,
                    net_weight = ?,
                    volume = ?,
                    expiry_date = ?,
                    legalities = ?,
                    verified_claims = ?,
                    verified_benefits = ?,
                    serving_suggestion = ?,
                    storage_instruction = ?,
                    raw_ocr_payload = ?,
                    status = ?
                WHERE variant_id = ?
            """, (
                json.dumps(factual_data["ingredients"]) if factual_data["ingredients"] else None,
                factual_data["net_weight"],
                factual_data["volume"],
                factual_data["expiry_date"],
                json.dumps(factual_data["legalities"]),
                json.dumps(factual_data["verified_claims"]),
                json.dumps(factual_data["verified_benefits"]),
                factual_data["serving_suggestion"],
                factual_data["storage_instruction"],
                json.dumps(factual_data["raw_ocr_payload"]),
                factual_data["status"],
                variant_id
            ))
            conn.commit()

        factual_data["variant_id"] = variant_id
        return factual_data

if __name__ == "__main__":
    worker = ProductIntelligenceWorker()
    print("ProductIntelligenceWorker initialized with RapidOCR.")
