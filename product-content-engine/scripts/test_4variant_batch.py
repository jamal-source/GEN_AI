"""
Test Suite: 4-Variant Full Batch Run (Master Prompt Scenario)
Brand COD — Lemon Sereh, Lemon Talang, Beras Kencur, Kunyit Asem
Target: 4 variants x 9 assets = 36 assets + 4 videos -> Google Drive
"""
import os
import sys
import json
from PIL import Image, ImageDraw

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline import ProductContentPipeline

TEMP_DIR = os.path.join(os.path.dirname(__file__), "..", "temp", "sample_labels_4v")

VARIANT_CONFIGS = [
    {
        "name": "Lemon Sereh",
        "color": "#FEF9C3",
        "ocr_lines": [
            "BRAND: COD",
            "VARIAN: LEMON SEREH",
            "100% HERBAL ALAMI",
            "TANPA PENGAWET BUATAN",
            "NETTO: 250 ml",
            "KOMPOSISI: Sereh, Lemon Nipis, Air, Gula Aren",
            "P-IRT: 2093171010123-26",
            "NIB: 1234567890123",
            "HALAL: ID31110000123450121",
            "SARAN PENYAJIAN: Dinginkan sebelum diminum",
            "SARAN PENYIMPANAN: Simpan di tempat sejuk",
            "EXP: 31/12/2026"
        ]
    },
    {
        "name": "Lemon Talang",
        "color": "#FDE68A",
        "ocr_lines": [
            "BRAND: COD",
            "VARIAN: LEMON TALANG",
            "100% HERBAL ALAMI",
            "TANPA PENGAWET BUATAN",
            "NETTO: 250 ml",
            "KOMPOSISI: Lemon Talang, Air Pegunungan, Gula Aren, Jahe",
            "P-IRT: 2093171010456-26",
            "NIB: 1234567890456",
            "HALAL: ID31110000456780121",
            "SARAN PENYAJIAN: Tambahkan es batu untuk sensasi segar",
            "SARAN PENYIMPANAN: Tutup rapat setelah dibuka",
            "EXP: 31/12/2026"
        ]
    },
    {
        "name": "Beras Kencur",
        "color": "#FEF3C7",
        "ocr_lines": [
            "BRAND: COD",
            "VARIAN: BERAS KENCUR",
            "100% HERBAL ALAMI",
            "TANPA PENGAWET BUATAN",
            "NETTO: 250 ml",
            "KOMPOSISI: Beras, Kencur, Jahe, Gula Aren, Air",
            "P-IRT: 2093171010789-26",
            "NIB: 1234567890789",
            "HALAL: ID31110000789010121",
            "SARAN PENYAJIAN: Kocok sebelum diminum",
            "SARAN PENYIMPANAN: Simpan di kulkas maks 3 hari",
            "EXP: 31/12/2026"
        ]
    },
    {
        "name": "Kunyit Asem",
        "color": "#FDBA74",
        "ocr_lines": [
            "BRAND: COD",
            "VARIAN: KUNYIT ASEM",
            "100% HERBAL ALAMI",
            "TANPA PENGAWET BUATAN",
            "NETTO: 250 ml",
            "KOMPOSISI: Kunyit, Asam Jawa, Gula Aren, Air, Kayu Manis",
            "P-IRT: 2093171010999-26",
            "NIB: 1234567890999",
            "HALAL: ID31110000999010121",
            "SARAN PENYAJIAN: Hangatkan perlahan untuk khasiat optimal",
            "SARAN PENYIMPANAN: Jauhkan dari sinar matahari langsung",
            "EXP: 31/12/2026"
        ]
    }
]

COD_DESIGN_SYSTEM = {
    "primary_color": "#064E3B",
    "secondary_color": "#F0FDF4",
    "accent_color": "#10B981",
    "font_family": "Montserrat, sans-serif",
    "visual_style": "Fresh Organic Herbal",
    "layout_style": "Clean Dynamic Grid"
}

def create_variant_label(config: dict) -> str:
    """Creates a realistic packaging label image for a specific variant."""
    os.makedirs(TEMP_DIR, exist_ok=True)
    path = os.path.join(TEMP_DIR, f"label_{config['name'].lower().replace(' ', '_')}.jpg")
    img = Image.new("RGB", (1000, 1200), color=config["color"])
    draw = ImageDraw.Draw(img)
    y = 60
    for line in config["ocr_lines"]:
        draw.text((60, y), line, fill="#000000")
        y += 85
    img.save(path, format="JPEG", quality=95)
    return path


def test_4variant_batch():
    print("=" * 55)
    print("  MASTER PROMPT SCENARIO: 4-VARIANT BATCH TEST")
    print("  Brand: COD | Target: 36 assets + 4 videos")
    print("=" * 55)

    # Build variant configs with generated label images
    variants = []
    for cfg in VARIANT_CONFIGS:
        img_path = create_variant_label(cfg)
        variants.append({
            "name": cfg["name"],
            "image_path": img_path,
            "legal_doc_paths": None
        })

    # Run full 4-variant pipeline
    pipeline = ProductContentPipeline()
    results = pipeline.run_multi_variant_batch(
        brand_name="COD",
        variants=variants,
        design_system=COD_DESIGN_SYSTEM,
        logo_url="http://example.com/cod_logo.png"
    )

    # Final assertion: 36 assets + 4 videos = 40 total Drive files
    total_assets = sum(r["assets_rendered"] for r in results)
    total_drive_files = sum(r["drive_files"] for r in results)
    total_approved = sum(r["qc_approved"] for r in results)

    print(f"\n  Final validation:")
    print(f"    Total rendered assets : {total_assets} (expected 36)")
    print(f"    Total Drive uploads   : {total_drive_files} (expected 40 = 36 + 4 videos)")
    print(f"    Total QC approved     : {total_approved} (expected 40)")

    assert total_assets == 36, f"Expected 36 assets, got {total_assets}"
    assert total_drive_files == 40, f"Expected 40 Drive files, got {total_drive_files}"
    assert total_approved == 40, f"Expected 40 approved, got {total_approved}"

    print("\n  4-VARIANT BATCH TEST PASSED 100%!")
    print("  Product Content Automation Engine V1 is fully operational.")
    return True


if __name__ == "__main__":
    success = test_4variant_batch()
    if not success:
        sys.exit(1)
