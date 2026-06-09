-- Migration 019: Add fulfillment workflow columns
CREATE SCHEMA IF NOT EXISTS "PH";
SET search_path TO "PH", public;

ALTER TABLE customer_pharmacy_orders
    ADD COLUMN IF NOT EXISTS customer_review_deadline_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS bill_items JSONB,
    ADD COLUMN IF NOT EXISTS pickup_code VARCHAR(8),
    ADD COLUMN IF NOT EXISTS pickup_code_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customer_pharmacy_orders_price_review
    ON customer_pharmacy_orders (status, customer_review_deadline_at)
    WHERE status = 'PENDING_PRICE_REVIEW';

CREATE INDEX IF NOT EXISTS idx_customer_pharmacy_orders_pickup_code
    ON customer_pharmacy_orders (pickup_code)
    WHERE pickup_code IS NOT NULL;
