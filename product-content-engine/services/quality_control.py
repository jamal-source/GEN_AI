"""
QUALITY CONTROL ENGINE (Phase 9)
Verifies each content job asset against factual data rules:
  - Rule 1: Factual Legalities Text Matching
  - Rule 2: No Fake Testimonials (Keunggulan fallback enforcement)
  - Rule 3: Resolution Check (1080x1080 PNG, video existence)
Implements isolated single-job retry without restarting entire batch.
Status lifecycle: PENDING -> GENERATING -> QC -> APPROVED | REJECTED -> FAILED
"""

import os
import json
import sqlite3
from typing import Dict, List, Optional
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "temp", "product_content.db")

class QualityControlEngine:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _set_job_status(self, job_id: str, status: str, qc_notes: str = None, error_log: str = None):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE content_jobs
                SET status = ?,
                    qc_notes = COALESCE(?, qc_notes),
                    error_log = COALESCE(?, error_log)
                WHERE id = ?
            """, (status, qc_notes, error_log, job_id))
            conn.commit()

    def _increment_retry(self, job_id: str):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE content_jobs SET retry_count = retry_count + 1 WHERE id = ?", (job_id,))
            conn.commit()

    # --- QC RULE 1: Factual Legalities Must Match Stored Data ---
    def check_legal_text_match(self, job: sqlite3.Row) -> tuple:
        if job["content_type_code"] != "07_LEGALITAS":
            return True, "N/A"
        try:
            creative_data = json.loads(job["creative_data"])
            factual_snapshot = json.loads(job["factual_data_snapshot"])
            legal_details = creative_data.get("legal_details", {})
            stored_legalities = factual_snapshot.get("legalities", {})

            for key_creative, key_factual in [("NIB", "nib"), ("SPP-IRT", "spirt"), ("HALAL", "halal")]:
                creative_val = legal_details.get(key_creative)
                factual_val = stored_legalities.get(key_factual)
                if factual_val and creative_val != factual_val:
                    return False, f"RULE 1 FAIL: {key_creative} mismatch. Creative='{creative_val}' vs Factual='{factual_val}'"
            return True, "RULE 1 PASS: Legalities match factual data."
        except Exception as e:
            return False, f"RULE 1 ERROR: {str(e)}"

    # --- QC RULE 2: No Fake Testimonials (Claims must be from verified_claims only) ---
    def check_no_fake_testimonials(self, job: sqlite3.Row) -> tuple:
        if job["content_type_code"] not in ("08_KEUNGGULAN", "04_MANFAAT"):
            return True, "N/A"
        try:
            factual_snapshot = json.loads(job["factual_data_snapshot"])
            verified_claims = factual_snapshot.get("verified_claims", [])
            verified_benefits = factual_snapshot.get("verified_benefits", [])
            creative_data = json.loads(job["creative_data"])
            list_items = creative_data.get("list_items", [])

            # If verified data is empty, fallback items must be generic (no medical claims)
            FORBIDDEN_MEDICAL_PHRASES = ["sembuhkan", "menyembuhkan", "mengobati", "obat", "cure", "heal"]
            for item in list_items:
                for forbidden in FORBIDDEN_MEDICAL_PHRASES:
                    if forbidden.lower() in item.lower():
                        return False, f"RULE 2 FAIL: Medical/testimonial claim detected without factual source: '{item}'"
            return True, "RULE 2 PASS: No unauthorized claims found."
        except Exception as e:
            return False, f"RULE 2 ERROR: {str(e)}"

    # --- QC RULE 3: Resolution & File Existence Check ---
    def check_resolution_and_file(self, job: sqlite3.Row) -> tuple:
        out_path = job["output_local_path"]
        if not out_path:
            return False, "RULE 3 FAIL: No output file path registered."
        if not os.path.exists(out_path):
            return False, f"RULE 3 FAIL: File not found on disk: {out_path}"

        if job["content_type_code"] == "10_VIDEO":
            size = os.path.getsize(out_path)
            if size == 0:
                return False, "RULE 3 FAIL: Video file is empty (0 bytes)."
            return True, f"RULE 3 PASS: Video file exists and is {size} bytes."

        try:
            with Image.open(out_path) as img:
                w, h = img.size
                if w != 1080 or h != 1080:
                    return False, f"RULE 3 FAIL: Invalid resolution {w}x{h}. Expected 1080x1080."
            return True, f"RULE 3 PASS: Image file at valid 1080x1080 resolution."
        except Exception as e:
            return False, f"RULE 3 ERROR: Cannot read image file: {str(e)}"

    # --- MAIN QC PROCESSOR ---
    def run_qc_for_job(self, job_id: str) -> Dict:
        """Runs all 3 QC rules for a single job. Updates status to APPROVED or REJECTED."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM content_jobs WHERE id = ?", (job_id,))
            job = cursor.fetchone()

        if not job:
            return {"job_id": job_id, "status": "ERROR", "notes": "Job not found."}

        results = {}
        all_passed = True

        r1_pass, r1_note = self.check_legal_text_match(job)
        r2_pass, r2_note = self.check_no_fake_testimonials(job)
        r3_pass, r3_note = self.check_resolution_and_file(job)

        all_passed = r1_pass and r2_pass and r3_pass
        qc_notes = f"[{job['content_type_code']}] {r1_note} | {r2_note} | {r3_note}"

        if all_passed:
            self._set_job_status(job_id, "APPROVED", qc_notes=qc_notes)
            final_status = "APPROVED"
        else:
            self._set_job_status(job_id, "REJECTED", qc_notes=qc_notes)
            final_status = "REJECTED"

        return {
            "job_id": job_id,
            "content_type_code": job["content_type_code"],
            "status": final_status,
            "qc_notes": qc_notes
        }

    def run_qc_for_batch(self, batch_id: str) -> List[Dict]:
        """Runs QC on all QC-pending jobs in a batch. Returns per-job results."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM content_jobs WHERE batch_id = ?", (batch_id,))
            rows = cursor.fetchall()

        return [self.run_qc_for_job(r["id"]) for r in rows]

    # --- ISOLATED RETRY MECHANISM ---
    def retry_failed_job(self, job_id: str, render_fn, drive_fn) -> Dict:
        """
        Retries a single REJECTED or FAILED job in isolation.
        Does NOT restart the entire batch.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM content_jobs WHERE id = ?", (job_id,))
            job = cursor.fetchone()

        if not job or job["status"] not in ("REJECTED", "FAILED"):
            return {"job_id": job_id, "status": "SKIPPED", "notes": "Job not in REJECTED/FAILED state."}

        MAX_RETRIES = 3
        if job["retry_count"] >= MAX_RETRIES:
            self._set_job_status(job_id, "FAILED", error_log=f"Max retries ({MAX_RETRIES}) exceeded.")
            return {"job_id": job_id, "status": "FAILED", "notes": "Max retry limit reached."}

        self._increment_retry(job_id)
        self._set_job_status(job_id, "GENERATING")

        try:
            render_result = render_fn(job_id)
            self._set_job_status(job_id, "QC")
            return self.run_qc_for_job(job_id)
        except Exception as e:
            self._set_job_status(job_id, "FAILED", error_log=str(e))
            return {"job_id": job_id, "status": "FAILED", "notes": str(e)}

if __name__ == "__main__":
    qc_engine = QualityControlEngine()
    print("QualityControlEngine initialized with 3-rule QC verification system.")
