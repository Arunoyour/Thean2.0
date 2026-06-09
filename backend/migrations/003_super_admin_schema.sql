BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS "T";
SET search_path TO "T", public;

CREATE TABLE IF NOT EXISTS super_admins (
    admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_super_admins_phone_active
    ON super_admins (phone_number, is_active);

CREATE TABLE IF NOT EXISTS super_admin_otp_challenges (
    challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) NOT NULL,
    otp_hash VARCHAR(128) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_super_admin_otp_phone_created
    ON super_admin_otp_challenges (phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_super_admin_otp_expires
    ON super_admin_otp_challenges (expires_at);

INSERT INTO super_admins (full_name, email, phone_number)
VALUES ('Arun', 'arunoyour@gmail.com', '+919539536943')
ON CONFLICT (phone_number) DO UPDATE
SET full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    is_active = true;

COMMIT;
