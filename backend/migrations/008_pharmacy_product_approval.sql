CREATE SCHEMA IF NOT EXISTS "PH";
SET search_path TO "PH", public;

ALTER TABLE pharmacy_products
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_by_admin_id UUID,
    ADD COLUMN IF NOT EXISTS revision_requested_at TIMESTAMPTZ;

ALTER TABLE pharmacy_products
    DROP CONSTRAINT IF EXISTS chk_pharmacy_product_approval_status;

ALTER TABLE pharmacy_products
    ADD CONSTRAINT chk_pharmacy_product_approval_status
        CHECK (approval_status IN ('PENDING_APPROVAL', 'NEEDS_REVISION', 'APPROVED', 'REJECTED'));

UPDATE pharmacy_products
SET approval_status = 'APPROVED',
    approved_at = COALESCE(approved_at, created_at)
WHERE approval_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_pharmacy_products_approval_status
    ON pharmacy_products (approval_status, created_at);

CREATE TABLE IF NOT EXISTS pharmacy_product_comments (
    comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES pharmacy_products(product_id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES pharmacy_accounts(account_id) ON DELETE CASCADE,
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('SUPER_ADMIN', 'PHARMACY')),
    actor_id UUID NOT NULL,
    action VARCHAR(40) NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_product_comments_product_created
    ON pharmacy_product_comments (product_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pharmacy_product_comments_account_created
    ON pharmacy_product_comments (account_id, created_at);

CREATE TABLE IF NOT EXISTS pharmacy_realtime_notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('SUPER_ADMIN', 'PHARMACY')),
    target_id UUID,
    event_type VARCHAR(60) NOT NULL,
    title VARCHAR(160) NOT NULL,
    message TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_notifications_target_created
    ON pharmacy_realtime_notifications (target_type, target_id, created_at);

CREATE TABLE IF NOT EXISTS pharmacy_order_revenue_settlement_ledger (
    ledger_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    order_item_id UUID,
    account_id UUID NOT NULL REFERENCES pharmacy_accounts(account_id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES pharmacy_products(product_id) ON DELETE RESTRICT,
    product_name_snapshot VARCHAR(150) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    gross_amount NUMERIC(12, 2) NOT NULL CHECK (gross_amount >= 0),
    product_commission_percent NUMERIC(5, 2) NOT NULL CHECK (
        product_commission_percent >= 0 AND product_commission_percent <= 100
    ),
    platform_commission_amount NUMERIC(12, 2) NOT NULL CHECK (platform_commission_amount >= 0),
    platform_fee_amount NUMERIC(12, 2) NOT NULL CHECK (platform_fee_amount >= 0),
    pharmacy_payable_amount NUMERIC(12, 2) NOT NULL CHECK (pharmacy_payable_amount >= 0),
    settlement_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_revenue_ledger_account_created
    ON pharmacy_order_revenue_settlement_ledger (account_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pharmacy_revenue_ledger_product_created
    ON pharmacy_order_revenue_settlement_ledger (product_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pharmacy_revenue_ledger_settlement_status
    ON pharmacy_order_revenue_settlement_ledger (settlement_status, created_at);
