-- Migration 042: Add EXIF metadata columns to pharmacy_profiles and barber_shops
-- Stores GPS coordinates and timestamp extracted from the vendor's store photo
-- Used by super admin review UI to flag photos taken far from the registered address

SET search_path TO "PH", public;

ALTER TABLE pharmacy_profiles
    ADD COLUMN IF NOT EXISTS photo_taken_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS photo_lat       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS photo_lng       DOUBLE PRECISION;

SET search_path TO "HC", public;

ALTER TABLE barber_shops
    ADD COLUMN IF NOT EXISTS photo_taken_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS photo_lat       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS photo_lng       DOUBLE PRECISION;
