-- DATABASE INITIALIZATION SCRIPT FOR MITRAKU AI PLATFORM
-- PostgreSQL 16 Compatible

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. UMKM Brands Table
CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    logo_url TEXT,
    design_system JSONB NOT NULL DEFAULT '{
        "primary_color": "#10B981",
        "secondary_color": "#3B82F6",
        "accent_color": "#8B5CF6",
        "font_family": "Plus Jakarta Sans, sans-serif",
        "visual_style": "Modern Minimalist"
    }'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Store Catalog Products (Toko Pintar Modul 1)
CREATE TABLE IF NOT EXISTS store_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT 'Umum',
    price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    stock INT NOT NULL DEFAULT 0,
    description TEXT DEFAULT NULL,
    shipping_info TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Copywriting History (Copywriting Factory Modul 4)
CREATE TABLE IF NOT EXISTS copywriting_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    result_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Brand Kits (Brand Kit Builder Modul 3)
CREATE TABLE IF NOT EXISTS brand_kits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    brand_name VARCHAR(255) NOT NULL,
    personality VARCHAR(100) NOT NULL,
    brand_kit_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_store_catalog_brand ON store_catalog(brand_id);
CREATE INDEX IF NOT EXISTS idx_copywriting_brand ON copywriting_history(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_kits_brand ON brand_kits(brand_id);
