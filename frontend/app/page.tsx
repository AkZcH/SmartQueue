"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  Clock3,
  Eye,
  FileJson,
  Filter,
  Gauge,
  Play,
  Plus,
  RefreshCcw,
  Search,
  Server,
  Terminal,
  X,
  XCircle,
} from "lucide-react";
import Topbar from "./components/Topbar";

const API = "http://localhost:8000";

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

interface Job {
  id: string;
  name: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  retry_count: number;
  error_msg: string | null;
}

interface Worker {
  worker_id: string;
  hostname: string;
  status: string;
  last_seen: string;
  jobs_processed: number;
  seconds_since_heartbeat: number;
}

type JobType = "etl" | "ml" | "http" | "shell";
type JobStatus = "queued" | "running" | "done" | "failed";
type SortKey = "created_at" | "name" | "type" | "status" | "priority";
type SortDirection = "asc" | "desc";
type StatusFilter = "all" | JobStatus;

const jobTypes: JobType[] = ["etl", "ml", "http", "shell"];

const statusCopy: Record<JobStatus, { label: string; tone: string }> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "info" },
  done: { label: "Completed", tone: "success" },
  failed: { label: "Failed", tone: "error" },
};

const sparklineHeights: Record<JobStatus, number[]> = {
  queued: [34, 46, 42, 58, 50, 62, 48, 56],
  running: [28, 36, 54, 44, 66, 58, 72, 64],
  done: [22, 34, 44, 56, 52, 68, 76, 84],
  failed: [18, 26, 22, 34, 28, 38, 32, 30],
};

function timeAgo(date: string) {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function duration(start: string | null, end: string | null) {
  if (!start) return null;
  const milliseconds = Math.max(
    0,
    new Date(end ?? Date.now()).getTime() - new Date(start).getTime(),
  );
  if (milliseconds < 1000) return `${milliseconds}ms`;
  if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)}s`;
  return `${Math.floor(milliseconds / 60000)}m ${Math.floor((milliseconds % 60000) / 1000)}s`;
}

function formatDate(date: string | null) {
  if (!date) return "-";
  return new Date(date).toLocaleString();
}

function priorityPercent(priority: number) {
  return Math.min(100, Math.max(0, Math.round(priority * 100)));
}

function normalizeStatus(status: string): JobStatus {
  if (status === "running" || status === "done" || status === "failed") {
    return status;
  }
  return "queued";
}

function StatusPill({ status }: { status: JobStatus }) {
  return (
    <span className="sq-status-pill" data-status={status}>
      <span className="sq-status-dot" aria-hidden="true" />
      {statusCopy[status].label}
    </span>
  );
}

function TypePill({ type }: { type: string }) {
  return <span className="sq-type-pill" data-type={type}>{type}</span>;
}

function MetricCard({
  label,
  value,
  status,
  trend,
  icon,
}: {
  label: string;
  value: number;
  status: JobStatus;
  trend: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="sq-card sq-card-interactive sq-metric">
      <div className="sq-card-body">
        <div className="sq-metric-top">
          <div>
            <div className="sq-metric-label">{label}</div>
            <div className="sq-metric-value">{value}</div>
          </div>
          <div className="sq-metric-icon">{icon}</div>
        </div>
        <div className="sq-trend">
          <ArrowDownUp size={12} aria-hidden="true" />
          {trend}
        </div>
        <div className="sq-sparkline" aria-hidden="true">
          {sparklineHeights[status].map((height, index) => (
            <span key={index} style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sort by ${label}${active ? `, ${direction}` : ""}`}
    >
      {label}
      <ArrowDownUp size={11} aria-hidden="true" />
    </button>
  );
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [form, setForm] = useState({
    name: "",
    type: "etl" as JobType,
    payload: '{\n  "file": "data.csv"\n}',
  });
  const [submitting, setSubmitting] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const [jobsResponse, workersResponse] = await Promise.allSettled([
        axios.get<Job[]>(`${API}/jobs/`),
        axios.get<Worker[]>(`${API}/jobs/workers`),
      ]);

      if (jobsResponse.status === "fulfilled") {
        setJobs(jobsResponse.value.data);
        setLastSyncedAt(new Date());
      }

      if (workersResponse.status === "fulfilled") {
        setWorkers(workersResponse.value.data);
      }
    } catch {
      setError("Unable to refresh queue state.");
    }
  }, []);

  useEffect(() => {
    window.setTimeout(fetchDashboard, 0);
    const interval = window.setInterval(fetchDashboard, 3000);
    return () => window.clearInterval(interval);
  }, [fetchDashboard]);

  async function submitJob() {
    if (!form.name.trim()) return;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(form.payload);
    } catch {
      setError("Payload must be valid JSON.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await axios.post(`${API}/jobs/`, {
        name: form.name.trim(),
        type: form.type,
        payload,
      });
      setForm((current) => ({ ...current, name: "" }));
      await fetchDashboard();
    } catch {
      setError("Job submission failed. Check the API and payload.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "created_at" ? "desc" : "asc");
  }

  const counts = useMemo(
    () => ({
      queued: jobs.filter((job) => job.status === "queued").length,
      running: jobs.filter((job) => job.status === "running").length,
      done: jobs.filter((job) => job.status === "done").length,
      failed: jobs.filter((job) => job.status === "failed").length,
    }),
    [jobs],
  );

  const filteredJobs = useMemo(() => {
    const loweredQuery = query.trim().toLowerCase();

    return jobs
      .filter((job) => {
        const matchesQuery =
          !loweredQuery ||
          job.name.toLowerCase().includes(loweredQuery) ||
          job.id.toLowerCase().includes(loweredQuery) ||
          job.type.toLowerCase().includes(loweredQuery);
        const matchesStatus =
          statusFilter === "all" || job.status === statusFilter;
        return matchesQuery && matchesStatus;
      })
      .sort((first, second) => {
        const direction = sortDirection === "asc" ? 1 : -1;

        if (sortKey === "priority") {
          return (first.priority - second.priority) * direction;
        }

        if (sortKey === "created_at") {
          return (
            (new Date(first.created_at).getTime() -
              new Date(second.created_at).getTime()) *
            direction
          );
        }

        return String(first[sortKey]).localeCompare(String(second[sortKey])) * direction;
      });
  }, [jobs, query, sortDirection, sortKey, statusFilter]);

  const recentExecutions = useMemo(
    () =>
      jobs
        .filter((job) => job.status === "done" || job.status === "failed")
        .slice(0, 6),
    [jobs],
  );

  const activeWorkers = workers.filter(
    (worker) => worker.seconds_since_heartbeat < 15,
  );
  const runningDuration = jobs
    .filter((job) => job.status === "running")
    .map((job) => duration(job.started_at, null))
    .filter(Boolean)[0];

  const healthRows = [
    {
      label: "API polling",
      value: lastSyncedAt ? `synced ${timeAgo(lastSyncedAt.toISOString())}` : "waiting",
      status: lastSyncedAt ? "done" : "queued",
    },
    {
      label: "Worker capacity",
      value: `${activeWorkers.length}/${workers.length || 0} active`,
      status: activeWorkers.length > 0 ? "done" : "queued",
    },
    {
      label: "Backlog pressure",
      value: `${counts.queued + counts.running} open jobs`,
      status: counts.failed > 0 ? "failed" : counts.running > 0 ? "running" : "done",
    },
  ] as const;

  return (
    <div className="sq-page">
      <div className="sq-shell">
        <Topbar active="queue" />

        <main>
          <section className="sq-dashboard-header" aria-labelledby="dashboard-title">
            <div>
              <p className="sq-kicker">Queue operations</p>
              <h1 id="dashboard-title" className="sq-title">
                Priority-aware job control plane
              </h1>
              <p className="sq-subtitle">
                Create jobs, monitor execution state, and inspect worker health from one dense operational surface.
              </p>
            </div>
            <div className="sq-header-meta">
              <span className="sq-meta-chip">
                <RefreshCcw size={13} aria-hidden="true" />
                3s refresh
              </span>
              <span className="sq-meta-chip">
                <Server size={13} aria-hidden="true" />
                {activeWorkers.length} active workers
              </span>
              <span className="sq-meta-chip">
                <Gauge size={13} aria-hidden="true" />
                {jobs.length} retained jobs
              </span>
            </div>
          </section>

          <section className="sq-grid sq-metrics-grid" aria-label="Queue metrics">
            <MetricCard
              label="Queued"
              value={counts.queued}
              status="queued"
              trend="backlog intake"
              icon={<Clock3 size={16} aria-hidden="true" />}
            />
            <MetricCard
              label="Running"
              value={counts.running}
              status="running"
              trend={runningDuration ? `longest ${runningDuration}` : "no active runtime"}
              icon={<Play size={16} aria-hidden="true" />}
            />
            <MetricCard
              label="Completed"
              value={counts.done}
              status="done"
              trend="successful exits"
              icon={<CheckCircle2 size={16} aria-hidden="true" />}
            />
            <MetricCard
              label="Failed"
              value={counts.failed}
              status="failed"
              trend={counts.failed ? "needs review" : "no failures"}
              icon={<XCircle size={16} aria-hidden="true" />}
            />
          </section>

          <section className="sq-grid sq-workspace-grid" style={{ marginTop: 14 }}>
            <section className="sq-card" aria-labelledby="create-job-title">
              <div className="sq-card-header">
                <div>
                  <h2 id="create-job-title" className="sq-card-title">
                    Create Job
                  </h2>
                  <p className="sq-card-description">Dispatch a queue item with a typed JSON payload.</p>
                </div>
                <FileJson size={16} color="var(--sq-text-subtle)" aria-hidden="true" />
              </div>
              <div className="sq-card-body">
                <form
                  className="sq-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitJob();
                  }}
                >
                  <label className="sq-field">
                    <span className="sq-label">Job name</span>
                    <input
                      className="sq-input"
                      placeholder="daily-ingest-us-east"
                      value={form.name}
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                    />
                  </label>

                  <div className="sq-field">
                    <span className="sq-label" id="job-type-label">
                      Job type
                    </span>
                    <div
                      className="sq-segmented"
                      role="radiogroup"
                      aria-labelledby="job-type-label"
                    >
                      {jobTypes.map((type) => (
                        <button
                          key={type}
                          className="sq-segment"
                          type="button"
                          role="radio"
                          aria-checked={form.type === type}
                          data-active={form.type === type}
                          data-type={type}
                          onClick={() => setForm({ ...form, type })}
                        >
                          {type === "shell" ? (
                            <Terminal size={13} aria-hidden="true" />
                          ) : (
                            <Activity size={13} aria-hidden="true" />
                          )}
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="sq-field">
                    <span className="sq-label">Payload</span>
                    <textarea
                      className="sq-textarea"
                      spellCheck={false}
                      value={form.payload}
                      onChange={(event) =>
                        setForm({ ...form, payload: event.target.value })
                      }
                    />
                  </label>

                  {error && (
                    <div className="sq-code sq-code-error" role="alert">
                      {error}
                    </div>
                  )}

                  <button
                    className="sq-button"
                    type="submit"
                    disabled={submitting || !form.name.trim()}
                  >
                    <Plus size={15} aria-hidden="true" />
                    {submitting ? "Submitting" : "Deploy job"}
                  </button>
                </form>
              </div>
            </section>

            <section className="sq-card" aria-labelledby="queue-table-title">
              <div className="sq-card-header">
                <div>
                  <h2 id="queue-table-title" className="sq-card-title">
                    Queue Activity
                  </h2>
                  <p className="sq-card-description">
                    {filteredJobs.length} visible of {jobs.length} jobs
                  </p>
                </div>
                <div className="sq-toolbar">
                  <label className="sq-search">
                    <Search size={14} aria-hidden="true" />
                    <span className="sr-only">Search jobs</span>
                    <input
                      className="sq-input"
                      placeholder="Search jobs, ids, types"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  <label>
                    <span className="sr-only">Filter by status</span>
                    <select
                      className="sq-select"
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(event.target.value as StatusFilter)
                      }
                    >
                      <option value="all">All statuses</option>
                      <option value="queued">Queued</option>
                      <option value="running">Running</option>
                      <option value="done">Completed</option>
                      <option value="failed">Failed</option>
                    </select>
                  </label>
                </div>
              </div>

              {filteredJobs.length === 0 ? (
                <div className="sq-empty">
                  <div>
                    <Filter size={22} aria-hidden="true" />
                    <strong>No jobs match this view</strong>
                    <span>Adjust the search, change filters, or deploy a new job.</span>
                  </div>
                </div>
              ) : (
                <div className="sq-table-wrap">
                  <table className="sq-table">
                    <thead>
                      <tr>
                        <th scope="col">
                          <SortButton
                            label="Job"
                            active={sortKey === "name"}
                            direction={sortDirection}
                            onClick={() => updateSort("name")}
                          />
                        </th>
                        <th scope="col">
                          <SortButton
                            label="Type"
                            active={sortKey === "type"}
                            direction={sortDirection}
                            onClick={() => updateSort("type")}
                          />
                        </th>
                        <th scope="col">
                          <SortButton
                            label="Status"
                            active={sortKey === "status"}
                            direction={sortDirection}
                            onClick={() => updateSort("status")}
                          />
                        </th>
                        <th scope="col">
                          <SortButton
                            label="Priority"
                            active={sortKey === "priority"}
                            direction={sortDirection}
                            onClick={() => updateSort("priority")}
                          />
                        </th>
                        <th scope="col">Duration</th>
                        <th scope="col">
                          <SortButton
                            label="Created"
                            active={sortKey === "created_at"}
                            direction={sortDirection}
                            onClick={() => updateSort("created_at")}
                          />
                        </th>
                        <th scope="col">Worker</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredJobs.map((job) => {
                        const status = normalizeStatus(job.status);
                        return (
                          <tr key={job.id}>
                            <td className="sq-job-cell">
                              <div className="sq-job-name">{job.name}</div>
                              <div className="sq-job-id">{job.id.slice(0, 12)}</div>
                            </td>
                            <td>
                              <TypePill type={job.type} />
                            </td>
                            <td>
                              <StatusPill status={status} />
                            </td>
                            <td>
                              <div className="sq-priority">
                                <span>{job.priority.toFixed(3)}</span>
                                <span className="sq-priority-track" aria-hidden="true">
                                  <span
                                    className="sq-priority-fill"
                                    style={{
                                      width: `${priorityPercent(job.priority)}%`,
                                      background: `rgba(255,255,255,${(job.priority * 0.6).toFixed(2)})`,
                                    }}
                                  />
                                </span>
                              </div>
                            </td>
                            <td>{duration(job.started_at, job.finished_at) ?? "-"}</td>
                            <td>{timeAgo(job.created_at)}</td>
                            <td>{status === "running" ? "allocated" : "unassigned"}</td>
                            <td>
                              <button
                                className="sq-action-button"
                                type="button"
                                onClick={() => setSelectedJob(job)}
                              >
                                <Eye size={13} aria-hidden="true" />
                                Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </section>

          <section className="sq-grid sq-aux-grid" style={{ marginTop: 14 }}>
            <section className="sq-card" aria-labelledby="recent-title">
              <div className="sq-card-header">
                <div>
                  <h2 id="recent-title" className="sq-card-title">
                    Recent Executions
                  </h2>
                  <p className="sq-card-description">Latest terminal outcomes from the queue.</p>
                </div>
              </div>
              <div className="sq-feed">
                {recentExecutions.length === 0 ? (
                  <div className="sq-empty">
                    <div>
                      <strong>No completed runs yet</strong>
                      <span>Executions will appear here after workers finish jobs.</span>
                    </div>
                  </div>
                ) : (
                  recentExecutions.map((job) => (
                    <button
                      key={job.id}
                      className="sq-feed-item"
                      type="button"
                      onClick={() => setSelectedJob(job)}
                    >
                      <StatusPill status={normalizeStatus(job.status)} />
                      <div>
                        <div className="sq-feed-title">{job.name}</div>
                        <div className="sq-feed-meta">
                          {job.type} / {duration(job.started_at, job.finished_at) ?? "-"}
                        </div>
                      </div>
                      <div className="sq-feed-meta">{timeAgo(job.created_at)}</div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="sq-card" aria-labelledby="workers-title">
              <div className="sq-card-header">
                <div>
                  <h2 id="workers-title" className="sq-card-title">
                    Worker Status
                  </h2>
                  <p className="sq-card-description">Heartbeat and throughput snapshot.</p>
                </div>
              </div>
              <div>
                {workers.length === 0 ? (
                  <div className="sq-empty">
                    <div>
                      <strong>No workers registered</strong>
                      <span>Start a worker to process queued jobs.</span>
                    </div>
                  </div>
                ) : (
                  workers.slice(0, 5).map((worker) => {
                    const alive = worker.seconds_since_heartbeat < 15;
                    return (
                      <div className="sq-worker-row" key={worker.worker_id}>
                        <span
                          className="sq-status-pill"
                          data-status={alive ? "done" : "queued"}
                        >
                          <span className="sq-status-dot" aria-hidden="true" />
                          {alive ? "Active" : "Idle"}
                        </span>
                        <div>
                          <div className="sq-worker-title">{worker.worker_id}</div>
                          <div className="sq-worker-meta">{worker.hostname}</div>
                        </div>
                        <div className="sq-worker-meta">
                          {worker.jobs_processed} jobs
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="sq-card" aria-labelledby="health-title">
              <div className="sq-card-header">
                <div>
                  <h2 id="health-title" className="sq-card-title">
                    System Health
                  </h2>
                  <p className="sq-card-description">Operational readiness checks.</p>
                </div>
                <AlertTriangle size={16} color="var(--sq-text-subtle)" aria-hidden="true" />
              </div>
              <div>
                {healthRows.map((row) => (
                  <div className="sq-health-row" key={row.label}>
                    <div>
                      <div className="sq-feed-title">{row.label}</div>
                      <div className="sq-health-meta">{row.value}</div>
                    </div>
                    <StatusPill status={row.status} />
                  </div>
                ))}
              </div>
            </section>
          </section>
        </main>
      </div>

      {selectedJob && (
        <div
          className="sq-modal-backdrop"
          role="presentation"
          onClick={() => setSelectedJob(null)}
        >
          <section
            className="sq-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sq-modal-header">
              <div>
                <h2 id="job-detail-title" className="sq-modal-title">
                  {selectedJob.name}
                </h2>
                <p className="sq-card-description">{selectedJob.id}</p>
              </div>
              <button
                className="sq-icon-button"
                type="button"
                aria-label="Close job detail"
                onClick={() => setSelectedJob(null)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="sq-modal-body">
              <div className="sq-detail-grid">
                {[
                  ["Type", selectedJob.type],
                  ["Status", statusCopy[normalizeStatus(selectedJob.status)].label],
                  ["Priority", selectedJob.priority.toFixed(4)],
                  ["Retries", String(selectedJob.retry_count)],
                  ["Created", formatDate(selectedJob.created_at)],
                  ["Started", formatDate(selectedJob.started_at)],
                  ["Finished", formatDate(selectedJob.finished_at)],
                  [
                    "Duration",
                    duration(selectedJob.started_at, selectedJob.finished_at) ?? "-",
                  ],
                ].map(([label, value]) => (
                  <div className="sq-detail" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>

              <div>
                <p className="sq-kicker">Payload</p>
                <pre className="sq-code">
                  {JSON.stringify(selectedJob.payload, null, 2)}
                </pre>
              </div>

              {selectedJob.error_msg && (
                <div>
                  <p className="sq-kicker">Error</p>
                  <pre className="sq-code sq-code-error">{selectedJob.error_msg}</pre>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
