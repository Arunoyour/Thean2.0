-- Migration 034: Haircut Booking Sector
-- Runs against the dedicated thean_haircut database.
-- All objects live in schema "HC".

CREATE SCHEMA IF NOT EXISTS "HC";

SET search_path TO "HC";

-- ── Vendor authentication ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "HC".haircut_vendor_accounts (
    account_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       VARCHAR(200) NOT NULL,
    email           VARCHAR(200),
    phone           VARCHAR(20)  NOT NULL UNIQUE,
    otp_code        VARCHAR(6),
    otp_expires_at  TIMESTAMPTZ,
    account_status  VARCHAR(20)  NOT NULL DEFAULT 'active',
    fcm_token       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Shops (one vendor → one shop for v1) ────────────────────────────────
CREATE TABLE IF NOT EXISTS "HC".barber_shops (
    shop_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id       UUID        NOT NULL REFERENCES "HC".haircut_vendor_accounts(account_id) ON DELETE CASCADE,
    shop_name       VARCHAR(200) NOT NULL,
    phone           VARCHAR(20),
    total_chairs    INT         NOT NULL DEFAULT 1 CHECK (total_chairs >= 1),
    address_line    TEXT,
    lat             NUMERIC(10, 7),
    lng             NUMERIC(10, 7),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Weekly schedule (0=Sun … 6=Sat) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "HC".shop_hours (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id         UUID        NOT NULL REFERENCES "HC".barber_shops(shop_id) ON DELETE CASCADE,
    day_of_week     SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    is_open         BOOLEAN     NOT NULL DEFAULT TRUE,
    opening_time    TIME        NOT NULL,
    closing_time    TIME        NOT NULL,
    CONSTRAINT uq_shop_day UNIQUE (shop_id, day_of_week),
    CONSTRAINT chk_shop_hours_order CHECK (closing_time > opening_time)
);

-- ── Holiday / ad-hoc closures ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "HC".shop_closures (
    closure_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id         UUID        NOT NULL REFERENCES "HC".barber_shops(shop_id) ON DELETE CASCADE,
    closure_date    DATE        NOT NULL,
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_shop_closure_date UNIQUE (shop_id, closure_date)
);

-- ── Service catalog ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "HC".shop_services (
    service_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id         UUID        NOT NULL REFERENCES "HC".barber_shops(shop_id) ON DELETE CASCADE,
    service_name    VARCHAR(200) NOT NULL,
    fee             NUMERIC(8, 2) NOT NULL CHECK (fee >= 0),
    duration_minutes INT         NOT NULL CHECK (duration_minutes > 0),
    is_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
    display_order   INT         NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Customer bookings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "HC".haircut_bookings (
    booking_id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id                 UUID        NOT NULL,   -- cross-DB ref to main customer table
    shop_id                     UUID        NOT NULL REFERENCES "HC".barber_shops(shop_id),
    appointment_date            DATE        NOT NULL,
    start_time                  TIME        NOT NULL,
    total_duration_minutes      INT         NOT NULL CHECK (total_duration_minutes > 0),
    total_fee                   NUMERIC(8, 2) NOT NULL CHECK (total_fee >= 0),
    status                      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    otp_code                    VARCHAR(6)  NOT NULL,
    otp_used_at                 TIMESTAMPTZ,
    token_held                  BOOLEAN     NOT NULL DEFAULT TRUE,
    token_refunded              BOOLEAN     NOT NULL DEFAULT FALSE,
    cancel_requested_at         TIMESTAMPTZ,
    cancel_reason               TEXT,
    manual_checkin_requested_at TIMESTAMPTZ,
    manual_checkin_approved_at  TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_booking_status CHECK (
        status IN ('PENDING','CONFIRMED','COMPLETED','CANCELED','NO_SHOW')
    )
);

CREATE INDEX IF NOT EXISTS idx_haircut_bookings_customer  ON "HC".haircut_bookings (customer_id);
CREATE INDEX IF NOT EXISTS idx_haircut_bookings_shop_date ON "HC".haircut_bookings (shop_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_haircut_bookings_status    ON "HC".haircut_bookings (status);

-- ── Booking → services junction (snapshot at booking time) ──────────────
CREATE TABLE IF NOT EXISTS "HC".haircut_booking_services (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      UUID        NOT NULL REFERENCES "HC".haircut_bookings(booking_id) ON DELETE CASCADE,
    service_id      UUID        NOT NULL REFERENCES "HC".shop_services(service_id),
    service_name    VARCHAR(200) NOT NULL,
    fee             NUMERIC(8, 2) NOT NULL,
    duration_minutes INT        NOT NULL
);

-- ── Customer token ledger (isolated from delivery wallet) ────────────────
CREATE TABLE IF NOT EXISTS "HC".customer_haircut_tokens (
    customer_id     UUID        PRIMARY KEY,  -- cross-DB ref, no FK
    balance         INT         NOT NULL DEFAULT 3 CHECK (balance >= 0),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Token transaction audit log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "HC".haircut_token_transactions (
    tx_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID        NOT NULL,
    booking_id      UUID,
    change          INT         NOT NULL,   -- +1 credit / -1 debit / 0 forfeit
    reason          VARCHAR(50) NOT NULL,
    -- BOOKING_HOLD | CANCEL_REFUND | COMPLETION_REFUND | NO_SHOW_FORFEIT
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haircut_token_tx_customer ON "HC".haircut_token_transactions (customer_id);
