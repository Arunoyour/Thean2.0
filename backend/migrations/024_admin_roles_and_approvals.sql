-- Migration 024: Admin roles, approval workflow, notifications, audit log
-- Database : thean  (core DB)
-- Schema   : T
-- Adds:
--   1. role column on super_admins (SUPER/SUPERVISOR/CHECKER/AUDITOR/TEAM_LEAD)
--   2. approval_requests + approval_request_lines (Maker-Checker workflow)
--   3. notifications (in-app WebSocket queue)
--   4. audit_logs (every action, 1-year retention)

BEGIN;

SET search_path TO "T", public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Role column on super_admins
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE super_admins
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'CHECKER'
    CHECK (role IN ('SUPER','SUPERVISOR','CHECKER','AUDITOR','TEAM_LEAD'));

-- Seed account (9539536943) must be SUPER
UPDATE super_admins
SET role = 'SUPER'
WHERE phone_number = '+919539536943';

CREATE INDEX IF NOT EXISTS idx_super_admins_role
    ON super_admins (role);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Approval requests
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_requests (
    request_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What kind of action this request represents
    request_type        VARCHAR(40) NOT NULL
                        CHECK (request_type IN (
                            'COD_CLEAR',
                            'MANUAL_LEDGER_ADJUSTMENT',
                            'ACCOUNT_STATUS_CHANGE',
                            'SECTOR_FEE_CHANGE',
                            'DELIVERY_RATE_CHANGE',
                            'PAYOUT_OVERRIDE',
                            'SETTLEMENT_CANCELLATION'
                        )),

    -- Structured payload describing exactly what will be executed on approval
    payload             JSONB       NOT NULL,

    -- Who / what created this request
    -- NULL = created by the SYSTEM (cron / automation)
    requested_by        UUID        REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Lifecycle state
    status              VARCHAR(25) NOT NULL DEFAULT 'PENDING_APPROVAL'
                        CHECK (status IN (
                            'PENDING_APPROVAL',
                            'APPROVED',
                            'REJECTED',
                            'NEEDS_CORRECTION',
                            'EXECUTED',
                            'CANCELLED'
                        )),

    -- How many times the system has auto-retried after rejection
    -- 0 = first attempt, 1 = first retry, 2+ = goes to NEEDS_CORRECTION
    retry_count         INTEGER     NOT NULL DEFAULT 0,

    -- Checker review fields (populated on first review)
    reviewed_by         UUID        REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,
    rejection_reason    TEXT,       -- mandatory on rejection (enforced at service layer)

    -- Correction fields (populated when SUPER/CHECKER corrects a NEEDS_CORRECTION request)
    corrected_by        UUID        REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    corrected_at        TIMESTAMPTZ,
    correction_comment  TEXT,
    corrected_payload   JSONB,      -- revised payload after correction

    -- Execution result
    executed_at         TIMESTAMPTZ,
    execution_result    JSONB,      -- IDs created, balances changed etc.
    execution_error     TEXT,       -- populated if execution failed after approval

    -- Idempotency — prevents double-execution on retry
    idempotency_key     TEXT        UNIQUE NOT NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status
    ON approval_requests (status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_type
    ON approval_requests (request_type);
CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_by
    ON approval_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_approval_requests_created_at
    ON approval_requests (created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Approval request lines (line-level approve/reject within a batch)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_request_lines (
    line_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id          UUID        NOT NULL
                        REFERENCES approval_requests(request_id) ON DELETE CASCADE,

    -- Which stakeholder this line concerns
    stakeholder_type    VARCHAR(20) NOT NULL
                        CHECK (stakeholder_type IN ('DELIVERY_BOY','MERCHANT','PLATFORM')),
    stakeholder_id      UUID        NOT NULL,
    stakeholder_name    VARCHAR(200),

    -- What this line will do
    description         TEXT        NOT NULL,
    amount              NUMERIC(12,2),

    -- Line-level decision (independent of other lines in the same request)
    status              VARCHAR(25) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN (
                            'PENDING',
                            'APPROVED',
                            'REJECTED',
                            'NEEDS_CORRECTION',
                            'EXECUTED'
                        )),

    -- Checker decision on this line
    reviewed_by         UUID        REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,
    rejection_reason    TEXT,       -- mandatory on rejection (enforced at service layer)

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_lines_request
    ON approval_request_lines (request_id);
CREATE INDEX IF NOT EXISTS idx_approval_lines_status
    ON approval_request_lines (status);
CREATE INDEX IF NOT EXISTS idx_approval_lines_stakeholder
    ON approval_request_lines (stakeholder_type, stakeholder_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. In-app notifications
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
    notification_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who receives this notification
    -- NULL = broadcast to all admins matching recipient_role
    recipient_id        UUID        REFERENCES super_admins(admin_id) ON DELETE CASCADE,
    recipient_role      VARCHAR(20),    -- SUPER | SUPERVISOR | CHECKER etc.
                                        -- used when recipient_id is NULL (broadcast)

    -- What the notification is about
    notification_type   VARCHAR(40) NOT NULL
                        CHECK (notification_type IN (
                            'REQUEST_PENDING',
                            'REQUEST_APPROVED',
                            'REQUEST_REJECTED',
                            'REQUEST_NEEDS_CORRECTION',
                            'REQUEST_EXECUTED',
                            'PAYMENT_ON_HOLD',
                            'PAYMENT_RELEASED'
                        )),

    title               VARCHAR(200) NOT NULL,
    body                TEXT         NOT NULL,

    -- Link to the related entity
    reference_type      VARCHAR(40),
    reference_id        UUID,

    is_read             BOOLEAN     NOT NULL DEFAULT FALSE,
    read_at             TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
    ON notifications (recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_role
    ON notifications (recipient_role, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
    ON notifications (created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Audit log
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who performed the action (NULL = SYSTEM)
    actor_id            UUID        REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    actor_name          VARCHAR(200),   -- denormalised — preserved even if admin is deleted
    actor_role          VARCHAR(20) NOT NULL
                        CHECK (actor_role IN (
                            'SUPER','SUPERVISOR','CHECKER','AUDITOR','TEAM_LEAD','SYSTEM'
                        )),

    -- What was done
    action_type         VARCHAR(50) NOT NULL,
    -- e.g. LOGIN | LOGOUT | APPROVE_REQUEST | REJECT_REQUEST | CORRECT_REQUEST |
    --      VIEW_LEDGER | EXPORT_REPORT | CREATE_ADMIN | DEACTIVATE_ADMIN |
    --      CHANGE_ROLE | COD_CLEAR | FEE_CHANGE | RATE_CHANGE |
    --      VIEW_CUSTOMER | VIEW_DELIVERY_BOY | ACCESS_DENIED | ...

    -- Human-readable full-sentence description
    -- e.g. "Checker Aruna rejected COD clear of ₹2,400 for delivery boy
    --       Ravi (ID: abc-123) — reason: duplicate entry"
    description         TEXT        NOT NULL,

    -- What entity was acted on (optional)
    target_type         VARCHAR(40),
    target_id           UUID,

    -- Request context
    ip_address          VARCHAR(45),
    user_agent          TEXT,

    -- Whether the action succeeded or was blocked
    success             BOOLEAN     NOT NULL DEFAULT TRUE,
    -- FALSE = access denied, validation failed, constraint violation etc.

    -- HTTP context (optional, helps debugging)
    http_method         VARCHAR(10),
    http_path           TEXT,
    http_status         INTEGER,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
    ON audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_role
    ON audit_logs (actor_role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type
    ON audit_logs (action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_success
    ON audit_logs (success, created_at DESC);

-- Retention policy: rows older than 1 year are deleted by nightly cron
-- (cron job references this comment; do not remove)

COMMIT;
