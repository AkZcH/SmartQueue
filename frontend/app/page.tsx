"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import {
  RefreshCw,
  Plus,
  Circle,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

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

const statusIcon = (status: string) => {
  if (status === "done")
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-red-500" />;
  if (status === "running")
    return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
  return <Clock className="w-4 h-4 text-yellow-500" />;
};

const statusColor = (status: string) => {
  if (status === "done") return "bg-green-100 text-green-800";
  if (status === "failed") return "bg-red-100 text-red-800";
  if (status === "running") return "bg-blue-100 text-blue-800";
  return "bg-yellow-100 text-yellow-800";
};

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "etl",
    payload: '{"file": "data.csv"}',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/jobs/`);
      setJobs(res.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, []);

  const submitJob = async () => {
    setSubmitting(true);
    try {
      await axios.post(`${API}/jobs/`, {
        name: form.name,
        type: form.type,
        payload: JSON.parse(form.payload),
      });
      setForm({ name: "", type: "etl", payload: '{"file": "data.csv"}' });
      fetchJobs();
    } catch (e) {
      alert("Failed to submit job. Check payload JSON.");
    }
    setSubmitting(false);
  };

  const counts = {
    queued: jobs.filter((j) => j.status === "queued").length,
    running: jobs.filter((j) => j.status === "running").length,
    done: jobs.filter((j) => j.status === "done").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              <span className="text-indigo-600">Smart</span>Queue
            </h1>
            <p className="text-sm text-gray-500">
              AI-powered adaptive task scheduler
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-green-600">Live</span>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Queued", value: counts.queued, color: "text-yellow-600" },
            { label: "Running", value: counts.running, color: "text-blue-600" },
            { label: "Done", value: counts.done, color: "text-green-600" },
            { label: "Failed", value: counts.failed, color: "text-red-600" },
          ].map((m) => (
            <div
              key={m.label}
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                {m.label}
              </p>
              <p className={`text-3xl font-semibold mt-1 ${m.color}`}>
                {m.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Submit Job */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-medium text-gray-700 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Submit Job
            </h2>
            <div className="flex flex-col gap-3">
              <input
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="Job name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <select
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="etl">ETL</option>
                <option value="ml">ML</option>
                <option value="http">HTTP</option>
                <option value="shell">Shell</option>
              </select>
              <textarea
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                rows={3}
                placeholder='{"key": "value"}'
                value={form.payload}
                onChange={(e) => setForm({ ...form, payload: e.target.value })}
              />
              <button
                onClick={submitJob}
                disabled={submitting || !form.name}
                className="bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {submitting ? "Submitting..." : "Submit Job"}
              </button>
            </div>
          </div>

          {/* Job Queue */}
          <div className="col-span-2 bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-medium text-gray-700">Job Queue</h2>
              <button
                onClick={fetchJobs}
                className="text-gray-400 hover:text-gray-600"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {jobs.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">
                  No jobs yet
                </p>
              )}
              {jobs.map((job) => (
                <div key={job.id} className="flex items-center gap-3 px-5 py-3">
                  {statusIcon(job.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {job.name}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">
                      {job.id.slice(0, 8)}...
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(job.status)}`}
                  >
                    {job.status}
                  </span>
                  <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                    {job.type}
                  </span>
                  <span className="text-xs text-indigo-600 font-mono">
                    p={job.priority.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
