SET search_path TO "PH", public;

CREATE TABLE IF NOT EXISTS pharmacy_operating_hours (
    hours_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES pharmacy_accounts(account_id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    is_closed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_operating_hours_account
ON pharmacy_operating_hours (account_id);

CREATE TABLE IF NOT EXISTS pharmacy_holidays (
    holiday_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES pharmacy_accounts(account_id) ON DELETE CASCADE,
    holiday_date DATE NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, holiday_date)
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_holidays_account_date
ON pharmacy_holidays (account_id, holiday_date);

ALTER TABLE pharmacy_profiles
ADD COLUMN IF NOT EXISTS manual_override_at TIMESTAMPTZ;
