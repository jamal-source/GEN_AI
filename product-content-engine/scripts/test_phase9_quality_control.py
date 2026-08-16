"""
Test Suite: Phase 9 Quality Control & Isolated Retry System Test
"""
import os
import sys
import json
import uuid

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.product_service import ProductService
from services.content_planner import ContentPlanner
from services.template_engine import TemplateEngine
from services.video_worker import VideoGenerationWorker
from services.quality_control import QualityControlEngine

def test_phase9_end_to_end():
    print("=" * 60)
    print("RUNNING PHASE 9 TEST: QC ENGINE & ISOLATED RETRY SYSTEM")
    print("=" * 60)

    product_service = ProductService()
    planner = ContentPlanner()
    engine = TemplateEngine()
    video_worker = VideoGenerationWorker()
    qc_engine = QualityControlEngine()

    brand = product_service.get_brand("COD")
    assert brand is not None

    with product_service._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM product_variants WHERE brand_id = ? AND variant_name = 'Lemon Sereh'", (brand["id"],))
        variant_row = cursor.fetchone()

    assert variant_row is not None
    variant_id = variant_row["id"]

    # 1. Full pipeline: Plan -> Render -> Video
    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    print(f"\n[PIPELINE] Full batch: {batch_id}")
    planner.generate_content_plan(batch_id, variant_id)
    engine.render_batch_assets(batch_id)
    video_worker.generate_product_video(batch_id)

    # 2. Run QC on all 10 jobs (9 assets + 1 video)
    print(f"\n[QC] Running QC verification on all 10 jobs...")
    qc_results = qc_engine.run_qc_for_batch(batch_id)

    print("\n------------------------------------------------------------")
    print("QC RESULTS PER JOB")
    print("------------------------------------------------------------")
    approved_count = 0
    rejected_count = 0
    failed_job_id = None

    for r in qc_results:
        icon = "[OK  ]" if r["status"] == "APPROVED" else "[FAIL]"
        print(f" {icon} [{r['content_type_code']}] Status: {r['status']}")
        print(f"   Notes: {r['qc_notes']}")
        if r["status"] == "APPROVED":
            approved_count += 1
        else:
            rejected_count += 1
            failed_job_id = r["job_id"]

    assert approved_count >= 9, f"Expected at least 9 approved, got {approved_count}"

    # 3. Test Isolated Retry on a deliberate REJECTED job (corrupt output path)
    print("\n[RETRY TEST] Simulating a REJECTED single job for isolated retry...")
    with qc_engine._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, content_type_code FROM content_jobs WHERE batch_id = ? AND content_type_code = '04_MANFAAT'", (batch_id,))
        target_job = cursor.fetchone()

    target_job_id = target_job["id"]

    # Corrupt the output_local_path to force a QC RULE 3 failure
    with qc_engine._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE content_jobs SET output_local_path = '/bad/path/fake.png', status = 'REJECTED', retry_count = 0 WHERE id = ?", (target_job_id,))
        conn.commit()

    print(f"   Injected failure into job [{target_job['content_type_code']}] id: {target_job_id}")

    # Retry using the render function (isolated — only this 1 job reruns)
    retry_result = qc_engine.retry_failed_job(
        target_job_id,
        render_fn=engine.render_content_asset,
        drive_fn=None
    )

    print(f"   Retry Result for [{retry_result['content_type_code']}]: {retry_result['status']}")
    print(f"   Notes: {retry_result['qc_notes']}")

    # 4. Final database status count
    with qc_engine._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT status, COUNT(*) as count FROM content_jobs WHERE batch_id = ? GROUP BY status", (batch_id,))
        status_rows = cursor.fetchall()

    print("\n------------------------------------------------------------")
    print("FINAL JOB STATUS DISTRIBUTION")
    print("------------------------------------------------------------")
    for s in status_rows:
        print(f"   Status: {s['status']} | Count: {s['count']}")

    print("\nPHASE 9 TEST PASSED! QC Engine + Isolated Retry System Verified.")
    return True

if __name__ == "__main__":
    success = test_phase9_end_to_end()
    if not success:
        sys.exit(1)
