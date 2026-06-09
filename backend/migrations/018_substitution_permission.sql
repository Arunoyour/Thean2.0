-- Migration 018: Add substitution permission columns to customer_pharmacy_orders
CREATE SCHEMA IF NOT EXISTS "PH";
SET search_path TO "PH", public;

ALTER TABLE customer_pharmacy_orders
    ADD COLUMN IF NOT EXISTS substitution_allowed BOOLEAN,
    ADD COLUMN IF NOT EXISTS substitution_decided_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customer_pharmacy_orders_substitution
    ON customer_pharmacy_orders (substitution_allowed, substitution_decided_at)
    WHERE substitution_decided_at IS NOT NULL;
