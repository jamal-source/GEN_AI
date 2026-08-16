"""
Test Suite: Phase 5 Dynamic Template & Text Layer Rendering Test
"""
import os
import sys
import json
import uuid
from PIL import Image

# Add root directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.product_service import ProductService
from services.content_planner import ContentPlanner
from services.template_engine import TemplateEngine

def test_phase5_end_to_end():
    print("=" * 60)
    print("RUNNING PHASE 5 TEST: DYNAMIC TEMPLATE & TEXT OVERLAY RENDER")
    print("=" * 60)

    # 1. Initialize Services
    product_service = ProductService()
    planner = ContentPlanner()
    engine = TemplateEngine()

    # 2. Get Brand & Variant
    brand = product_service.get_brand("COD")
    assert brand is not None, "Brand COD should exist"

    with product_service._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM product_variants WHERE brand_id = ? AND variant_name = 'Lemon Sereh'", (brand["id"],))
        variant_row = cursor.fetchone()

    assert variant_row is not None, "Variant Lemon Sereh should exist"
    variant_id = variant_row["id"]

    # 3. Create Content Plan & Render 9 Visual Assets
    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    print(f"\n[PLANNER] Creating 9 content jobs for Batch: {batch_id}")
    planner.generate_content_plan(batch_id, variant_id)

    print(f"[RENDER] Rendering 9 visual assets (1080x1080 PNG)...")
    rendered_assets = engine.render_batch_assets(batch_id)

    print("\n------------------------------------------------------------")
    print("RENDERED 9 VISUAL ASSETS OUTPUT DETAILS")
    print("------------------------------------------------------------")
    for idx, r in enumerate(rendered_assets, 1):
        file_path = r["output_local_path"]
        assert os.path.exists(file_path), f"Asset file missing: {file_path}"

        # Verify Resolution is 1080x1080px
        with Image.open(file_path) as img:
            w, h = img.size
            assert w == 1080 and h == 1080, f"Invalid asset dimensions: {w}x{h}"

        print(f" {idx:02d}. [{r['code']}] {r['title']}")
        print(f"     Path: {file_path} ({w}x{h} px)")
        print(f"     Status: {r['status']}")

    assert len(rendered_assets) == 9, f"Expected 9 rendered assets, got {len(rendered_assets)}"

    # 4. Verify Database State
    with engine._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM content_jobs WHERE batch_id = ? AND status = 'QC'", (batch_id,))
        qc_count = cursor.fetchone()["count"]

    assert qc_count == 9, f"Expected 9 jobs in QC status, got {qc_count}"

    print("\n PHASE 5 TEST PASSED 100%! All 9 Visual Assets Rendered at 1080x1080 Resolution.")
    return True

if __name__ == "__main__":
    success = test_phase5_end_to_end()
    if not success:
        sys.exit(1)
