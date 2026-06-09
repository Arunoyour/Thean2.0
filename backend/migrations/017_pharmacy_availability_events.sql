SET search_path TO "PH", public;

CREATE TABLE IF NOT EXISTS pharmacy_availability_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES pharmacy_accounts(account_id) ON DELETE CASCADE,
    actor_type VARCHAR(30) NOT NULL,
    actor_id UUID,
    is_online BOOLEAN NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_availability_events_account_created
ON pharmacy_availability_events (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pharmacy_availability_events_created
ON pharmacy_availability_events (created_at DESC);
