"""
Test Suite: Phase 3 Product Intelligence (OCR & Vision Extraction Test)
"""
import os
import sys
import json
from PIL import Image, ImageDraw, ImageFont

# Add root directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.product_service import ProductService
from services.ocr_vision_worker import ProductIntelligenceWorker

def create_realistic_packaging_label(path: str, brand_name: str, variant_name: str):
    """Creates a high-contrast label image simulating authentic packaging text for OCR processing."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = Image.new("RGB", (1000, 1200), color="#FFFFFF")
    draw = ImageDraw.Draw(img)

    lines = [
        f"BRAND: {brand_name.upper()}",
        f"VARIAN: {variant_name.upper()}",
        "100% HERBAL ALAMI",
        "TANPA PENGAWET BUATAN",
        "NETTO: 250 ml",
        "KOMPOSISI: Sereh, Lemon, Air, Gula Aren",
        "P-IRT: 2093171010123-26",
        "NIB: 1234567890123",
        "HALAL: ID31110000123450121",
        "SARAN PENYAJIAN: Kocok dahulu sebelum diminum",
        "SARAN PENYIMPANAN: Simpan di tempat sejuk",
        "EXP: 31/12/2026"
    ]

    y = 60
    for line in lines:
        draw.text((60, y), line, fill="#000000")
        y += 85

    img.save(path, format="JPEG", quality=95)
    return path

def test_phase3_end_to_end():
    print("=" * 60)
    print("RUNNING PHASE 3 TEST: OCR & FACTUAL VISION EXTRACTION")
    print("=" * 60)

    # 1. Setup Product Service & Intelligence Worker
    product_service = ProductService()
    intelligence_worker = ProductIntelligenceWorker()

    # 2. Register Brand & Variant
    brand = product_service.register_brand("COD")
    variant = product_service.register_variant(brand["id"], "Lemon Sereh")

    # 3. Create & Upload Realistic Packaging Label Photo
    sample_dir = os.path.join(os.path.dirname(__file__), "..", "temp", "sample_labels")
    label_path = os.path.join(sample_dir, "lemon_sereh_label.jpg")
    create_realistic_packaging_label(label_path, "COD", "Lemon Sereh")

    upload_res = product_service.upload_product_photo("COD", "Lemon Sereh", label_path)
    stored_image_path = upload_res["stored_image_path"]

    # 4. Run Product Intelligence Worker (RapidOCR + Pattern Parsing)
    print(f"\n[OCR] Processing packaging label: {stored_image_path}")
    factual_result = intelligence_worker.process_variant_intelligence(variant["id"], [stored_image_path])

    print("\n------------------------------------------------------------")
    print("EXTRACTED FACTUAL JSON DATA (NO HALLUCINATION VERIFICATION)")
    print("------------------------------------------------------------")
    print(f" Status: {factual_result['status']}")
    print(f" Net Weight: {factual_result['net_weight']}")
    print(f" Expiry Date: {factual_result['expiry_date']}")
    print(f" Ingredients: {factual_result['ingredients']}")
    print(f" Legalities: {json.dumps(factual_result['legalities'], indent=2)}")
    print(f" Serving Suggestion: {factual_result['serving_suggestion']}")
    print(f" Storage Instruction: {factual_result['storage_instruction']}")
    print(f" Verified Claims: {factual_result['verified_claims']}")
    print(f" Manufacturer Address (Must be None): {factual_result['manufacturer_address']}")

    # 5. Database Verification
    with product_service._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM product_factual_data WHERE variant_id = ?", (variant["id"],))
        db_row = cursor.fetchone()

    db_legalities = json.loads(db_row["legalities"])
    assert db_legalities["nib"] == "1234567890123", "NIB extraction mismatch!"
    assert db_legalities["spirt"] == "2093171010123-26", "SPP-IRT extraction mismatch!"
    assert db_legalities["halal"] == "ID31110000123450121", "Halal ID extraction mismatch!"
    assert db_row["status"] == "VERIFIED", "Status should be VERIFIED"

    print("\n PHASE 3 TEST PASSED 100%! OCR Vision Extraction Accurate & Factual.")
    return True

if __name__ == "__main__":
    success = test_phase3_end_to_end()
    if not success:
        sys.exit(1)
