CREATE SCHEMA IF NOT EXISTS "PH";
SET search_path TO "PH", public;

ALTER TABLE customer_pharmacy_orders
    ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pharmacy_action_deadline_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejected_account_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_customer_pharmacy_orders_assignment_deadline
    ON customer_pharmacy_orders (status, pharmacy_action_deadline_at);
