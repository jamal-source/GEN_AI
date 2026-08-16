import sqlite3
import json

db_path = r"c:\Users\ACER\Desktop\GEN_AI\product-content-engine\temp\product_content.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("""
    SELECT j.*, v.variant_name, b.name as brand_name
    FROM content_jobs j
    JOIN product_variants v ON j.variant_id = v.id
    JOIN brands b ON v.brand_id = b.id
    WHERE j.batch_id = 'batch_63e7de6e'
""")
jobs = cursor.fetchall()
print(f"Total jobs for batch_63e7de6e: {len(jobs)}")
for j in jobs:
    print(f"Job ID: {j['id']} | Brand: {j['brand_name']} | Variant: {j['variant_name']} | Code: {j['content_type_code']} | Local Path: {j['output_local_path']}")

conn.close()
