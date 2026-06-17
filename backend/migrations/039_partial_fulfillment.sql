-- Migration 039: Add partial fulfillment columns to customer_pharmacy_orders
CREATE SCHEMA IF NOT EXISTS "PH";
SET search_path TO "PH", public;

ALTER TABLE customer_pharmacy_orders
    ADD COLUMN IF NOT EXISTS partial_fulfillment_allowed BOOLEAN,
    ADD COLUMN IF NOT EXISTS partial_fulfillment_decided_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS split_from_order_id UUID REFERENCES customer_pharmacy_orders(order_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_pharmacy_orders_partial_fulfillment
    ON customer_pharmacy_orders (partial_fulfillment_allowed, partial_fulfillment_decided_at)
    WHERE partial_fulfillment_decided_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_pharmacy_orders_split_from
    ON customer_pharmacy_orders (split_from_order_id)
    WHERE split_from_order_id IS NOT NULL;
