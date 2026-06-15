-- Migration 030: Extend disputes table for order-level dispute management
-- Adds order linkage, sector tagging, and per-party unread tracking.

-- 1. Add new columns to disputes
ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS source_order_id   UUID,
  ADD COLUMN IF NOT EXISTS tagged_sectors    TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS unread_by_raiser  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unread_by_admin   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS closed_by_raiser  BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Extend the dispute_type CHECK constraint to include order-dispute types.
--    PostgreSQL doesn't support ALTER on named CHECK constraints directly,
--    so we drop and recreate.
ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_dispute_type_check;
ALTER TABLE disputes ADD CONSTRAINT disputes_dispute_type_check
  CHECK (dispute_type IN (
    'WRONG_CHARGE', 'REFUND_NOT_RECEIVED', 'SETTLEMENT_DISPUTE', 'COD_DISPUTE',
    'ORDER_DISPUTE', 'OTHER'
  ));

-- 3. Remove REJECTED from status check — it was never in the original migration,
--    some frontend files referenced it. Keep clean set.
ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_status_check;
ALTER TABLE disputes ADD CONSTRAINT disputes_status_check
  CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REOPENED', 'CLOSED'));

-- 4. Index for order lookups
CREATE INDEX IF NOT EXISTS idx_disputes_source_order
  ON disputes (source_order_id)
  WHERE source_order_id IS NOT NULL;

-- 5. Index for unread admin panel
CREATE INDEX IF NOT EXISTS idx_disputes_unread_admin
  ON disputes (unread_by_admin, status, created_at DESC)
  WHERE status IN ('OPEN', 'IN_REVIEW', 'REOPENED');
