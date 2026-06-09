-- Migration 020: Delivery Boy System
-- Database : thean_delivery  (separate DB from core / pharmacy)
-- Schema   : D
-- Run this against the DELIVERY database, not thean or thean_pharmacy.

CREATE SCHEMA IF NOT EXISTS "D";

-- ── Delivery accounts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "D".delivery_accounts (
    account_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name           VARCHAR(200) NOT NULL,
    phone_number        VARCHAR(20)  NOT NULL UNIQUE,
    email               VARCHAR(200),
    vehicle_type        VARCHAR(20)  NOT NULL CHECK (vehicle_type IN ('bike','car','cycle')),
    vehicle_number      VARCHAR(20),
    -- pending → active → disabled
    account_status      VARCHAR(20)  NOT NULL DEFAULT 'pending'
                        CHECK (account_status IN ('pending','active','disabled')),
    is_online           BOOLEAN      NOT NULL DEFAULT FALSE,
    current_lat         NUMERIC(10,7),
    current_lng         NUMERIC(10,7),
    location_updated_at TIMESTAMPTZ,
    otp_code            VARCHAR(6),
    otp_expires_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dl_accounts_phone
    ON "D".delivery_accounts(phone_number);
CREATE INDEX IF NOT EXISTS idx_dl_accounts_status
    ON "D".delivery_accounts(account_status);

-- ── Documents (license, ID proof) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "D".delivery_documents (
    document_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    UUID        NOT NULL REFERENCES "D".delivery_accounts(account_id) ON DELETE CASCADE,
    doc_type      VARCHAR(30) NOT NULL CHECK (doc_type IN ('driving_license','id_proof')),
    filename      VARCHAR(500) NOT NULL,
    original_name VARCHAR(500),
    content_type  VARCHAR(100),
    uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dl_documents_account
    ON "D".delivery_documents(account_id);

-- ── Delivery orders ────────────────────────────────────────────────────────
-- sector        : identifies which product DB owns the source order
--                 e.g. 'pharmacy', 'food', 'fish'
-- source_order_id: UUID of the order in the sector's own database
CREATE TABLE IF NOT EXISTS "D".delivery_orders (
    delivery_order_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id              UUID        NOT NULL REFERENCES "D".delivery_accounts(account_id),
    -- ── Source order reference (multi-sector) ──────────────────────────
    sector                  VARCHAR(30) NOT NULL DEFAULT 'pharmacy'
                            CHECK (sector IN ('pharmacy','food','fish','grocery','other')),
    source_order_id         UUID        NOT NULL,   -- PK in the sector DB
    -- ─────────────────────────────────────────────────────────────────
    status                  VARCHAR(40) NOT NULL DEFAULT 'ASSIGNED_TO_DELIVERY'
                            CHECK (status IN (
                                'ASSIGNED_TO_DELIVERY',
                                'DELIVERY_ACCEPTED',
                                'ARRIVED_AT_STORE',
                                'ORDER_PICKED_UP',
                                'ARRIVED_AT_CUSTOMER',
                                'DELIVERED',
                                'DELIVERY_REJECTED',
                                'DELIVERY_CANCELLED'
                            )),
    distance_km             NUMERIC(8,2),
    earnings_amount         NUMERIC(10,2),
    rate_per_km             NUMERIC(6,2)  NOT NULL DEFAULT 7.00,
    -- PINs
    pickup_pin              VARCHAR(6),
    delivery_pin            VARCHAR(6),
    -- Deadline for acceptance
    accept_deadline_at      TIMESTAMPTZ,
    -- Status timestamps
    accepted_at             TIMESTAMPTZ,
    arrived_at_store_at     TIMESTAMPTZ,
    picked_up_at            TIMESTAMPTZ,
    arrived_at_customer_at  TIMESTAMPTZ,
    delivered_at            TIMESTAMPTZ,
    rejected_at             TIMESTAMPTZ,
    -- Coordinates
    pickup_lat              NUMERIC(10,7),
    pickup_lng              NUMERIC(10,7),
    dropoff_lat             NUMERIC(10,7),
    dropoff_lng             NUMERIC(10,7),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dl_orders_account
    ON "D".delivery_orders(account_id);
CREATE INDEX IF NOT EXISTS idx_dl_orders_sector_source
    ON "D".delivery_orders(sector, source_order_id);
CREATE INDEX IF NOT EXISTS idx_dl_orders_status
    ON "D".delivery_orders(status);

-- ── Chat (customer ↔ driver) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "D".delivery_chat_messages (
    message_id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id   UUID    NOT NULL
                        REFERENCES "D".delivery_orders(delivery_order_id) ON DELETE CASCADE,
    sender_type         VARCHAR(20) NOT NULL CHECK (sender_type IN ('customer','delivery')),
    sender_id           UUID        NOT NULL,
    message_text        TEXT        NOT NULL,
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dl_chat_order
    ON "D".delivery_chat_messages(delivery_order_id);

-- ── Earnings per delivery ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "D".delivery_earnings (
    earning_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id          UUID        NOT NULL REFERENCES "D".delivery_accounts(account_id),
    delivery_order_id   UUID        NOT NULL REFERENCES "D".delivery_orders(delivery_order_id),
    amount              NUMERIC(10,2) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'credited'
                        CHECK (status IN ('credited','withdrawn')),
    earned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dl_earnings_account
    ON "D".delivery_earnings(account_id);

-- ── Wallet ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "D".delivery_wallet (
    wallet_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id          UUID        NOT NULL UNIQUE
                        REFERENCES "D".delivery_accounts(account_id),
    balance             NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_earned        NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_withdrawn     NUMERIC(10,2) NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Cashout requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "D".delivery_cashout_requests (
    cashout_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    UUID        NOT NULL REFERENCES "D".delivery_accounts(account_id),
    amount        NUMERIC(10,2) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
    upi_id        VARCHAR(200),
    note          TEXT,
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dl_cashout_account
    ON "D".delivery_cashout_requests(account_id);
