
import os
import sys
import json
import uuid
from typing import List, Dict

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from services.product_service import ProductService
from services.ocr_vision_worker import ProductIntelligenceWorker
from services.content_planner import ContentPlanner
from services.template_engine import TemplateEngine
from services.video_worker import VideoGenerationWorker
from services.gdrive_worker import GoogleDriveWorker
from services.quality_control import QualityControlEngine


class ProductContentPipeline:
    def __init__(self):
        self.product_service = ProductService()
        self.ocr_worker = ProductIntelligenceWorker()
        self.content_planner = ContentPlanner()
        self.template_engine = TemplateEngine()
        self.video_worker = VideoGenerationWorker()
        self.gdrive_worker = GoogleDriveWorker()
        self.qc_engine = QualityControlEngine()

    def run_single_variant(
        self,
        brand_name: str,
        variant_name: str,
        image_path: str,
        batch_id: str,
        design_system: dict = None,
        logo_url: str = None,
        legal_doc_paths: List[str] = None
    ) -> Dict:
        """
        Runs full pipeline for a single product variant.
        Returns summary dict with all job statuses.
        """
        sep = "-" * 55
        print(f"\n{sep}")
        print(f"  VARIANT: {brand_name} | {variant_name}")
        print(sep)

        # STEP 1 — Product Registration
        print(f"  [1/6] Registering brand & variant...")
        brand = self.product_service.register_brand(brand_name, logo_url=logo_url, design_system=design_system)
        variant = self.product_service.register_variant(brand["id"], variant_name)
        upload_res = self.product_service.upload_product_photo(brand_name, variant_name, image_path)
        variant_id = variant["id"]

        # STEP 2 — OCR & Factual Intelligence Extraction
        print(f"  [2/6] Running OCR & Vision extraction...")
        stored_images = json.loads(
            self.product_service._get_connection().execute(
                "SELECT raw_image_urls FROM product_variants WHERE id = ?", (variant_id,)
            ).fetchone()["raw_image_urls"]
        )
        factual_result = self.ocr_worker.process_variant_intelligence(
            variant_id, stored_images, legal_doc_paths
        )
        print(f"         OCR Status: {factual_result['status']} | NIB: {factual_result['legalities'].get('nib')} | SPP-IRT: {factual_result['legalities'].get('spirt')}")

        # STEP 3 — Content Engine Planning (9 Content Definitions)
        print(f"  [3/6] Generating 9 content job definitions...")
        jobs = self.content_planner.generate_content_plan(batch_id, variant_id)
        print(f"         {len(jobs)} content jobs queued.")

        # STEP 4 — Render 9 Visual Assets (1080x1080 PNG)
        print(f"  [4/6] Rendering 9 visual assets (1080x1080 PNG)...")
        rendered = self.template_engine.render_batch_assets(batch_id)
        print(f"         {len(rendered)} visual assets rendered.")

        # STEP 5 — Generate Product Video (Ken Burns MP4)
        print(f"  [5/6] Generating product promo video (MP4)...")
        video_res = self.video_worker.generate_product_video(batch_id)
        print(f"         Video: {video_res['duration_sec']:.1f}s | {video_res['total_frames']} frames")

        # STEP 6 — Quality Control (3-Rule Verification + Retry)
        print(f"  [6/6] Running QC verification on all 10 assets...")
        qc_results = self.qc_engine.run_qc_for_batch(batch_id)
        approved = sum(1 for r in qc_results if r["status"] == "APPROVED")
        rejected = sum(1 for r in qc_results if r["status"] in ("REJECTED", "FAILED"))

        # Isolated retry for any failed jobs
        for r in qc_results:
            if r["status"] in ("REJECTED", "FAILED"):
                print(f"         [RETRY] Retrying failed job [{r['content_type_code']}]...")
                retry = self.qc_engine.retry_failed_job(
                    r["job_id"],
                    render_fn=self.template_engine.render_content_asset,
                    drive_fn=None
                )
                if retry["status"] == "APPROVED":
                    approved += 1
                    rejected -= 1

        print(f"         QC: {approved} APPROVED | {rejected} FAILED")

        # STEP 7 — Google Drive Export
        print(f"  [7/6] Uploading to Google Drive...")
        export = self.gdrive_worker.process_batch_drive_export(batch_id)
        print(f"         Uploaded: {len(export['uploaded_files'])} files")
        print(f"         Folder: {export['folder_tree']}")

        return {
            "batch_id": batch_id,
            "brand": brand_name,
            "variant": variant_name,
            "factual_status": factual_result["status"],
            "assets_rendered": len(rendered),
            "video_duration_sec": video_res["duration_sec"],
            "qc_approved": approved,
            "qc_failed": rejected,
            "drive_files": len(export["uploaded_files"]),
            "drive_folder": export["folder_tree"]
        }

    def run_multi_variant_batch(
        self,
        brand_name: str,
        variants: List[Dict],
        design_system: dict = None,
        logo_url: str = None
    ) -> List[Dict]:
        """
        Runs the full pipeline across all variants of a brand in one batch session.
        Each variant gets its own batch_id for isolated status tracking.
        """
        master_batch_id = f"master_{uuid.uuid4().hex[:6]}"
        print("=" * 55)
        print(f"  PRODUCT CONTENT ENGINE — BATCH START")
        print(f"  Brand: {brand_name.upper()} | Variants: {len(variants)}")
        print(f"  Master Batch ID: {master_batch_id}")
        print("=" * 55)

        results = []
        for v in variants:
            variant_batch_id = f"{master_batch_id}_{v['name'].lower().replace(' ', '_')}"
            result = self.run_single_variant(
                brand_name=brand_name,
                variant_name=v["name"],
                image_path=v["image_path"],
                batch_id=variant_batch_id,
                design_system=design_system,
                logo_url=logo_url,
                legal_doc_paths=v.get("legal_doc_paths")
            )
            results.append(result)

        print("\n" + "=" * 55)
        print("  BATCH COMPLETE — SUMMARY")
        print("=" * 55)
        total_assets = sum(r["assets_rendered"] for r in results)
        total_videos = len(results)
        total_approved = sum(r["qc_approved"] for r in results)
        total_files = sum(r["drive_files"] for r in results)

        for r in results:
            status_mark = "OK" if r["qc_failed"] == 0 else "PARTIAL"
            print(f"  [{status_mark}] {r['variant']:20s} | Assets: {r['assets_rendered']} | Video: {r['video_duration_sec']:.1f}s | QC: {r['qc_approved']}/10 APPROVED | Drive: {r['drive_files']} files")

        print(f"\n  TOTAL: {total_assets} visual assets + {total_videos} videos")
        print(f"  ALL APPROVED: {total_approved} / {len(results) * 10}")
        print(f"  GOOGLE DRIVE FILES UPLOADED: {total_files}")
        print("=" * 55)

        return results


if __name__ == "__main__":
    pipeline = ProductContentPipeline()
    print("ProductContentPipeline ready. Use pipeline.run_multi_variant_batch() to start.")
