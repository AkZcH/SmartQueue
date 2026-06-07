"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import Topbar from "./components/Topbar";

// Attach JWT token to every request
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
axios.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

interface Job {
  id: string;
  name: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  priority: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  retry_count: number;
  error_msg: string | null;
}

const API = "http://localhost:8000";

const TYPE_COLORS: Record<string, string> = {
  etl: "#3b82f6",
  ml: "#a855f7",
  http: "#10b981",
  shell: "#f59e0b",
};

const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; dot: string }
> = {
  queued: { color: "#94a3b8", bg: "#1e293b", dot: "#475569" },
  running: { color: "#38bdf8", bg: "#0c1a2e", dot: "#38bdf8" },
  done: { color: "#4ade80", bg: "#052e16", dot: "#4ade80" },
  failed: { color: "#f87171", bg: "#2d0a0a", dot: "#f87171" },
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function duration(start: string | null, end: string | null) {
  if (!start) return null;
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [form, setForm] = useState({
    name: "",
    type: "etl",
    payload: '{"file": "data.csv"}',
  });
  const [submitting, setSubmitting] = useState(false);
  const [tick, setTick] = useState(0);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const fetchJobs = async () => {
    try {
      const res = await axios.get(`${API}/jobs/`);
      setJobs(res.data);
    } catch {}
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(() => {
      fetchJobs();
      setTick((t) => t + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const submitJob = async () => {
    if (!form.name) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/jobs/`, {
        name: form.name,
        type: form.type,
        payload: JSON.parse(form.payload),
      });
      setForm((f) => ({ ...f, name: "" }));
      fetchJobs();
    } catch {}
    setSubmitting(false);
  };

  const counts = {
    queued: jobs.filter((j) => j.status === "queued").length,
    running: jobs.filter((j) => j.status === "running").length,
    done: jobs.filter((j) => j.status === "done").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@300;400;500&family=Geist:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #0a0a0a;
          --surface: #111111;
          --surface2: #1a1a1a;
          --border: #222222;
          --border2: #2a2a2a;
          --text: #ededed;
          --text2: #a1a1aa;
          --text3: #52525b;
          --accent: #ededed;
          --font: 'Geist', sans-serif;
          --mono: 'Geist Mono', monospace;
        }

        html, body { background: var(--bg); color: var(--text); font-family: var(--font); min-height: 100vh; }

        .app {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 24px 80px;
        }

        /* TOPBAR */
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 0 40px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 40px;
        }
        .logo {
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.02em;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .logo-icon {
          width: 22px;
          height: 22px;
          background: var(--text);
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .logo-icon svg { color: var(--bg); }
        .live-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text3);
          font-family: var(--mono);
        }
        .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4ade80;
          box-shadow: 0 0 8px #4ade80;
          animation: blink 2s ease-in-out infinite;
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

        /* METRICS */
        .metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: var(--border);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 32px;
        }
        .metric {
          background: var(--surface);
          padding: 20px 24px;
          transition: background 0.2s;
        }
        .metric:hover { background: var(--surface2); }
        .metric-label {
          font-size: 11px;
          color: var(--text3);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-family: var(--mono);
          margin-bottom: 8px;
        }
        .metric-value {
          font-size: 28px;
          font-weight: 600;
          letter-spacing: -0.04em;
          font-family: var(--mono);
        }
        .metric-value.queued  { color: #94a3b8; }
        .metric-value.running { color: #38bdf8; }
        .metric-value.done    { color: #4ade80; }
        .metric-value.failed  { color: #f87171; }

        /* LAYOUT */
        .layout {
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 16px;
          align-items: start;
        }

        /* CARD */
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }
        .card-header {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .card-title {
          font-size: 12px;
          font-weight: 500;
          color: var(--text2);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-family: var(--mono);
        }

        /* SUBMIT FORM */
        .form-body { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        .field-label {
          font-size: 11px;
          color: var(--text3);
          font-family: var(--mono);
          margin-bottom: 5px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .input, .select, .textarea {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--border2);
          border-radius: 8px;
          padding: 9px 12px;
          font-size: 13px;
          color: var(--text);
          font-family: var(--font);
          outline: none;
          transition: border-color 0.15s;
          appearance: none;
        }
        .input:focus, .select:focus, .textarea:focus {
          border-color: #444;
        }
        .input::placeholder { color: var(--text3); }
        .textarea { font-family: var(--mono); font-size: 12px; resize: none; line-height: 1.6; }
        .select { cursor: pointer; }
        .select option { background: var(--surface); }

        .type-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
        }
        .type-btn {
          padding: 8px;
          border-radius: 7px;
          border: 1px solid var(--border2);
          background: var(--bg);
          font-size: 12px;
          font-family: var(--mono);
          color: var(--text3);
          cursor: pointer;
          transition: all 0.15s;
          text-align: center;
        }
        .type-btn:hover { border-color: #444; color: var(--text2); }
        .type-btn.active {
          border-color: transparent;
          color: #000;
          font-weight: 500;
        }
        .type-btn.active.etl   { background: #3b82f6; color: #fff; }
        .type-btn.active.ml    { background: #a855f7; color: #fff; }
        .type-btn.active.http  { background: #10b981; color: #fff; }
        .type-btn.active.shell { background: #f59e0b; color: #000; }

        .submit-btn {
          width: 100%;
          padding: 10px;
          border-radius: 8px;
          border: none;
          background: var(--text);
          color: var(--bg);
          font-size: 13px;
          font-weight: 500;
          font-family: var(--font);
          cursor: pointer;
          transition: opacity 0.15s;
          letter-spacing: -0.01em;
        }
        .submit-btn:hover { opacity: 0.85; }
        .submit-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        /* JOB TABLE */
        .job-list { divide: none; }
        .job-row {
          display: grid;
          grid-template-columns: 1fr 80px 100px 70px 60px;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          border-bottom: 1px solid var(--border);
          cursor: pointer;
          transition: background 0.1s;
        }
        .job-row:last-child { border-bottom: none; }
        .job-row:hover { background: var(--surface2); }
        .job-row.header {
          padding: 10px 20px;
          background: var(--bg);
          cursor: default;
        }
        .job-row.header:hover { background: var(--bg); }
        .col-label {
          font-size: 10px;
          color: var(--text3);
          font-family: var(--mono);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .job-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .job-id {
          font-size: 11px;
          color: var(--text3);
          font-family: var(--mono);
          margin-top: 2px;
        }

        .type-tag {
          display: inline-block;
          font-size: 10px;
          font-family: var(--mono);
          padding: 3px 8px;
          border-radius: 4px;
          font-weight: 500;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .status-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-family: var(--mono);
        }
        .status-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .status-dot.running { animation: blink 1s ease-in-out infinite; }

        .priority-cell {
          font-size: 12px;
          font-family: var(--mono);
          color: var(--text3);
          text-align: right;
        }
        .priority-bar {
          height: 2px;
          background: var(--border2);
          border-radius: 1px;
          margin-top: 4px;
          overflow: hidden;
        }
        .priority-fill {
          height: 100%;
          border-radius: 1px;
          background: #ededed;
          opacity: 0.4;
        }

        .time-cell {
          font-size: 11px;
          font-family: var(--mono);
          color: var(--text3);
          text-align: right;
        }

        .empty-state {
          padding: 60px 20px;
          text-align: center;
          color: var(--text3);
          font-size: 13px;
          font-family: var(--mono);
        }

        /* DETAIL MODAL */
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(4px);
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          animation: fadeIn 0.15s ease;
        }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .modal {
          background: var(--surface);
          border: 1px solid var(--border2);
          border-radius: 16px;
          width: 100%;
          max-width: 480px;
          overflow: hidden;
          animation: slideUp 0.2s ease;
        }
        @keyframes slideUp { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
        .modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .modal-title { font-size: 14px; font-weight: 500; letter-spacing: -0.02em; }
        .close-btn {
          background: none;
          border: none;
          color: var(--text3);
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          padding: 2px 6px;
          border-radius: 4px;
          transition: color 0.15s;
        }
        .close-btn:hover { color: var(--text); }
        .modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
        .detail-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .detail-key { font-size: 12px; color: var(--text3); font-family: var(--mono); flex-shrink: 0; }
        .detail-val { font-size: 12px; color: var(--text); font-family: var(--mono); text-align: right; word-break: break-all; }
        .payload-box {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
          font-size: 12px;
          font-family: var(--mono);
          color: var(--text2);
          line-height: 1.6;
          white-space: pre-wrap;
        }

        @media (max-width: 768px) {
          .layout { grid-template-columns: 1fr; }
          .metrics { grid-template-columns: repeat(2,1fr); }
          .job-row { grid-template-columns: 1fr 80px 70px; }
          .col-time, .time-cell, .col-dur, .dur-cell { display: none; }
        }
      `}</style>

      <div className="app">
        {/* Topbar */}
        <div className="topbar">
          {/* Topbar */}
          <Topbar active="queue" />
          <div style={{ display: "flex", gap: 4 }}>
            <Link
              href="/"
              style={{
                fontSize: 12,
                fontFamily: "var(--mono)",
                color: "var(--text)",
                textDecoration: "none",
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--border2)",
                background: "var(--surface2)",
              }}
            >
              Queue
            </Link>
            <Link
              href="/analytics"
              style={{
                fontSize: 12,
                fontFamily: "var(--mono)",
                color: "var(--text3)",
                textDecoration: "none",
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid transparent",
                transition: "all 0.15s",
              }}
            >
              Analytics
            </Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => {
                localStorage.removeItem("token");
                window.location.href = "/login";
              }}
              style={{
                fontSize: 12,
                fontFamily: "var(--mono)",
                color: "var(--text3)",
                background: "none",
                border: "1px solid var(--border2)",
                borderRadius: 6,
                padding: "6px 12px",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
            >
              logout
            </button>
            <div className="live-badge">
              <div className="live-dot" />
              live
            </div>
          </div>
          <div className="live-badge">
            <div className="live-dot" />
            live
          </div>
        </div>

        {/* Metrics */}
        <div className="metrics">
          {[
            { key: "queued", label: "Queued" },
            { key: "running", label: "Running" },
            { key: "done", label: "Completed" },
            { key: "failed", label: "Failed" },
          ].map((m) => (
            <div className="metric" key={m.key}>
              <div className="metric-label">{m.label}</div>
              <div className={`metric-value ${m.key}`}>
                {counts[m.key as keyof typeof counts]}
              </div>
            </div>
          ))}
        </div>

        {/* Main Layout */}
        <div className="layout">
          {/* Submit Form */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">New Job</span>
            </div>
            <div className="form-body">
              <div>
                <div className="field-label">Name</div>
                <input
                  className="input"
                  placeholder="job-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && submitJob()}
                />
              </div>
              <div>
                <div className="field-label">Type</div>
                <div className="type-grid">
                  {["etl", "ml", "http", "shell"].map((t) => (
                    <button
                      key={t}
                      className={`type-btn ${t} ${form.type === t ? "active" : ""}`}
                      onClick={() => setForm({ ...form, type: t })}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="field-label">Payload</div>
                <textarea
                  className="textarea"
                  rows={4}
                  value={form.payload}
                  onChange={(e) =>
                    setForm({ ...form, payload: e.target.value })
                  }
                />
              </div>
              <button
                className="submit-btn"
                onClick={submitJob}
                disabled={submitting || !form.name}
              >
                {submitting ? "Submitting..." : "Deploy Job →"}
              </button>
            </div>
          </div>

          {/* Job Queue */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Job Queue</span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  color: "var(--text3)",
                }}
              >
                {jobs.length} total
              </span>
            </div>
            <div className="job-row header">
              <div className="col-label">Job</div>
              <div className="col-label" style={{ textAlign: "right" }}>
                Status
              </div>
              <div className="col-label" style={{ textAlign: "right" }}>
                Priority
              </div>
              <div className="col-label col-dur" style={{ textAlign: "right" }}>
                Duration
              </div>
              <div
                className="col-label col-time"
                style={{ textAlign: "right" }}
              >
                When
              </div>
            </div>
            {jobs.length === 0 ? (
              <div className="empty-state">No jobs yet — deploy one →</div>
            ) : (
              jobs.map((job) => {
                const sc = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.queued;
                const tc = TYPE_COLORS[job.type] ?? "#888";
                return (
                  <div
                    key={job.id}
                    className="job-row"
                    onClick={() => setSelectedJob(job)}
                  >
                    <div>
                      <div className="job-name">{job.name}</div>
                      <div className="job-id">
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: 10,
                            fontFamily: "var(--mono)",
                            padding: "1px 6px",
                            borderRadius: 3,
                            marginRight: 5,
                            background: tc + "22",
                            color: tc,
                          }}
                        >
                          {job.type}
                        </span>
                        {job.id.slice(0, 8)}
                      </div>
                    </div>
                    <div
                      className="status-badge"
                      style={{ justifyContent: "flex-end" }}
                    >
                      <div
                        className={`status-dot ${job.status}`}
                        style={{ background: sc.dot }}
                      />
                      <span style={{ color: sc.color }}>{job.status}</span>
                    </div>
                    <div className="priority-cell">
                      {job.priority.toFixed(3)}
                      <div className="priority-bar">
                        <div
                          className="priority-fill"
                          style={{ width: `${job.priority * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="time-cell">
                      {duration(job.started_at, job.finished_at) ?? "—"}
                    </div>
                    <div className="time-cell">{timeAgo(job.created_at)}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="overlay" onClick={() => setSelectedJob(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{selectedJob.name}</div>
              <button
                className="close-btn"
                onClick={() => setSelectedJob(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {[
                { k: "id", v: selectedJob.id },
                { k: "type", v: selectedJob.type },
                { k: "status", v: selectedJob.status },
                { k: "priority", v: selectedJob.priority.toFixed(4) },
                { k: "retry_count", v: String(selectedJob.retry_count) },
                {
                  k: "created_at",
                  v: new Date(selectedJob.created_at).toLocaleString(),
                },
                {
                  k: "started_at",
                  v: selectedJob.started_at
                    ? new Date(selectedJob.started_at).toLocaleString()
                    : "—",
                },
                {
                  k: "finished_at",
                  v: selectedJob.finished_at
                    ? new Date(selectedJob.finished_at).toLocaleString()
                    : "—",
                },
                {
                  k: "duration",
                  v:
                    duration(selectedJob.started_at, selectedJob.finished_at) ??
                    "—",
                },
              ].map(({ k, v }) => (
                <div className="detail-row" key={k}>
                  <div className="detail-key">{k}</div>
                  <div className="detail-val">{v}</div>
                </div>
              ))}
              <div>
                <div className="detail-key" style={{ marginBottom: 8 }}>
                  payload
                </div>
                <div className="payload-box">
                  {JSON.stringify(selectedJob.payload, null, 2)}
                </div>
              </div>
              {selectedJob.error_msg && (
                <div>
                  <div
                    className="detail-key"
                    style={{ marginBottom: 8, color: "#f87171" }}
                  >
                    error
                  </div>
                  <div className="payload-box" style={{ color: "#f87171" }}>
                    {selectedJob.error_msg}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
