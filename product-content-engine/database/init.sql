-- DATABASE INITIALIZATION SCRIPT FOR PRODUCT CONTENT AUTOMATION ENGINE
-- PostgreSQL 16 Compatible

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Brands Table
CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    logo_url TEXT,
    design_system JSONB NOT NULL DEFAULT '{
        "primary_color": "#1F2937",
        "secondary_color": "#F3F4F6",
        "accent_color": "#10B981",
        "font_family": "Inter, sans-serif",
        "visual_style": "Modern Minimalist",
        "layout_style": "Clean Grid"
    }'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Product Variants Table
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    variant_name VARCHAR(255) NOT NULL,
    raw_image_urls TEXT[] NOT NULL DEFAULT '{}',
    legal_document_urls TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(brand_id, variant_name)
);

-- 3. Product Factual Data Table (STRICT FACTUAL DATA ONLY - NO HALLUCINATION)
CREATE TABLE IF NOT EXISTS product_factual_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID NOT NULL UNIQUE REFERENCES product_variants(id) ON DELETE CASCADE,
    ingredients TEXT[] DEFAULT NULL,
    net_weight VARCHAR(100) DEFAULT NULL,
    volume VARCHAR(100) DEFAULT NULL,
    expiry_date VARCHAR(100) DEFAULT NULL,
    manufacturer_name VARCHAR(255) DEFAULT NULL,
    manufacturer_address TEXT DEFAULT NULL,
    legalities JSONB NOT NULL DEFAULT '{
        "nib": null,
        "spirt": null,
        "halal": null,
        "other_certifications": []
    }'::jsonb,
    verified_claims TEXT[] DEFAULT '{}',
    verified_benefits TEXT[] DEFAULT '{}',
    serving_suggestion TEXT DEFAULT NULL,
    storage_instruction TEXT DEFAULT NULL,
    raw_ocr_payload JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'RAW_EXTRACTED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Content Jobs & Batch Table
CREATE TABLE IF NOT EXISTS content_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    content_type_code VARCHAR(50) NOT NULL,
    template_version VARCHAR(50) NOT NULL DEFAULT 'v1',
    prompt_version VARCHAR(50) NOT NULL DEFAULT 'v1',
    creative_data JSONB DEFAULT '{}'::jsonb,
    factual_data_snapshot JSONB NOT NULL,
    output_local_path TEXT DEFAULT NULL,
    gdrive_file_id VARCHAR(255) DEFAULT NULL,
    gdrive_web_link TEXT DEFAULT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    qc_notes TEXT DEFAULT NULL,
    error_log TEXT DEFAULT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_content_jobs_batch ON content_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_content_jobs_status ON content_jobs(status);
CREATE INDEX IF NOT EXISTS idx_content_jobs_variant ON content_jobs(variant_id);
