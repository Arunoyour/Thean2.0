CREATE SCHEMA IF NOT EXISTS "PH";
SET search_path TO "PH", public;

ALTER TABLE pharmacy_products
    ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
