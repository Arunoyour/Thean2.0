CREATE SCHEMA IF NOT EXISTS "PH";
SET search_path TO "PH", public;

ALTER TABLE pharmacy_profiles
    ADD COLUMN IF NOT EXISTS product_commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS prescription_commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE pharmacy_profiles
    DROP CONSTRAINT IF EXISTS chk_pharmacy_product_commission_percent;

ALTER TABLE pharmacy_profiles
    ADD CONSTRAINT chk_pharmacy_product_commission_percent
        CHECK (product_commission_percent >= 0 AND product_commission_percent <= 100);

ALTER TABLE pharmacy_profiles
    DROP CONSTRAINT IF EXISTS chk_pharmacy_prescription_commission_percent;

ALTER TABLE pharmacy_profiles
    ADD CONSTRAINT chk_pharmacy_prescription_commission_percent
        CHECK (prescription_commission_percent >= 0 AND prescription_commission_percent <= 100);

ALTER TABLE pharmacy_profiles
    DROP CONSTRAINT IF EXISTS chk_pharmacy_platform_fee;

ALTER TABLE pharmacy_profiles
    ADD CONSTRAINT chk_pharmacy_platform_fee
        CHECK (platform_fee >= 0);

ALTER TABLE pharmacy_products
    ADD COLUMN IF NOT EXISTS offer_price NUMERIC(10, 2);

ALTER TABLE pharmacy_products
    DROP CONSTRAINT IF EXISTS chk_pharmacy_product_offer_price;

ALTER TABLE pharmacy_products
    ADD CONSTRAINT chk_pharmacy_product_offer_price
        CHECK (offer_price IS NULL OR offer_price > 0);
