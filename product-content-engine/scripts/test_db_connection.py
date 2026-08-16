"""
Test Script: Verification of Database Schema & System Infrastructure (Phase 1 Test)
"""
import os
import sys
import json
import sqlite3

def test_sqlite_fallback():
    print("[TEST] Running local DB schema verification via SQLite engine...")
    db_path = os.path.join(os.path.dirname(__file__), "..", "temp", "test_product_content.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. Brands Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS brands (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        logo_url TEXT,
        design_system TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    # 2. Product Variants Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_variants (
        id TEXT PRIMARY KEY,
        brand_id TEXT NOT NULL,
        variant_name TEXT NOT NULL,
        raw_image_urls TEXT NOT NULL,
        legal_document_urls TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE,
        UNIQUE(brand_id, variant_name)
    );
    """)

    # 3. Product Factual Data Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_factual_data (
        id TEXT PRIMARY KEY,
        variant_id TEXT UNIQUE NOT NULL,
        ingredients TEXT,
        net_weight TEXT,
        volume TEXT,
        legalities TEXT NOT NULL,
        verified_claims TEXT,
        verified_benefits TEXT,
        status TEXT DEFAULT 'RAW_EXTRACTED',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );
    """)

    # Test Sample Data Insertion
    brand_id = "b1001-cod"
    brand_name = "COD"
    design_system = json.dumps({
        "primary_color": "#1F2937",
        "secondary_color": "#F3F4F6",
        "accent_color": "#10B981",
        "font_family": "Inter",
        "visual_style": "Modern Minimalist"
    })
    
    cursor.execute("INSERT OR REPLACE INTO brands (id, name, design_system) VALUES (?, ?, ?)",
                   (brand_id, brand_name, design_system))
    
    variant_id = "v2001-lemon-sereh"
    variant_name = "Lemon Sereh"
    cursor.execute("INSERT OR REPLACE INTO product_variants (id, brand_id, variant_name, raw_image_urls) VALUES (?, ?, ?, ?)",
                   (variant_id, brand_id, variant_name, json.dumps(["http://example.com/lemon_sereh.jpg"])))
    
    legalities = json.dumps({
        "nib": "1234567890123",
        "spirt": "2093171010123-26",
        "halal": "ID31110000123450121",
        "other_certifications": []
    })
    cursor.execute("INSERT OR REPLACE INTO product_factual_data (id, variant_id, net_weight, legalities) VALUES (?, ?, ?, ?)",
                   ("f3001", variant_id, "250 ml", legalities))

    conn.commit()
    
    # Query verification
    cursor.execute("SELECT b.name, v.variant_name, f.net_weight, f.legalities FROM brands b JOIN product_variants v ON b.id = v.brand_id JOIN product_factual_data f ON v.id = f.variant_id WHERE b.id = ?", (brand_id,))
    row = cursor.fetchone()
    
    conn.close()
    
    if row:
        print(" SUCCESS: Database Schema & Relational Structure Verified!")
        print(f"   Brand: {row[0]}")
        print(f"   Variant: {row[1]}")
        print(f"   Net Weight: {row[2]}")
        print(f"   Legalities JSON: {row[3]}")
        return True
    else:
        print(" FAILED: Database Verification Failed!")
        return False

if __name__ == "__main__":
    success = test_sqlite_fallback()
    if not success:
        sys.exit(1)
