BEGIN;

CREATE SCHEMA IF NOT EXISTS "PH";
SET search_path TO "PH", public;

CREATE TABLE IF NOT EXISTS pharmacy_status_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES pharmacy_accounts(account_id) ON DELETE CASCADE,
    changed_by_admin_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_status_events_account_created
    ON pharmacy_status_events (account_id, created_at DESC);

COMMIT;
