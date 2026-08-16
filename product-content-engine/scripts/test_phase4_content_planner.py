"""
Test Suite: Phase 4 Content Engine Planner Test
"""
import os
import sys
import json
import uuid

# Add root directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.product_service import ProductService
from services.ocr_vision_worker import ProductIntelligenceWorker
from services.content_planner import ContentPlanner

def test_phase4_end_to_end():
    print("=" * 60)
    print("RUNNING PHASE 4 TEST: 9 CONTENT TYPE DEFINITIONS GENERATION")
    print("=" * 60)

    # 1. Initialize Services
    product_service = ProductService()
    intelligence_worker = ProductIntelligenceWorker()
    planner = ContentPlanner()

    # 2. Get registered Brand & Variant
    brand = product_service.get_brand("COD")
    assert brand is not None, "Brand COD should exist"

    with product_service._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM product_variants WHERE brand_id = ? AND variant_name = 'Lemon Sereh'", (brand["id"],))
        variant_row = cursor.fetchone()

    assert variant_row is not None, "Variant Lemon Sereh should exist"
    variant_id = variant_row["id"]

    # 3. Generate 9 Content Jobs Plan
    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    print(f"\n[PLANNER] Generating 9 content definitions for Batch: {batch_id}")
    jobs = planner.generate_content_plan(batch_id, variant_id)

    print("\n------------------------------------------------------------")
    print("GENERATED 9 CONTENT JOB DEFINITIONS")
    print("------------------------------------------------------------")
    for idx, j in enumerate(jobs, 1):
        print(f" {idx:02d}. [{j['content_type_code']}] {j['title']} | Headline: '{j['headline']}' | Status: {j['status']}")

    assert len(jobs) == 9, f"Expected 9 content jobs, got {len(jobs)}"

    # 4. Verify Job Snapshot & Factual Legalities in Database
    with planner._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM content_jobs WHERE batch_id = ? AND content_type_code = '07_LEGALITAS'", (batch_id,))
        legal_job = cursor.fetchone()

    creative_data = json.loads(legal_job["creative_data"])
    factual_snapshot = json.loads(legal_job["factual_data_snapshot"])

    print("\n------------------------------------------------------------")
    print("VERIFYING CONTENT JOB 07 LEGALITAS SNAPSHOT DATA")
    print("------------------------------------------------------------")
    print(f" Headline: {creative_data['headline']}")
    print(f" Legal Details: {creative_data['legal_details']}")
    print(f" Snapshot Legalities: {factual_snapshot['legalities']}")

    assert factual_snapshot['legalities']['nib'] == "1234567890123", "NIB snapshot mismatch!"
    assert factual_snapshot['legalities']['spirt'] == "2093171010123-26", "SPP-IRT snapshot mismatch!"
    assert legal_job["status"] == "PENDING", "Initial status should be PENDING"

    print("\n PHASE 4 TEST PASSED 100%! 9 Content Definitions Generated Successfully.")
    return True

if __name__ == "__main__":
    success = test_phase4_end_to_end()
    if not success:
        sys.exit(1)
