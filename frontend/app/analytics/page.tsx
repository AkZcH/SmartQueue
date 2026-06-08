"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ScatterChart,
  Scatter,
} from "recharts";
import Topbar from "../components/Topbar";

const API = "http://localhost:8000";

interface Summary {
  counts: {
    total_done: number;
    total_failed: number;
    total_queued: number;
    total_running: number;
    success_rate: number;
  };
  by_type: {
    type: string;
    avg_actual_ms: number;
    avg_predicted_ms: number;
    total: number;
  }[];
  prediction_mape_pct: number | null;
}

interface Worker {
  worker_id: string;
  hostname: string;
  status: string;
  last_seen: string;
  jobs_processed: number;
  seconds_since_heartbeat: number;
}

interface ThroughputPoint {
  bucket: string;
  done: number;
  failed: number;
}

interface RawThroughputPoint {
  bucket: string;
  done: number;
  failed: number;
}

interface AccuracyPoint {
  type: string;
  actual_ms: number;
  predicted_ms: number;
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  etl:   { bg: "#0d1b2b", border: "#1d4ed8", text: "#60a5fa" },
  ml:    { bg: "#1a0d2b", border: "#7c3aed", text: "#a78bfa" },
  http:  { bg: "#0d2b1e", border: "#166534", text: "#4ade80" },
  shell: { bg: "#2b1a0d", border: "#c2410c", text: "#fb923c" },
};

const fmt = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

export default function Analytics() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [throughput, setThroughput] = useState<ThroughputPoint[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyPoint[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);

  useEffect(() => {
    axios.get(`${API}/analytics/summary`).then((r) => setSummary(r.data));
    axios.get<RawThroughputPoint[]>(`${API}/analytics/throughput`).then((r) =>
      setThroughput(
        r.data.map((d) => ({
          ...d,
          bucket: new Date(d.bucket).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        })),
      ),
    );
    axios
      .get<AccuracyPoint[]>(`${API}/analytics/prediction-accuracy`)
      .then((r) => setAccuracy(r.data));

    const token = localStorage.getItem("token");
    axios
      .get(`${API}/jobs/workers`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((r) => setWorkers(r.data));
  }, []);

  const tooltipStyle = {
    background: "#0a0a0a",
    border: "1px solid #1a1a1a",
    borderRadius: 7,
    fontSize: 12,
    fontFamily: "var(--sq-font-mono)",
    color: "#ededed",
  };
  const axisTickStyle = { fontSize: 10, fill: "#52525b", fontFamily: "var(--sq-font-mono)" };

  return (
    <div className="sq-page">
      <style>{`
        .an-wrap { max-width: 1100px; margin: 0 auto; padding: 0 clamp(16px,2vw,32px) 80px; }
        .an-metrics {
          display: grid; grid-template-columns: repeat(5, 1fr);
          gap: 1px; background: #1a1a1a; border: 1px solid #1a1a1a;
          border-radius: 9px; overflow: hidden; margin-bottom: 16px;
        }
        .an-metric { background: #0a0a0a; padding: 18px 20px; }
        .an-metric-label { font-size: 10px; color: #52525b; text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--sq-font-mono); margin-bottom: 8px; font-variant-numeric: tabular-nums; }
        .an-metric-value { font-size: 24px; font-weight: 600; letter-spacing: -0.03em; font-family: var(--sq-font-mono); color: #ededed; font-variant-numeric: tabular-nums; }
        .an-metric-value.green { color: #4ade80; }
        .an-metric-value.red { color: #f87171; }
        .an-metric-value.blue { color: #60a5fa; }
        .an-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #1a1a1a; border: 1px solid #1a1a1a; border-radius: 9px; overflow: hidden; margin-bottom: 16px; }
        .an-card { background: #0a0a0a; overflow: hidden; }
        .an-card-solo { background: #0a0a0a; border: 1px solid #1a1a1a; border-radius: 9px; overflow: hidden; margin-bottom: 16px; }
        .an-card-header { padding: 11px 18px; border-bottom: 1px solid #1a1a1a; }
        .an-card-title { font-size: 10px; font-weight: 500; color: #52525b; text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--sq-font-mono); }
        .an-card-body { padding: 18px; }
        .an-empty { padding: 40px; text-align: center; font-size: 12px; font-family: var(--sq-font-mono); color: #52525b; }
        .an-type-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #1a1a1a; }
        .an-type-row:last-child { border-bottom: none; }
        .an-type-tag { font-size: 10px; font-family: var(--sq-font-mono); padding: 3px 8px; border-radius: 999px; font-weight: 500; text-transform: uppercase; border: 1px solid; letter-spacing: 0.04em; }
        .an-type-vals { display: flex; gap: 24px; }
        .an-type-val { text-align: right; }
        .an-type-val-label { font-size: 10px; color: #52525b; font-family: var(--sq-font-mono); margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.06em; }
        .an-type-val-num { font-size: 13px; font-family: var(--sq-font-mono); color: #ededed; font-variant-numeric: tabular-nums; }
        .an-worker-row { display: grid; grid-template-columns: 12px 1fr 80px 80px 60px; align-items: center; gap: 16px; padding: 11px 18px; border-bottom: 1px solid #1a1a1a; }
        .an-worker-row:last-child { border-bottom: none; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @media (max-width: 700px) { .an-metrics { grid-template-columns: repeat(2,1fr); } .an-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="sq-shell">
        <Topbar active="analytics" />

        <div className="an-wrap">
          {summary && (
            <div className="an-metrics">
              <div className="an-metric">
                <div className="an-metric-label">Completed</div>
                <div className="an-metric-value green">{summary.counts.total_done}</div>
              </div>
              <div className="an-metric">
                <div className="an-metric-label">Failed</div>
                <div className="an-metric-value red">{summary.counts.total_failed}</div>
              </div>
              <div className="an-metric">
                <div className="an-metric-label">Queued</div>
                <div className="an-metric-value">{summary.counts.total_queued}</div>
              </div>
              <div className="an-metric">
                <div className="an-metric-label">Success Rate</div>
                <div className="an-metric-value green">{summary.counts.success_rate}%</div>
              </div>
              <div className="an-metric">
                <div className="an-metric-label">Pred. Error</div>
                <div className="an-metric-value blue">
                  {summary.prediction_mape_pct != null ? `${summary.prediction_mape_pct}%` : "—"}
                </div>
              </div>
            </div>
          )}

          <div className="an-grid">
            <div className="an-card">
              <div className="an-card-header">
                <div className="an-card-title">Throughput — last 24h</div>
              </div>
              <div className="an-card-body">
                {throughput.length === 0 ? (
                  <div className="an-empty">No data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={throughput} barSize={14}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                      <XAxis dataKey="bucket" tick={axisTickStyle} />
                      <YAxis tick={axisTickStyle} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#a1a1aa" }} />
                      <Bar dataKey="done" fill="#4ade80" radius={[3, 3, 0, 0]} name="Done" />
                      <Bar dataKey="failed" fill="#f87171" radius={[3, 3, 0, 0]} name="Failed" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="an-card">
              <div className="an-card-header">
                <div className="an-card-title">Avg Runtime by Type</div>
              </div>
              <div className="an-card-body">
                {!summary || summary.by_type.length === 0 ? (
                  <div className="an-empty">No data yet</div>
                ) : (
                  summary.by_type.map((t) => (
                    <div className="an-type-row" key={t.type}>
                      <span
                        className="an-type-tag"
                        style={{
                          background: TYPE_COLORS[t.type]?.bg ?? "#111",
                          borderColor: TYPE_COLORS[t.type]?.border ?? "#222",
                          color: TYPE_COLORS[t.type]?.text ?? "#a1a1aa",
                        }}
                      >
                        {t.type}
                      </span>
                      <div className="an-type-vals">
                        <div className="an-type-val">
                          <div className="an-type-val-label">actual</div>
                          <div className="an-type-val-num">{fmt(t.avg_actual_ms)}</div>
                        </div>
                        <div className="an-type-val">
                          <div className="an-type-val-label">predicted</div>
                          <div className="an-type-val-num">{fmt(t.avg_predicted_ms)}</div>
                        </div>
                        <div className="an-type-val">
                          <div className="an-type-val-label">jobs</div>
                          <div className="an-type-val-num">{t.total}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="an-card-solo">
            <div className="an-card-header">
              <div className="an-card-title">Prediction Accuracy — Actual vs Predicted Runtime</div>
            </div>
            <div className="an-card-body">
              {accuracy.length === 0 ? (
                <div className="an-empty">No prediction data yet — submit and complete some jobs</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                    <XAxis
                      dataKey="actual_ms"
                      name="Actual (ms)"
                      type="number"
                      tick={axisTickStyle}
                      label={{ value: "Actual ms", position: "insideBottom", offset: -4, fill: "#52525b", fontSize: 10 }}
                    />
                    <YAxis
                      dataKey="predicted_ms"
                      name="Predicted (ms)"
                      type="number"
                      tick={axisTickStyle}
                      label={{ value: "Predicted ms", angle: -90, position: "insideLeft", fill: "#52525b", fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => value == null ? "-" : `${String(value)}ms`}
                    />
                    {["etl", "ml", "http", "shell"].map((type) => (
                      <Scatter
                        key={type}
                        name={type}
                        data={accuracy.filter((a) => a.type === type)}
                        fill={TYPE_COLORS[type]?.text ?? "#a1a1aa"}
                        opacity={0.85}
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="an-card-solo">
            <div
              className="an-card-header"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
              <div className="an-card-title">Worker Pool</div>
              <span style={{ fontSize: 11, fontFamily: "var(--sq-font-mono)", color: "#52525b" }}>
                {workers.filter((w) => w.seconds_since_heartbeat < 15).length} active
              </span>
            </div>
            <div style={{ padding: 0 }}>
              {workers.length === 0 ? (
                <div className="an-empty">No workers registered</div>
              ) : (
                workers.map((w) => {
                  const alive = w.seconds_since_heartbeat < 15;
                  return (
                    <div key={w.worker_id} className="an-worker-row">
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: alive ? "#4ade80" : "#3f3f46",
                          animation: alive ? "blink 2s ease-in-out infinite" : "none",
                        }}
                      />
                      <div>
                        <div style={{ fontSize: 12, fontFamily: "var(--sq-font-mono)", color: "#ededed" }}>
                          {w.worker_id}
                        </div>
                        <div style={{ fontSize: 11, fontFamily: "var(--sq-font-mono)", color: "#52525b", marginTop: 2 }}>
                          {w.hostname}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: "var(--sq-font-mono)", color: alive ? "#4ade80" : "#52525b", textAlign: "right" }}>
                        {alive ? "active" : "offline"}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "#52525b", fontFamily: "var(--sq-font-mono)", marginBottom: 2 }}>jobs done</div>
                        <div style={{ fontSize: 13, fontFamily: "var(--sq-font-mono)", color: "#ededed", fontVariantNumeric: "tabular-nums" }}>
                          {w.jobs_processed}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: "var(--sq-font-mono)", color: "#52525b", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {alive ? `${w.seconds_since_heartbeat}s ago` : "dead"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
