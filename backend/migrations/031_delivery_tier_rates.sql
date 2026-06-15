-- Migration 031: Per-delivery-boy dynamic rates
-- Adds tier classification and custom rate override to delivery accounts.
-- Rate resolution order: custom_rate_per_km > tier rate > global DeliveryRateConfig

-- Tier rates reference table
CREATE TABLE IF NOT EXISTS delivery_tier_rates (
    tier            VARCHAR(20)   PRIMARY KEY,
    rate_per_km     NUMERIC(6,2)  NOT NULL,
    updated_by      VARCHAR(100)  NOT NULL DEFAULT 'system',
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed default tiers (can be overridden by admin later)
INSERT INTO delivery_tier_rates (tier, rate_per_km, updated_by) VALUES
    ('JUNIOR',   6.00, 'system'),
    ('STANDARD', 7.00, 'system'),
    ('SENIOR',   8.50, 'system'),
    ('EXPERT',  10.00, 'system')
ON CONFLICT (tier) DO NOTHING;

-- Add tier and custom rate override to delivery accounts
ALTER TABLE delivery_accounts
    ADD COLUMN IF NOT EXISTS tier               VARCHAR(20)  NOT NULL DEFAULT 'STANDARD',
    ADD COLUMN IF NOT EXISTS custom_rate_per_km NUMERIC(6,2) NULL;
