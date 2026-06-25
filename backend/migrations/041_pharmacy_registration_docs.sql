-- Migration 041: Add document upload fields to pharmacy_profiles
-- Matches the haircut vendor registration pattern (store photo, drug licence, owner ID)

SET search_path TO "PH", public;

ALTER TABLE pharmacy_profiles
    ADD COLUMN IF NOT EXISTS store_image_url  TEXT,
    ADD COLUMN IF NOT EXISTS drug_licence_url TEXT,
    ADD COLUMN IF NOT EXISTS owner_id_url     TEXT;
