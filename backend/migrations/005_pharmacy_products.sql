BEGIN;

CREATE SCHEMA IF NOT EXISTS "PH";
SET search_path TO "PH", public;

CREATE TABLE IF NOT EXISTS pharmacy_products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES pharmacy_accounts(account_id) ON DELETE CASCADE,
    product_name VARCHAR(150) NOT NULL,
    brand VARCHAR(100),
    category VARCHAR(80),
    unit_label VARCHAR(60),
    price NUMERIC(12, 2) NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_products_account_available
    ON pharmacy_products (account_id, is_available);
CREATE INDEX IF NOT EXISTS idx_pharmacy_products_name
    ON pharmacy_products (product_name);
CREATE INDEX IF NOT EXISTS idx_pharmacy_products_category
    ON pharmacy_products (category);

COMMIT;
