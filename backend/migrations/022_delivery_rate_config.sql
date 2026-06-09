-- Migration 022: Delivery rate configuration & change log
-- Database : thean_delivery  (schema D)

-- ── Rate config table ─────────────────────────────────────────────────
-- Each row is an immutable change-log entry.
-- The CURRENT effective rate is always the latest row by effective_at.
CREATE TABLE IF NOT EXISTS "D".delivery_rate_config (
    config_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_per_km  NUMERIC(6,2) NOT NULL CHECK (rate_per_km > 0),
    changed_by   VARCHAR(100) NOT NULL,
    reason       TEXT         NOT NULL,
    effective_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dl_rate_config_time
    ON "D".delivery_rate_config(effective_at DESC);

-- Seed with the original default so history starts from day 1
INSERT INTO "D".delivery_rate_config (rate_per_km, changed_by, reason)
VALUES (7.00, 'system', 'Initial default rate — ₹7.00 per km')
ON CONFLICT DO NOTHING;
