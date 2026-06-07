"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import {
  LineChart,
  Line,
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
import Link from "next/link";

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

const TYPE_COLORS: Record<string, string> = {
  etl: "#3b82f6",
  ml: "#a855f7",
  http: "#10b981",
  shell: "#f59e0b",
};

const fmt = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

export default function Analytics() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [throughput, setThroughput] = useState<any[]>([]);
  const [accuracy, setAccuracy] = useState<any[]>([]);

  useEffect(() => {
    axios.get(`${API}/analytics/summary`).then((r) => setSummary(r.data));
    axios.get(`${API}/analytics/throughput`).then((r) =>
      setThroughput(
        r.data.map((d: any) => ({
          ...d,
          bucket: new Date(d.bucket).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        })),
      ),
    );
    axios
      .get(`${API}/analytics/prediction-accuracy`)
      .then((r) => setAccuracy(r.data));
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@300;400;500&family=Geist:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0a0a0a; --surface: #111111; --surface2: #1a1a1a;
          --border: #222222; --border2: #2a2a2a;
          --text: #ededed; --text2: #a1a1aa; --text3: #52525b;
          --font: 'Geist', sans-serif; --mono: 'Geist Mono', monospace;
        }
        html, body { background: var(--bg); color: var(--text); font-family: var(--font); }
        .app { max-width: 1100px; margin: 0 auto; padding: 0 24px 80px; }
        .topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 0 40px; border-bottom: 1px solid var(--border); margin-bottom: 40px;
        }
        .logo { font-size: 15px; font-weight: 500; letter-spacing: -0.02em; display: flex; align-items: center; gap: 8px; }
        .nav { display: flex; gap: 4px; }
        .nav a {
          font-size: 12px; font-family: var(--mono); color: var(--text3);
          text-decoration: none; padding: 6px 12px; border-radius: 6px;
          border: 1px solid transparent; transition: all 0.15s;
        }
        .nav a:hover { color: var(--text2); border-color: var(--border2); }
        .nav a.active { color: var(--text); border-color: var(--border2); background: var(--surface2); }
        .metrics {
          display: grid; grid-template-columns: repeat(5, 1fr);
          gap: 1px; background: var(--border); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden; margin-bottom: 32px;
        }
        .metric { background: var(--surface); padding: 20px 24px; }
        .metric-label { font-size: 11px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--mono); margin-bottom: 8px; }
        .metric-value { font-size: 24px; font-weight: 600; letter-spacing: -0.04em; font-family: var(--mono); color: var(--text); }
        .metric-value.green { color: #4ade80; }
        .metric-value.red { color: #f87171; }
        .metric-value.blue { color: #38bdf8; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .card-header { padding: 16px 20px; border-bottom: 1px solid var(--border); }
        .card-title { font-size: 12px; font-weight: 500; color: var(--text2); text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--mono); }
        .card-body { padding: 20px; }
        .empty { padding: 40px; text-align: center; font-size: 12px; font-family: var(--mono); color: var(--text3); }
        .type-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 0; border-bottom: 1px solid var(--border);
        }
        .type-row:last-child { border-bottom: none; }
        .type-tag {
          font-size: 11px; font-family: var(--mono); padding: 3px 8px;
          border-radius: 4px; font-weight: 500; text-transform: uppercase;
        }
        .type-vals { display: flex; gap: 24px; }
        .type-val { text-align: right; }
        .type-val-label { font-size: 10px; color: var(--text3); font-family: var(--mono); margin-bottom: 2px; }
        .type-val-num { font-size: 13px; font-family: var(--mono); color: var(--text); }
        .scatter-dot { opacity: 0.7; }
      `}</style>

      <div className="app">
        <div className="topbar">
          <div className="logo">
            <div
              style={{
                width: 22,
                height: 22,
                background: "var(--text)",
                borderRadius: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1" y="1" width="4" height="4" fill="#0a0a0a" />
                <rect
                  x="7"
                  y="1"
                  width="4"
                  height="4"
                  fill="#0a0a0a"
                  opacity="0.6"
                />
                <rect
                  x="1"
                  y="7"
                  width="4"
                  height="4"
                  fill="#0a0a0a"
                  opacity="0.6"
                />
                <rect
                  x="7"
                  y="7"
                  width="4"
                  height="4"
                  fill="#0a0a0a"
                  opacity="0.3"
                />
              </svg>
            </div>
            SmartQueue
          </div>
          <div className="nav">
            <Link href="/" className="nav a">
              Queue
            </Link>
            <Link href="/analytics" className="nav a active">
              Analytics
            </Link>
          </div>
        </div>

        {/* Summary Metrics */}
        {summary && (
          <div className="metrics">
            <div className="metric">
              <div className="metric-label">Completed</div>
              <div className="metric-value green">
                {summary.counts.total_done}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Failed</div>
              <div className="metric-value red">
                {summary.counts.total_failed}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Queued</div>
              <div className="metric-value">{summary.counts.total_queued}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Success Rate</div>
              <div className="metric-value green">
                {summary.counts.success_rate}%
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Pred. Error</div>
              <div className="metric-value blue">
                {summary.prediction_mape_pct != null
                  ? `${summary.prediction_mape_pct}%`
                  : "—"}
              </div>
            </div>
          </div>
        )}

        <div className="grid">
          {/* Throughput Chart */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Throughput — last 24h</div>
            </div>
            <div className="card-body">
              {throughput.length === 0 ? (
                <div className="empty">No data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={throughput} barSize={16}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#222"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="bucket"
                      tick={{
                        fontSize: 10,
                        fill: "#52525b",
                        fontFamily: "var(--mono)",
                      }}
                    />
                    <YAxis
                      tick={{
                        fontSize: 10,
                        fill: "#52525b",
                        fontFamily: "var(--mono)",
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#111",
                        border: "1px solid #222",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "#a1a1aa" }}
                    />
                    <Bar
                      dataKey="done"
                      fill="#4ade80"
                      radius={[3, 3, 0, 0]}
                      name="Done"
                    />
                    <Bar
                      dataKey="failed"
                      fill="#f87171"
                      radius={[3, 3, 0, 0]}
                      name="Failed"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Runtime by type */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Avg Runtime by Type</div>
            </div>
            <div className="card-body">
              {!summary || summary.by_type.length === 0 ? (
                <div className="empty">No data yet</div>
              ) : (
                summary.by_type.map((t) => (
                  <div className="type-row" key={t.type}>
                    <span
                      className="type-tag"
                      style={{
                        background: TYPE_COLORS[t.type] + "22",
                        color: TYPE_COLORS[t.type],
                      }}
                    >
                      {t.type}
                    </span>
                    <div className="type-vals">
                      <div className="type-val">
                        <div className="type-val-label">actual</div>
                        <div className="type-val-num">
                          {fmt(t.avg_actual_ms)}
                        </div>
                      </div>
                      <div className="type-val">
                        <div className="type-val-label">predicted</div>
                        <div className="type-val-num">
                          {fmt(t.avg_predicted_ms)}
                        </div>
                      </div>
                      <div className="type-val">
                        <div className="type-val-label">jobs</div>
                        <div className="type-val-num">{t.total}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Prediction Accuracy Scatter */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              Prediction Accuracy — Actual vs Predicted Runtime
            </div>
          </div>
          <div className="card-body">
            {accuracy.length === 0 ? (
              <div className="empty">
                No prediction data yet — submit and complete some jobs
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis
                    dataKey="actual_ms"
                    name="Actual (ms)"
                    type="number"
                    tick={{
                      fontSize: 10,
                      fill: "#52525b",
                      fontFamily: "var(--mono)",
                    }}
                    label={{
                      value: "Actual ms",
                      position: "insideBottom",
                      offset: -4,
                      fill: "#52525b",
                      fontSize: 10,
                    }}
                  />
                  <YAxis
                    dataKey="predicted_ms"
                    name="Predicted (ms)"
                    type="number"
                    tick={{
                      fontSize: 10,
                      fill: "#52525b",
                      fontFamily: "var(--mono)",
                    }}
                    label={{
                      value: "Predicted ms",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#52525b",
                      fontSize: 10,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#111",
                      border: "1px solid #222",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(val: any) => `${val}ms`}
                  />
                  {["etl", "ml", "http", "shell"].map((type) => (
                    <Scatter
                      key={type}
                      name={type}
                      data={accuracy.filter((a) => a.type === type)}
                      fill={TYPE_COLORS[type]}
                      opacity={0.8}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
