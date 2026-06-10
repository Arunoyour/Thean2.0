-- Migration 029: Dispute Management
-- Tables: disputes, dispute_messages, dispute_status_history

-- ── 1. Disputes ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS disputes (
    dispute_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who raised it and from which app
    raised_by_app       VARCHAR(20)  NOT NULL
                            CHECK (raised_by_app IN ('CUSTOMER', 'PHARMACY', 'DELIVERY_BOY', 'TEAM_LEAD')),
    raised_by_id        UUID         NOT NULL,
    raised_by_name      TEXT         NOT NULL,

    -- What the dispute is about
    dispute_type        VARCHAR(30)  NOT NULL
                            CHECK (dispute_type IN (
                                'WRONG_CHARGE',
                                'REFUND_NOT_RECEIVED',
                                'SETTLEMENT_DISPUTE',
                                'COD_DISPUTE',
                                'OTHER'
                            )),
    reference_type      VARCHAR(20)  NOT NULL
                            CHECK (reference_type IN ('ORDER', 'SETTLEMENT_BATCH', 'COD', 'OTHER')),
    reference_id        UUID,
    reference_detail    JSONB        NOT NULL DEFAULT '{}', -- snapshot: order number, amount, date

    -- Lifecycle
    status              VARCHAR(20)  NOT NULL DEFAULT 'OPEN'
                            CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REOPENED', 'CLOSED')),
    assigned_to         UUID REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    resolution_notes    TEXT,
    resolved_by         UUID REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    resolved_at         TIMESTAMPTZ,
    reopened_count      INTEGER      NOT NULL DEFAULT 0,
    reopened_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_raised_by
    ON disputes (raised_by_app, raised_by_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_disputes_status
    ON disputes (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_disputes_reference
    ON disputes (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_disputes_assigned
    ON disputes (assigned_to);

-- ── 2. Dispute Messages ────────────────────────────────────────────────────
-- Each dispute can have multiple messages — initial raise + follow-ups.
-- Supports any combination of text, voice, and image.

CREATE TABLE IF NOT EXISTS dispute_messages (
    message_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id          UUID         NOT NULL REFERENCES disputes(dispute_id) ON DELETE CASCADE,

    -- Sender
    sender_type         VARCHAR(20)  NOT NULL
                            CHECK (sender_type IN ('CUSTOMER', 'PHARMACY', 'DELIVERY_BOY', 'TEAM_LEAD', 'ADMIN', 'SYSTEM')),
    sender_id           UUID,
    sender_name         TEXT         NOT NULL,

    -- Content (any combination is valid — at least one must be non-null)
    text_content        TEXT,
    voice_file_path     TEXT,                       -- relative path under /uploads/disputes/voice/
    voice_duration_secs INTEGER,                    -- seconds, max 180 (3 min)
    image_file_path     TEXT,                       -- relative path under /uploads/disputes/images/
    attachment_path     TEXT,                       -- general file attachment
    attachment_name     TEXT,                       -- original filename

    is_internal         BOOLEAN      NOT NULL DEFAULT FALSE, -- admin-only internal note

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute
    ON dispute_messages (dispute_id, created_at ASC);

-- ── 3. Dispute Status History ──────────────────────────────────────────────
-- Append-only audit trail of every status transition.

CREATE TABLE IF NOT EXISTS dispute_status_history (
    history_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id      UUID         NOT NULL REFERENCES disputes(dispute_id) ON DELETE CASCADE,
    old_status      VARCHAR(20),
    new_status      VARCHAR(20)  NOT NULL,
    changed_by      UUID REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    changed_by_name TEXT         NOT NULL DEFAULT 'SYSTEM',
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_history_dispute
    ON dispute_status_history (dispute_id, created_at ASC);
