-- Migration 028: Reconciliation module
-- Tables: gateway_events, bank_statement_lines,
--         reconciliation_matches, reconciliation_exceptions

-- ── 1. Gateway Events ──────────────────────────────────────────────────────
-- Raw inbound webhook payloads from the payment gateway.
-- Append-only — never updated after insert.

CREATE TABLE IF NOT EXISTS gateway_events (
    event_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway           VARCHAR(30)  NOT NULL DEFAULT 'RAZORPAY',
    event_type        VARCHAR(50)  NOT NULL,                    -- e.g. payment.captured
    gateway_reference TEXT         NOT NULL,                    -- gateway's own txn ID
    amount            NUMERIC(12,2) NOT NULL,
    currency          VARCHAR(5)   NOT NULL DEFAULT 'INR',
    status            VARCHAR(20)  NOT NULL,                    -- captured / failed / refunded
    raw_payload       JSONB        NOT NULL DEFAULT '{}',
    processed         BOOLEAN      NOT NULL DEFAULT FALSE,
    batch_id          UUID REFERENCES settlement_batches(batch_id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_events_reference
    ON gateway_events (gateway_reference);

CREATE INDEX IF NOT EXISTS idx_gateway_events_processed
    ON gateway_events (processed, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gateway_events_batch
    ON gateway_events (batch_id);

-- ── 2. Bank Statement Lines ────────────────────────────────────────────────
-- Lines uploaded from bank statement (CSV / manual entry).

CREATE TABLE IF NOT EXISTS bank_statement_lines (
    statement_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name         TEXT         NOT NULL,
    account_number    VARCHAR(20),                              -- last 4 digits stored
    transaction_date  DATE         NOT NULL,
    description       TEXT         NOT NULL,
    amount            NUMERIC(12,2) NOT NULL,
    transaction_type  VARCHAR(10)  NOT NULL CHECK (transaction_type IN ('CREDIT', 'DEBIT')),
    reference         TEXT,                                     -- UTR / cheque number
    matched           BOOLEAN      NOT NULL DEFAULT FALSE,
    batch_id          UUID REFERENCES settlement_batches(batch_id) ON DELETE SET NULL,
    uploaded_by       UUID REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_date
    ON bank_statement_lines (transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_bank_statement_reference
    ON bank_statement_lines (reference);

CREATE INDEX IF NOT EXISTS idx_bank_statement_matched
    ON bank_statement_lines (matched);

-- ── 3. Reconciliation Matches ──────────────────────────────────────────────
-- Result of the three-way match engine: batch line ↔ gateway ↔ bank statement.

CREATE TABLE IF NOT EXISTS reconciliation_matches (
    match_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id            UUID NOT NULL REFERENCES settlement_batches(batch_id) ON DELETE CASCADE,
    gateway_event_id    UUID REFERENCES gateway_events(event_id) ON DELETE SET NULL,
    statement_line_id   UUID REFERENCES bank_statement_lines(statement_line_id) ON DELETE SET NULL,
    match_type          VARCHAR(25) NOT NULL
                            CHECK (match_type IN (
                                'FULL_MATCH',
                                'PARTIAL_MATCH',
                                'GATEWAY_ONLY',
                                'STATEMENT_ONLY',
                                'BATCH_ONLY'
                            )),
    batch_amount        NUMERIC(12,2),
    gateway_amount      NUMERIC(12,2),
    statement_amount    NUMERIC(12,2),
    variance            NUMERIC(12,2) NOT NULL DEFAULT 0.00,    -- abs(batch - gateway)
    status              VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING', 'MATCHED', 'EXCEPTION', 'RESOLVED')),
    resolved_by         UUID REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    resolved_at         TIMESTAMPTZ,
    resolution_notes    TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recon_matches_batch
    ON reconciliation_matches (batch_id);

CREATE INDEX IF NOT EXISTS idx_recon_matches_status
    ON reconciliation_matches (status);

-- ── 4. Reconciliation Exceptions ──────────────────────────────────────────
-- Raised automatically when a match is not FULL_MATCH or variance > threshold.

CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
    exception_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id            UUID NOT NULL REFERENCES reconciliation_matches(match_id) ON DELETE CASCADE,
    exception_type      VARCHAR(30) NOT NULL
                            CHECK (exception_type IN (
                                'AMOUNT_MISMATCH',
                                'MISSING_GATEWAY',
                                'MISSING_STATEMENT',
                                'DUPLICATE',
                                'TIMING_DIFFERENCE',
                                'OTHER'
                            )),
    severity            VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'
                            CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
    description         TEXT        NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                            CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED')),
    assigned_to         UUID REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    approval_request_id UUID REFERENCES approval_requests(request_id) ON DELETE SET NULL,
    resolution_notes    TEXT,
    resolved_by         UUID REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recon_exceptions_status
    ON reconciliation_exceptions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recon_exceptions_match
    ON reconciliation_exceptions (match_id);

CREATE INDEX IF NOT EXISTS idx_recon_exceptions_assigned
    ON reconciliation_exceptions (assigned_to);
