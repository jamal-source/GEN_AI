import sqlite3
import json

db_path = r"c:\Users\ACER\Desktop\GEN_AI\product-content-engine\temp\product_content.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Get recent batches
print("=== RECENT BATCHES ===")
cursor.execute("SELECT DISTINCT batch_id FROM content_jobs ORDER BY id DESC LIMIT 5")
batches = [row["batch_id"] for row in cursor.fetchall()]
print("Recent batch IDs:", batches)

for b in batches:
    print(f"\nBatch ID: {b}")
    cursor.execute("SELECT id, variant_id, content_type_code, status, output_local_path, gdrive_file_id, gdrive_web_link FROM content_jobs WHERE batch_id = ?", (b,))
    jobs = cursor.fetchall()
    print(f"Total jobs: {len(jobs)}")
    for j in jobs:
        print(f"  Job {j['id']} | Code: {j['content_type_code']} | Status: {j['status']} | Local: {j['output_local_path']} | GDrive ID: {j['gdrive_file_id']}")

conn.close()
