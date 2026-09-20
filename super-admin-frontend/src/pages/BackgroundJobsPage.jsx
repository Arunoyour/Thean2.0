import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Play, RefreshCw } from "lucide-react";

import { BackButton } from "../components/BackButton.jsx";
import {
  listBackgroundJobHistory,
  listBackgroundJobs,
  runBackgroundJob,
} from "../lib/api.js";
import { canWriteConfig } from "../lib/role.js";

const REFRESH_MS = 30_000;

function intervalMs(label = "") {
  const every = label.match(/every\s+(\d+)\s*(s|min|h)/i);
  if (every) {
    const value = Number(every[1]);
    const unit = every[2].toLowerCase();
    return value * (unit === "s" ? 1_000 : unit === "min" ? 60_000 : 3_600_000);
  }
  if (/daily/i.test(label)) return 24 * 3_600_000;
  return null;
}

function displayStatus(job) {
  if (!job.last_run_at) return "NEVER_RUN";
  if (job.last_status === "FAILED" || job.last_error) return "FAILED";
  const expected = intervalMs(job.recommended_interval);
  if (expected && Date.now() - new Date(job.last_run_at).getTime() > expected * 2.5) {
    return "OVERDUE";
  }
  return "HEALTHY";
}

function formatTime(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function resultSummary(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  const json = JSON.stringify(value);
  return json.length > 120 ? `${json.slice(0, 117)}…` : json;
}

const STATUS_STYLE = {
  HEALTHY: { label: "Healthy", color: "#15803d", background: "#dcfce7" },
  FAILED: { label: "Failed", color: "#b91c1c", background: "#fee2e2" },
  OVERDUE: { label: "Overdue", color: "#b45309", background: "#fef3c7" },
  NEVER_RUN: { label: "Never run", color: "#475569", background: "#e2e8f0" },
};

function StatusBadge({ status }) {
  const style = STATUS_STYLE[status] || STATUS_STYLE.NEVER_RUN;
  return (
    <span className="job-status" style={{ color: style.color, background: style.background }}>
      {style.label}
    </span>
  );
}

function Metric({ icon: Icon, label, value, tone }) {
  return (
    <div className="job-metric">
      <span className="job-metric-icon" style={{ color: tone }}><Icon size={18} /></span>
      <span><strong>{value}</strong><small>{label}</small></span>
    </div>
  );
}

export function BackgroundJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningJob, setRunningJob] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("ALL");

  async function load({ quiet = false } = {}) {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const [jobData, historyData] = await Promise.all([
        listBackgroundJobs(),
        listBackgroundJobHistory({ limit: 50 }),
      ]);
      setJobs(jobData);
      setHistory(historyData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load({ quiet: true }), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const classified = useMemo(
    () => jobs.map(job => ({ ...job, displayStatus: displayStatus(job) })),
    [jobs],
  );
  const counts = useMemo(() => ({
    healthy: classified.filter(job => job.displayStatus === "HEALTHY").length,
    failed: classified.filter(job => job.displayStatus === "FAILED").length,
    attention: classified.filter(job => ["FAILED", "OVERDUE", "NEVER_RUN"].includes(job.displayStatus)).length,
  }), [classified]);
  const visibleJobs = filter === "ALL"
    ? classified
    : classified.filter(job => job.displayStatus === filter);

  async function runNow(job) {
    const accepted = window.confirm(
      `Run “${job.job.replaceAll("_", " ")}” now? This can update production data.`,
    );
    if (!accepted) return;
    setRunningJob(job.job);
    setError("");
    setNotice("");
    try {
      await runBackgroundJob(job.job);
      setNotice(`${job.job.replaceAll("_", " ")} completed successfully.`);
      await load({ quiet: true });
    } catch (e) {
      setError(e.message);
      await load({ quiet: true });
    } finally {
      setRunningJob("");
    }
  }

  return (
    <main className="page job-monitor-page">
      <BackButton />
      <div className="job-monitor-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Background Jobs</h1>
          <p>Live status from the scheduler, refreshed every 30 seconds.</p>
        </div>
        <button className="outline-button" onClick={() => load({ quiet: true })} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? "spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <section className="job-metrics" aria-label="Job status summary">
        <Metric icon={Activity} label="Registered" value={jobs.length} tone="#0f766e" />
        <Metric icon={CheckCircle2} label="Healthy" value={counts.healthy} tone="#15803d" />
        <Metric icon={AlertTriangle} label="Failed" value={counts.failed} tone="#b91c1c" />
        <Metric icon={Clock3} label="Need attention" value={counts.attention} tone="#b45309" />
      </section>

      {error && <div className="error" role="alert">{error}</div>}
      {notice && <div className="success" role="status">{notice}</div>}

      <div className="job-filter-row">
        {["ALL", "HEALTHY", "FAILED", "OVERDUE", "NEVER_RUN"].map(value => (
          <button
            key={value}
            type="button"
            className={filter === value ? "job-filter active" : "job-filter"}
            onClick={() => setFilter(value)}
          >
            {value === "ALL" ? "All" : STATUS_STYLE[value].label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="panel job-empty">Loading job status…</div>
      ) : visibleJobs.length === 0 ? (
        <div className="panel job-empty">No jobs match this status.</div>
      ) : (
        <div className="panel job-table-wrap">
          <table className="job-table">
            <thead>
              <tr>
                <th>Job</th><th>Status</th><th>Schedule</th><th>Last run</th>
                <th>Runs / failures</th><th>Result</th><th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map(job => (
                <tr key={job.job} className={job.displayStatus === "FAILED" ? "job-row-failed" : ""}>
                  <td>
                    <strong>{job.job.replaceAll("_", " ")}</strong>
                    <small>{job.description}</small>
                    {job.last_error && <span className="job-error-text">{job.last_error}</span>}
                  </td>
                  <td><StatusBadge status={job.displayStatus} /></td>
                  <td><span className="job-priority">{job.priority}</span><br />{job.recommended_interval}</td>
                  <td>{formatTime(job.last_run_at)}<small>{job.last_duration_ms != null ? `${job.last_duration_ms} ms · ${job.last_trigger_source || "unknown"}` : ""}</small></td>
                  <td>{Number(job.total_runs || 0).toLocaleString("en-IN")} / {Number(job.total_failures || 0).toLocaleString("en-IN")}</td>
                  <td title={resultSummary(job.last_result)} className="job-result">{resultSummary(job.last_result)}</td>
                  <td>
                    {canWriteConfig() && (
                      <button
                        className="outline-button job-run-button"
                        disabled={Boolean(runningJob)}
                        onClick={() => runNow(job)}
                      >
                        <Play size={13} /> {runningJob === job.job ? "Running…" : "Run now"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="job-history-section">
        <div>
          <p className="eyebrow">Retained history</p>
          <h2>Failures and manual runs</h2>
        </div>
        {history.length === 0 ? (
          <div className="panel job-empty">No failures or manual runs recorded.</div>
        ) : (
          <div className="panel job-table-wrap">
            <table className="job-table compact">
              <thead><tr><th>Time</th><th>Job</th><th>Status</th><th>Source</th><th>Duration</th><th>Details</th></tr></thead>
              <tbody>
                {history.map(event => (
                  <tr key={event.execution_id}>
                    <td>{formatTime(event.finished_at)}</td>
                    <td><strong>{event.job_name.replaceAll("_", " ")}</strong></td>
                    <td><StatusBadge status={event.status === "SUCCESS" ? "HEALTHY" : "FAILED"} /></td>
                    <td>{event.trigger_source}</td>
                    <td>{event.duration_ms} ms</td>
                    <td className="job-result" title={event.error || resultSummary(event.result)}>{event.error || resultSummary(event.result)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
