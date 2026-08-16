"""
Test Suite: Phase 6 Google Drive Output Integration Test
"""
import os
import sys
import json
import uuid

# Add root directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.product_service import ProductService
from services.content_planner import ContentPlanner
from services.template_engine import TemplateEngine
from services.gdrive_worker import GoogleDriveWorker

def test_phase6_end_to_end():
    print("=" * 60)
    print("RUNNING PHASE 6 TEST: GOOGLE DRIVE FOLDER HIERARCHY & UPLOAD")
    print("=" * 60)

    # 1. Initialize Services
    product_service = ProductService()
    planner = ContentPlanner()
    engine = TemplateEngine()
    gdrive_worker = GoogleDriveWorker()

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
    print(f"\n[PLANNER] Creating batch: {batch_id}")
    planner.generate_content_plan(batch_id, variant_id)

    print(f"[RENDER] Rendering 9 visual assets...")
    engine.render_batch_assets(batch_id)

    # 4. Run Google Drive Export
    print(f"\n[GDRIVE] Processing Google Drive Folder Creation & Upload...")
    export_result = gdrive_worker.process_batch_drive_export(batch_id)

    print("\n------------------------------------------------------------")
    print("GOOGLE DRIVE EXPORT DETAILS")
    print("------------------------------------------------------------")
    print(f" Folder Tree: {export_result['folder_tree']}")
    print(f" Product Folder ID: {export_result['product_folder_id']}")
    print(" Uploaded Assets:")

    for idx, u in enumerate(export_result["uploaded_files"], 1):
        print(f" {idx:02d}. [{u['content_type_code']}] File ID: {u['gdrive_file_id']} | Status: {u['status']}")
        print(f"     Link: {u['gdrive_web_link']}")
        assert u["gdrive_file_id"] is not None, "Drive File ID must not be None"
        assert u["status"] == "APPROVED", "Status should be APPROVED"

    assert len(export_result["uploaded_files"]) == 9, "All 9 visual assets should be uploaded"

    # 5. Database State Verification
    with gdrive_worker._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM content_jobs WHERE batch_id = ? AND status = 'APPROVED'", (batch_id,))
        approved_count = cursor.fetchone()["count"]

    assert approved_count == 9, f"Expected 9 approved jobs in DB, got {approved_count}"

    print("\n PHASE 6 TEST PASSED 100%! Google Drive Folder Hierarchy & File Upload Completed.")
    return True

if __name__ == "__main__":
    success = test_phase6_end_to_end()
    if not success:
        sys.exit(1)
