SET search_path TO "T", public;

CREATE TABLE IF NOT EXISTS background_job_status (
    job_name              VARCHAR(120) PRIMARY KEY,
    last_status           VARCHAR(20) NOT NULL,
    last_run_at           TIMESTAMPTZ NOT NULL,
    last_success_at       TIMESTAMPTZ,
    last_failure_at       TIMESTAMPTZ,
    last_result           JSONB,
    last_error            TEXT,
    last_trigger_source   VARCHAR(20) NOT NULL,
    last_duration_ms      INTEGER NOT NULL DEFAULT 0,
    total_runs            BIGINT NOT NULL DEFAULT 0,
    total_failures        BIGINT NOT NULL DEFAULT 0,
    consecutive_failures  INTEGER NOT NULL DEFAULT 0,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_background_job_status_last_run
    ON background_job_status (last_run_at DESC);

-- Keep a compact audit trail. Scheduled successes are represented by the
-- counters/latest state above; failures and every manual run are retained here.
CREATE TABLE IF NOT EXISTS background_job_execution_events (
    execution_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name        VARCHAR(120) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    trigger_source  VARCHAR(20) NOT NULL,
    triggered_by    UUID REFERENCES super_admins(admin_id) ON DELETE SET NULL,
    started_at      TIMESTAMPTZ NOT NULL,
    finished_at     TIMESTAMPTZ NOT NULL,
    duration_ms     INTEGER NOT NULL DEFAULT 0,
    result          JSONB,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_background_job_events_job_time
    ON background_job_execution_events (job_name, finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_background_job_events_status_time
    ON background_job_execution_events (status, finished_at DESC);
