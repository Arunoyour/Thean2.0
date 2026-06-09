SET search_path TO "PH", public;

ALTER TABLE pharmacy_profiles
ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_pharmacy_profiles_online_listed
ON pharmacy_profiles (is_online, is_listed);
