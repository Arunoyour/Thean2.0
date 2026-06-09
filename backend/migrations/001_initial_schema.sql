BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS "T";
SET search_path TO "T", public;

CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE,
    full_name VARCHAR(100),
    wallet_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
CREATE INDEX IF NOT EXISTS idx_users_phone_active ON users (phone_number, is_active);

CREATE TABLE IF NOT EXISTS user_addresses (
    address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address_line_1 TEXT NOT NULL,
    apartment_floor_gate VARCHAR(100),
    landmark TEXT NOT NULL,
    city VARCHAR(80),
    state VARCHAR(80),
    pincode VARCHAR(12) NOT NULL,
    secondary_phone_number VARCHAR(15),
    location_capture_method VARCHAR(20) NOT NULL DEFAULT 'CURRENT_LOCATION',
    is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_lat_lng ON user_addresses (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_user_addresses_pincode ON user_addresses (pincode);

CREATE TABLE IF NOT EXISTS otp_challenges (
    challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) NOT NULL,
    otp_hash VARCHAR(128) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_phone_created
    ON otp_challenges (phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_expires ON otp_challenges (expires_at);

CREATE TABLE IF NOT EXISTS pharmacy_stores (
    store_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_name VARCHAR(150) NOT NULL,
    license_number VARCHAR(50) UNIQUE NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    is_online BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_stores_online ON pharmacy_stores (is_online);
CREATE INDEX IF NOT EXISTS idx_pharmacy_stores_location ON pharmacy_stores (latitude, longitude);

CREATE TABLE IF NOT EXISTS pharmacy_orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    store_id UUID REFERENCES pharmacy_stores(store_id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'NEW',
    estimated_amount NUMERIC(12, 2),
    final_amount NUMERIC(12, 2),
    has_generic_substitution_permission BOOLEAN NOT NULL DEFAULT true,
    requires_manual_review BOOLEAN NOT NULL DEFAULT false,
    prescription_path VARCHAR(500),
    voice_note_path VARCHAR(500),
    handover_pin VARCHAR(6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_orders_user_created
    ON pharmacy_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_orders_store_status_created
    ON pharmacy_orders (store_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS vegetable_stores (
    store_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_name VARCHAR(150) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    is_online BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_vegetable_stores_online ON vegetable_stores (is_online);
CREATE INDEX IF NOT EXISTS idx_vegetable_stores_location ON vegetable_stores (latitude, longitude);

CREATE TABLE IF NOT EXISTS print_shops (
    shop_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_name VARCHAR(150) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    is_online BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_print_shops_online ON print_shops (is_online);
CREATE INDEX IF NOT EXISTS idx_print_shops_location ON print_shops (latitude, longitude);

COMMIT;
