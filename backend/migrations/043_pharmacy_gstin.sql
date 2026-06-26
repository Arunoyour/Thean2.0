SET search_path TO "PH", public;
ALTER TABLE pharmacy_profiles ADD COLUMN IF NOT EXISTS gstin VARCHAR(15);
