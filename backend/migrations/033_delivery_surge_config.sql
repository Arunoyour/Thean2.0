-- Migration 033: Delivery surge charge config
-- Singleton row (id always = 1). Admin toggles on/off, sets multiplier and label.
SET search_path TO "D";

CREATE TABLE IF NOT EXISTS "D".delivery_surge_config (
    id              INT PRIMARY KEY DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT FALSE,
    multiplier      NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
    label           VARCHAR(100) NOT NULL DEFAULT '',
    updated_by      VARCHAR(100) NOT NULL DEFAULT 'system',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT delivery_surge_singleton CHECK (id = 1)
);

INSERT INTO "D".delivery_surge_config (id, is_active, multiplier, label, updated_by)
VALUES (1, FALSE, 1.00, '', 'system')
ON CONFLICT (id) DO NOTHING;

-- Store the surge multiplier and label applied at the time of assignment for audit/settlement
ALTER TABLE "D".delivery_orders
    ADD COLUMN IF NOT EXISTS surge_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
    ADD COLUMN IF NOT EXISTS surge_label VARCHAR(100) NOT NULL DEFAULT '';
