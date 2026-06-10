-- Migration 025: Delivery account roles (DELIVERY_BOY / TEAM_LEAD)
-- Database : thean_delivery
-- Schema   : D

BEGIN;

SET search_path TO "D", public;

ALTER TABLE delivery_accounts
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'DELIVERY_BOY'
    CHECK (role IN ('DELIVERY_BOY', 'TEAM_LEAD'));

CREATE INDEX IF NOT EXISTS idx_dl_accounts_role
    ON delivery_accounts (role);

COMMIT;
