-- Migration 023: Add price_breakdown JSONB to customer_pharmacy_orders
-- Database : thean_pharmacy  (schema PH)

ALTER TABLE "PH".customer_pharmacy_orders
    ADD COLUMN IF NOT EXISTS price_breakdown JSONB;

COMMENT ON COLUMN "PH".customer_pharmacy_orders.price_breakdown IS
    'Itemised breakdown submitted by pharmacy: {medicine_cost, delivery_charge, platform_fee, notes}. estimated_amount = sum of these three.';
