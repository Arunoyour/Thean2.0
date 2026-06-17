-- Migration 035: Add shop_status to barber_shops for admin activation flow.
-- New shops start as 'pending'. Admin must activate before they appear on the customer app.

ALTER TABLE "HC".barber_shops
    ADD COLUMN IF NOT EXISTS shop_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (shop_status IN ('pending', 'active', 'suspended'));

-- Existing shops (if any) stay as-is; admin will activate them individually.
CREATE INDEX IF NOT EXISTS idx_barber_shops_status ON "HC".barber_shops (shop_status);
