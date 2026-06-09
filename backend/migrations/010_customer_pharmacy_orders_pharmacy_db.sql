CREATE SCHEMA IF NOT EXISTS "PH";
SET search_path TO "PH", public;

CREATE TABLE IF NOT EXISTS customer_pharmacy_orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    account_id UUID REFERENCES pharmacy_accounts(account_id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_CUSTOMER_APPROVAL',
    estimated_amount NUMERIC(12, 2),
    final_amount NUMERIC(12, 2),
    doctor_name VARCHAR(150),
    patient_name VARCHAR(150),
    pharmacy_name VARCHAR(150),
    pharmacy_city VARCHAR(80),
    pharmacy_pincode VARCHAR(12),
    order_items JSONB,
    order_notes JSONB,
    prescription_path VARCHAR(500),
    voice_note_path VARCHAR(500),
    requires_manual_review BOOLEAN NOT NULL DEFAULT false,
    customer_action_comment VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_pharmacy_orders_user_created
    ON customer_pharmacy_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_pharmacy_orders_user_status_created
    ON customer_pharmacy_orders (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_pharmacy_orders_account_status_created
    ON customer_pharmacy_orders (account_id, status, created_at DESC);
