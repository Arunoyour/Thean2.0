-- Migration 032: DB-level unique constraints on delivery_accounts
-- Application-level checks exist but these enforce integrity at the DB layer.
-- NULL values are excluded from uniqueness (NULLS NOT DISTINCT requires PG15+; use partial index for PG14 compat).

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_accounts_email
    ON delivery_accounts (email)
    WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_accounts_vehicle_number
    ON delivery_accounts (vehicle_number)
    WHERE vehicle_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_accounts_license_number
    ON delivery_accounts (license_number)
    WHERE license_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_accounts_id_number
    ON delivery_accounts (id_number)
    WHERE id_number IS NOT NULL;
