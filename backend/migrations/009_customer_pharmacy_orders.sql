CREATE SCHEMA IF NOT EXISTS "T";
SET search_path TO "T", public;

ALTER TABLE pharmacy_orders
    ADD COLUMN IF NOT EXISTS doctor_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS patient_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS pharmacy_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS pharmacy_city VARCHAR(80),
    ADD COLUMN IF NOT EXISTS pharmacy_pincode VARCHAR(12),
    ADD COLUMN IF NOT EXISTS order_items JSONB,
    ADD COLUMN IF NOT EXISTS order_notes JSONB,
    ADD COLUMN IF NOT EXISTS customer_action_comment VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_pharmacy_orders_user_status_created
    ON pharmacy_orders (user_id, status, created_at DESC);
