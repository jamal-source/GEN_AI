"""
Test Suite: Phase 2 Product Management & Dynamic Batch Registration Test
"""
import os
import sys
import json
from PIL import Image, ImageDraw

# Add root directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.product_service import ProductService

def create_dummy_product_photo(path: str, text: str, bg_color: str = "#E0E7FF"):
    """Generates a dummy product image file for pipeline testing."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = Image.new("RGB", (600, 600), color=bg_color)
    draw = ImageDraw.Draw(img)
    draw.text((200, 280), f"PRODUCT PHOTO:\n{text}", fill="#1E1B4B")
    img.save(path, format="JPEG")
    return path

def test_phase2_end_to_end():
    print("=" * 60)
    print("RUNNING PHASE 2 TEST: PRODUCT MANAGEMENT & BATCH REGISTRATION")
    print("=" * 60)

    service = ProductService()

    # 1. Register Brand "COD"
    brand_name = "COD"
    design_system = {
        "primary_color": "#064E3B",
        "secondary_color": "#F0FDF4",
        "accent_color": "#10B981",
        "font_family": "Montserrat, sans-serif",
        "visual_style": "Fresh Organic Herbal",
        "layout_style": "Clean Dynamic Grid"
    }
    brand_res = service.register_brand(brand_name, logo_url="http://example.com/logo_cod.png", design_system=design_system)
    print(f" SUCCESS: Brand Registered! ID: {brand_res['id']} | Name: {brand_res['name']}")

    # 2. Batch Upload Product Variants (Master Prompt Scenario: 4 Variants)
    variants = [
        ("Lemon Sereh", "#FEF08A"),
        ("Lemon Talang", "#FDE047"),
        ("Beras Kencur", "#FEF3C7"),
        ("Kunyit Asem", "#FDBA74")
    ]

    temp_dir = os.path.join(os.path.dirname(__file__), "..", "temp", "sample_photos")
    
    upload_results = []
    for var_name, color in variants:
        # Create a sample raw product photo
        sample_path = os.path.join(temp_dir, f"raw_{var_name.lower().replace(' ', '_')}.jpg")
        create_dummy_product_photo(sample_path, f"{brand_name} - {var_name}", bg_color=color)

        # Upload photo & register record
        result = service.upload_product_photo(brand_name, var_name, sample_path)
        upload_results.append(result)
        print(f" SUCCESS: Product Record Created -> Brand: {brand_name} | Variant: {var_name}")
        print(f"   Stored File: {result['stored_image_path']}")

    # 3. Database Integrity & State Check
    print("-" * 60)
    print("VERIFYING DATABASE STATE FOR BRAND & VARIANTS")
    print("-" * 60)

    with service._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM product_variants WHERE brand_id = ?", (brand_res["id"],))
        var_count = cursor.fetchone()["count"]
        print(f" Total Variants Registered for Brand '{brand_name}': {var_count} / 4")

        cursor.execute("""
        SELECT v.variant_name, f.legalities, f.status 
        FROM product_variants v 
        JOIN product_factual_data f ON v.id = f.variant_id 
        WHERE v.brand_id = ?
        """, (brand_res["id"],))
        rows = cursor.fetchall()
        for r in rows:
            print(f" - Variant: {r['variant_name']} | Status: {r['status']} | Legalities: {r['legalities']}")

    if var_count == 4:
        print("\n PHASE 2 TEST PASSED 100%! Product Management Pipeline Ready.")
        return True
    else:
        print("\n PHASE 2 TEST FAILED!")
        return False

if __name__ == "__main__":
    success = test_phase2_end_to_end()
    if not success:
        sys.exit(1)
