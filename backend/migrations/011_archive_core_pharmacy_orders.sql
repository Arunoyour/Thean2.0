CREATE SCHEMA IF NOT EXISTS "T";
SET search_path TO "T", public;

ALTER TABLE IF EXISTS pharmacy_orders
    RENAME TO legacy_pharmacy_orders;

ALTER INDEX IF EXISTS idx_pharmacy_orders_user_created
    RENAME TO idx_legacy_pharmacy_orders_user_created;

ALTER INDEX IF EXISTS idx_pharmacy_orders_store_status_created
    RENAME TO idx_legacy_pharmacy_orders_store_status_created;

ALTER INDEX IF EXISTS idx_pharmacy_orders_user_status_created
    RENAME TO idx_legacy_pharmacy_orders_user_status_created;

COMMENT ON TABLE legacy_pharmacy_orders IS
    'Legacy core table. Customer pharmacy orders are now stored in thean_pharmacy.customer_pharmacy_orders.';
