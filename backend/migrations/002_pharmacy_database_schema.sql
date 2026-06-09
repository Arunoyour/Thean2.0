BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS "PH";
SET search_path TO "PH", public;

CREATE TABLE IF NOT EXISTS pharmacy_accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_name VARCHAR(120) NOT NULL,
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(120) UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_accounts_phone_active
    ON pharmacy_accounts (phone_number, is_active);
CREATE INDEX IF NOT EXISTS idx_pharmacy_accounts_created_at
    ON pharmacy_accounts (created_at DESC);

CREATE TABLE IF NOT EXISTS pharmacy_profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL UNIQUE REFERENCES pharmacy_accounts(account_id) ON DELETE CASCADE,
    store_name VARCHAR(150) NOT NULL,
    license_number VARCHAR(80) UNIQUE NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address_line_1 TEXT NOT NULL,
    city VARCHAR(80),
    state VARCHAR(80),
    pincode VARCHAR(12),
    is_listed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_profiles_license ON pharmacy_profiles (license_number);
CREATE INDEX IF NOT EXISTS idx_pharmacy_profiles_listed ON pharmacy_profiles (is_listed);
CREATE INDEX IF NOT EXISTS idx_pharmacy_profiles_location
    ON pharmacy_profiles (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE TABLE IF NOT EXISTS pharmacy_otp_challenges (
    challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) NOT NULL,
    otp_hash VARCHAR(128) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_otp_phone_created
    ON pharmacy_otp_challenges (phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_otp_expires ON pharmacy_otp_challenges (expires_at);

COMMIT;
