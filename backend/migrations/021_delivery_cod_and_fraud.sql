-- Migration 021: COD tracking, payout thresholds, fraud-prevention uniqueness
-- Database : thean_delivery  (schema D)
-- Run against the DELIVERY database only.

-- ── Fraud-prevention columns on delivery_accounts ────────────────────────
-- license_number and id_number allow checking for duplicate documents.
ALTER TABLE "D".delivery_accounts
    ADD COLUMN IF NOT EXISTS license_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS id_number      VARCHAR(50),
    ADD COLUMN IF NOT EXISTS cod_balance    NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cod_blocked    BOOLEAN       NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cod_warned_at  TIMESTAMPTZ;   -- last time we sent a ₹1000 warning

-- Unique partial indexes (NULL values are excluded so optional fields stay optional)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dl_accounts_email_uniq
    ON "D".delivery_accounts(email)
    WHERE email IS NOT NULL AND email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dl_accounts_vehicle_uniq
    ON "D".delivery_accounts(vehicle_number)
    WHERE vehicle_number IS NOT NULL AND vehicle_number <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dl_accounts_license_uniq
    ON "D".delivery_accounts(license_number)
    WHERE license_number IS NOT NULL AND license_number <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dl_accounts_idnum_uniq
    ON "D".delivery_accounts(id_number)
    WHERE id_number IS NOT NULL AND id_number <> '';

-- ── COD amount on delivery order ──────────────────────────────────────────
-- Populated at assignment time so we know exactly what to collect.
ALTER TABLE "D".delivery_orders
    ADD COLUMN IF NOT EXISTS cod_amount NUMERIC(10,2);   -- 0 or NULL = prepaid

-- ── COD collections (one row per delivered order) ─────────────────────────
CREATE TABLE IF NOT EXISTS "D".delivery_cod_collections (
    collection_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id          UUID        NOT NULL REFERENCES "D".delivery_accounts(account_id),
    delivery_order_id   UUID        NOT NULL UNIQUE
                        REFERENCES "D".delivery_orders(delivery_order_id),
    amount              NUMERIC(10,2) NOT NULL,
    collected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dl_cod_col_account
    ON "D".delivery_cod_collections(account_id);

-- ── COD payouts to organisation ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "D".delivery_cod_payouts (
    payout_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  UUID        NOT NULL REFERENCES "D".delivery_accounts(account_id),
    amount      NUMERIC(10,2) NOT NULL,
    cleared_by  VARCHAR(100),   -- admin name / reference
    note        TEXT,
    payout_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dl_cod_payout_account
    ON "D".delivery_cod_payouts(account_id);
