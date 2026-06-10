-- Migration 027: Settlement Core
-- Tables: settlement_cycles, settlement_batches, settlement_lines,
--         stakeholder_ledger, payment_proofs

-- ── 1. Settlement Cycles ───────────────────────────────────────────────────
-- One row per settlement run (daily / weekly / manual).

CREATE TABLE IF NOT EXISTS settlement_cycles (
    cycle_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_date      DATE        NOT NULL,
    cycle_type      VARCHAR(20) NOT NULL DEFAULT 'DAILY'
                        CHECK (cycle_type IN ('DAILY', 'WEEKLY', 'MANUAL')),
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN', 'GENERATING', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTED', 'CANCELLED')),
    notes           TEXT,
    created_by      UUID REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    executed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cycle_date, cycle_type)
);

CREATE INDEX IF NOT EXISTS idx_settlement_cycles_date
    ON settlement_cycles (cycle_date DESC);

CREATE INDEX IF NOT EXISTS idx_settlement_cycles_status
    ON settlement_cycles (status);

-- ── 2. Settlement Batches ──────────────────────────────────────────────────
-- One batch per stakeholder per cycle.

CREATE TABLE IF NOT EXISTS settlement_batches (
    batch_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id            UUID NOT NULL REFERENCES settlement_cycles(cycle_id) ON DELETE CASCADE,
    stakeholder_type    VARCHAR(20) NOT NULL
                            CHECK (stakeholder_type IN ('PHARMACY', 'DELIVERY_BOY')),
    stakeholder_id      UUID NOT NULL,
    stakeholder_name    TEXT NOT NULL,                         -- denormalised snapshot
    opening_balance     NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    closing_balance     NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_credits       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_debits        NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    net_payable         NUMERIC(12,2) NOT NULL DEFAULT 0.00,   -- positive = we owe them
    status              VARCHAR(25) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN (
                                'DRAFT', 'PENDING_APPROVAL', 'APPROVED',
                                'EXECUTED', 'REJECTED', 'NEEDS_CORRECTION', 'CANCELLED'
                            )),
    approval_request_id UUID REFERENCES approval_requests(request_id) ON DELETE SET NULL,
    idempotency_key     TEXT UNIQUE NOT NULL,                  -- cycle_id:stakeholder_type:stakeholder_id
    retry_count         INTEGER NOT NULL DEFAULT 0,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_batches_cycle
    ON settlement_batches (cycle_id);

CREATE INDEX IF NOT EXISTS idx_settlement_batches_stakeholder
    ON settlement_batches (stakeholder_type, stakeholder_id);

CREATE INDEX IF NOT EXISTS idx_settlement_batches_status
    ON settlement_batches (status);

-- ── 3. Settlement Lines ────────────────────────────────────────────────────
-- Individual credit / debit line items within a batch.

CREATE TABLE IF NOT EXISTS settlement_lines (
    line_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID NOT NULL REFERENCES settlement_batches(batch_id) ON DELETE CASCADE,
    line_type       VARCHAR(10) NOT NULL CHECK (line_type IN ('CREDIT', 'DEBIT')),
    reference_type  VARCHAR(30) NOT NULL
                        CHECK (reference_type IN (
                            'ORDER', 'COD_COLLECTION', 'PLATFORM_FEE',
                            'GST', 'ADJUSTMENT', 'REFUND', 'PENALTY'
                        )),
    reference_id    UUID,                                      -- order_id or other entity id
    description     TEXT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_lines_batch
    ON settlement_lines (batch_id);

CREATE INDEX IF NOT EXISTS idx_settlement_lines_reference
    ON settlement_lines (reference_type, reference_id);

-- ── 4. Stakeholder Ledger ──────────────────────────────────────────────────
-- Append-only running balance log. Never updated — only inserted.

CREATE TABLE IF NOT EXISTS stakeholder_ledger (
    entry_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stakeholder_type    VARCHAR(20) NOT NULL
                            CHECK (stakeholder_type IN ('PHARMACY', 'DELIVERY_BOY')),
    stakeholder_id      UUID NOT NULL,
    stakeholder_name    TEXT NOT NULL,
    entry_type          VARCHAR(10) NOT NULL CHECK (entry_type IN ('CREDIT', 'DEBIT')),
    amount              NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    running_balance     NUMERIC(12,2) NOT NULL,
    reference_type      VARCHAR(30) NOT NULL,
    reference_id        UUID,
    description         TEXT NOT NULL,
    batch_id            UUID REFERENCES settlement_batches(batch_id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stakeholder_ledger_stakeholder
    ON stakeholder_ledger (stakeholder_type, stakeholder_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stakeholder_ledger_batch
    ON stakeholder_ledger (batch_id);

-- ── 5. Payment Proofs ──────────────────────────────────────────────────────
-- Digital proof for inward (received from stakeholder) and
-- outward (paid to stakeholder) payments.

CREATE TABLE IF NOT EXISTS payment_proofs (
    proof_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID NOT NULL REFERENCES settlement_batches(batch_id) ON DELETE CASCADE,
    proof_type      VARCHAR(10) NOT NULL CHECK (proof_type IN ('INWARD', 'OUTWARD')),
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_method  VARCHAR(20) NOT NULL DEFAULT 'BANK_TRANSFER'
                        CHECK (payment_method IN ('BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE')),
    file_path       TEXT,                                      -- relative path under /uploads/proofs/
    notes           TEXT,
    uploaded_by     UUID REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by     UUID REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_batch
    ON payment_proofs (batch_id);
