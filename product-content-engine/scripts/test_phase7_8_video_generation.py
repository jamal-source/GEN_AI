"""
Test Suite: Phase 7 & 8 Image & Video Generation Worker Integration Test
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
from services.video_worker import VideoGenerationWorker
from services.gdrive_worker import GoogleDriveWorker

def test_phase7_8_end_to_end():
    print("=" * 60)
    print("RUNNING PHASE 7 & 8 TEST: VIDEO GENERATION & DRIVE EXPORT")
    print("=" * 60)

    # 1. Initialize Services
    product_service = ProductService()
    planner = ContentPlanner()
    engine = TemplateEngine()
    video_worker = VideoGenerationWorker()
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

    # 3. Generate 9 Content Jobs & Render Visual Assets
    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    print(f"\n[1/4] Generating 9 content definitions for Batch: {batch_id}")
    planner.generate_content_plan(batch_id, variant_id)

    print(f"[2/4] Rendering 9 visual assets (1080x1080 PNG)...")
    engine.render_batch_assets(batch_id)

    # 4. Generate Product Promo Video MP4
    print(f"[3/4] Assembling Product Video MP4 (Ken Burns Motion Engine)...")
    video_res = video_worker.generate_product_video(batch_id)
    video_path = video_res["video_path"]

    print("\n------------------------------------------------------------")
    print("GENERATED VIDEO ASSET DETAILS")
    print("------------------------------------------------------------")
    print(f" Video Path: {video_path}")
    print(f" Duration: {video_res['duration_sec']:.1f} seconds")
    print(f" Total Frames: {video_res['total_frames']} frames")
    print(f" Status: {video_res['status']}")

    assert os.path.exists(video_path), f"Video file missing: {video_path}"
    assert os.path.getsize(video_path) > 0, "Video file size should be > 0 bytes"

    # 5. Export Assets + Video to Google Drive
    print(f"\n[4/4] Exporting 9 Assets + 1 Video to Google Drive...")
    export_result = gdrive_worker.process_batch_drive_export(batch_id)

    print("\n------------------------------------------------------------")
    print("GOOGLE DRIVE EXPORT DETAILS (9 ASSETS + 1 VIDEO)")
    print("------------------------------------------------------------")
    print(f" Folder Tree: {export_result['folder_tree']}")
    print(f" Total Exported Files: {len(export_result['uploaded_files'])}")

    for idx, u in enumerate(export_result["uploaded_files"], 1):
        print(f" {idx:02d}. [{u['content_type_code']}] File ID: {u['gdrive_file_id']} | Status: {u['status']}")

    assert len(export_result["uploaded_files"]) == 10, f"Expected 10 exported files (9 visual + 1 video), got {len(export_result['uploaded_files'])}"

    print("\n PHASE 7 & 8 TEST PASSED 100%! 9 Visual Assets + 1 Product Video Generated & Uploaded to Drive.")
    return True

if __name__ == "__main__":
    success = test_phase7_8_end_to_end()
    if not success:
        sys.exit(1)
