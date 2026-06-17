-- Migration 037: Extended registration fields for haircut vendor onboarding.
-- Adds owner address + document URLs to vendor accounts; adds pin_code + shop_image to shops.

ALTER TABLE "HC".haircut_vendor_accounts
    ADD COLUMN IF NOT EXISTS owner_address TEXT,
    ADD COLUMN IF NOT EXISTS licence_url   TEXT,
    ADD COLUMN IF NOT EXISTS owner_id_url  TEXT;

ALTER TABLE "HC".barber_shops
    ADD COLUMN IF NOT EXISTS pin_code     VARCHAR(10),
    ADD COLUMN IF NOT EXISTS shop_image_url TEXT;
