-- Migration 041: Add missing stats columns to delivery_accounts
-- These columns exist in the SQLAlchemy model but were never migrated.
SET search_path TO "D";

ALTER TABLE "D".delivery_accounts
    ADD COLUMN IF NOT EXISTS total_assigned  INT          NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_accepted  INT          NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_cancelled INT          NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS avg_rating      NUMERIC(3,2) NOT NULL DEFAULT 5.00,
    ADD COLUMN IF NOT EXISTS rating_count    INT          NOT NULL DEFAULT 0;
