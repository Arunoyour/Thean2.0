-- Migration 036: Switch haircut vendor auth from password to mobile OTP.
-- Drops password_hash, adds otp_code + otp_expires_at on haircut_vendor_accounts.

ALTER TABLE "HC".haircut_vendor_accounts
    DROP COLUMN IF EXISTS password_hash,
    ADD COLUMN IF NOT EXISTS otp_code       VARCHAR(6),
    ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;
