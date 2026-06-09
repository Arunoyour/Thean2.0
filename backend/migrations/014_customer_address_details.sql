CREATE SCHEMA IF NOT EXISTS "T";
SET search_path TO "T", public;

ALTER TABLE user_addresses
    ADD COLUMN IF NOT EXISTS city VARCHAR(80),
    ADD COLUMN IF NOT EXISTS state VARCHAR(80),
    ADD COLUMN IF NOT EXISTS pincode VARCHAR(12),
    ADD COLUMN IF NOT EXISTS secondary_phone_number VARCHAR(15),
    ADD COLUMN IF NOT EXISTS location_capture_method VARCHAR(20) NOT NULL DEFAULT 'CURRENT_LOCATION';

UPDATE user_addresses
SET landmark = COALESCE(NULLIF(TRIM(landmark), ''), 'Not captured'),
    pincode = COALESCE(NULLIF(TRIM(pincode), ''), '000000')
WHERE landmark IS NULL
    OR TRIM(landmark) = ''
    OR pincode IS NULL
    OR TRIM(pincode) = '';

ALTER TABLE user_addresses
    ALTER COLUMN landmark SET NOT NULL,
    ALTER COLUMN pincode SET NOT NULL;

ALTER TABLE user_addresses
    DROP CONSTRAINT IF EXISTS chk_user_addresses_location_capture_method;

ALTER TABLE user_addresses
    ADD CONSTRAINT chk_user_addresses_location_capture_method
        CHECK (location_capture_method IN ('CURRENT_LOCATION', 'MAP_PIN'));

ALTER TABLE user_addresses
    DROP CONSTRAINT IF EXISTS chk_user_addresses_pincode;

ALTER TABLE user_addresses
    ADD CONSTRAINT chk_user_addresses_pincode
        CHECK (pincode ~ '^[0-9]{6,12}$');

CREATE INDEX IF NOT EXISTS idx_user_addresses_pincode ON user_addresses (pincode);
