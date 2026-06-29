"use client";
import { useState, useEffect } from "react";
import axios from "axios";

const API = "http://localhost:8000";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const submit = async () => {
    if (!username || !password) return;
    setLoading(true);
    setError("");
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const res = await axios.post(`${API}${endpoint}`, { username, password });
      localStorage.setItem("token", res.data.token);
      window.location.href = "/";
    } catch (err: unknown) {
      if (axios.isAxiosError<{ detail?: string }>(err)) {
        setError(err.response?.data?.detail ?? "Something went wrong");
      } else {
        setError("Something went wrong");
      }
    }
    setLoading(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');

        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .sq-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
          font-family: 'Geist', system-ui, -apple-system, sans-serif;
          position: relative;
          overflow: hidden;
          padding: 24px;
        }

        /* Signature: radial glow orb — Vercel-style ambient light */
        .sq-page::before {
          content: '';
          position: absolute;
          top: -120px;
          left: 50%;
          transform: translateX(-50%);
          width: 560px;
          height: 400px;
          background: radial-gradient(ellipse at center, rgba(255,255,255,0.055) 0%, transparent 70%);
          pointer-events: none;
        }

        .sq-card {
          position: relative;
          width: 100%;
          max-width: 368px;
          background: #0a0a0a;
          border: 1px solid #1c1c1c;
          border-radius: 12px;
          overflow: hidden;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.35s ease, transform 0.35s ease;
        }

        .sq-card.visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* Top edge shimmer line */
        .sq-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.08) 60%, transparent);
          pointer-events: none;
        }

        .sq-header {
          padding: 20px 24px 0;
        }

        .sq-brand {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 20px;
        }

        .sq-logo-mark {
          width: 22px;
          height: 22px;
          flex-shrink: 0;
        }

        .sq-brand-name {
          font-size: 13px;
          font-weight: 500;
          color: #ededed;
          letter-spacing: -0.01em;
        }

        /* Tab switcher — underline style */
        .sq-tabs {
          display: flex;
          border-bottom: 1px solid #1c1c1c;
          margin: 0 -24px;
          padding: 0 24px;
          gap: 0;
        }

        .sq-tab {
          position: relative;
          padding: 10px 0;
          margin-right: 20px;
          background: none;
          border: none;
          font-size: 12px;
          font-family: 'Geist Mono', 'Courier New', monospace;
          font-weight: 400;
          color: #555;
          cursor: pointer;
          transition: color 0.15s;
          letter-spacing: 0.02em;
          text-transform: lowercase;
        }

        .sq-tab::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 1px;
          background: #ededed;
          opacity: 0;
          transition: opacity 0.15s;
        }

        .sq-tab.active {
          color: #ededed;
        }

        .sq-tab.active::after {
          opacity: 1;
        }

        .sq-tab:hover:not(.active) {
          color: #888;
        }

        /* Body */
        .sq-body {
          padding: 20px 24px 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .sq-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .sq-label {
          font-size: 11px;
          font-family: 'Geist Mono', monospace;
          color: #444;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .sq-input {
          width: 100%;
          height: 36px;
          background: #000;
          border: 1px solid #1c1c1c;
          border-radius: 7px;
          padding: 0 12px;
          font-size: 13px;
          font-family: 'Geist', system-ui, sans-serif;
          color: #ededed;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          -webkit-appearance: none;
        }

        .sq-input:focus {
          border-color: #2e2e2e;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.04);
        }

        .sq-input::placeholder {
          color: #2e2e2e;
        }

        /* Error state */
        .sq-error {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 10px 12px;
          background: #130a0a;
          border: 1px solid #2a1010;
          border-radius: 7px;
        }

        .sq-error-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #e05252;
          flex-shrink: 0;
          margin-top: 4px;
        }

        .sq-error-text {
          font-size: 12px;
          font-family: 'Geist Mono', monospace;
          color: #c97070;
          line-height: 1.5;
        }

        /* Submit button */
        .sq-submit {
          width: 100%;
          height: 36px;
          border-radius: 7px;
          border: none;
          background: #ededed;
          color: #000;
          font-size: 13px;
          font-weight: 500;
          font-family: 'Geist', system-ui, sans-serif;
          letter-spacing: -0.01em;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s, transform 0.1s;
          margin-top: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .sq-submit:hover:not(:disabled) {
          background: #f5f5f5;
        }

        .sq-submit:active:not(:disabled) {
          transform: scale(0.99);
          background: #ddd;
        }

        .sq-submit:disabled {
          opacity: 0.25;
          cursor: not-allowed;
        }

        /* Loading spinner */
        .sq-spinner {
          width: 13px;
          height: 13px;
          border: 1.5px solid rgba(0,0,0,0.15);
          border-top-color: #000;
          border-radius: 50%;
          animation: sq-spin 0.6s linear infinite;
        }

        @keyframes sq-spin {
          to { transform: rotate(360deg); }
        }

        /* Footer */
        .sq-footer {
          padding: 0 24px 18px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .sq-footer-dot {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #222;
          flex-shrink: 0;
        }

        .sq-footer-text {
          font-size: 11px;
          font-family: 'Geist Mono', monospace;
          color: #333;
          letter-spacing: 0.01em;
        }

        @media (prefers-reduced-motion: reduce) {
          .sq-card { transition: none; }
          .sq-spinner { animation: none; }
        }
      `}</style>

      <div className="sq-page">
        <div className={`sq-card ${mounted ? "visible" : ""}`}>
          <div className="sq-header">
            {/* Brand */}
            <div className="sq-brand">
              <svg
                className="sq-logo-mark"
                viewBox="0 0 22 22"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect x="1" y="1" width="9" height="9" rx="2" fill="#ededed" />
                <rect
                  x="12"
                  y="1"
                  width="9"
                  height="9"
                  rx="2"
                  fill="#ededed"
                  fillOpacity="0.45"
                />
                <rect
                  x="1"
                  y="12"
                  width="9"
                  height="9"
                  rx="2"
                  fill="#ededed"
                  fillOpacity="0.45"
                />
                <rect
                  x="12"
                  y="12"
                  width="9"
                  height="9"
                  rx="2"
                  fill="#ededed"
                  fillOpacity="0.18"
                />
              </svg>
              <span className="sq-brand-name">SmartQueue</span>
            </div>

            {/* Tabs */}
            <div className="sq-tabs">
              <button
                className={`sq-tab ${mode === "login" ? "active" : ""}`}
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                login
              </button>
              <button
                className={`sq-tab ${mode === "register" ? "active" : ""}`}
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                register
              </button>
            </div>
          </div>

          <div className="sq-body">
            <div className="sq-field">
              <label className="sq-label">Username</label>
              <input
                className="sq-input"
                placeholder="akshat"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="sq-field">
              <label className="sq-label">Password</label>
              <input
                className="sq-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </div>

            {error && (
              <div className="sq-error" role="alert">
                <div className="sq-error-dot" />
                <span className="sq-error-text">{error}</span>
              </div>
            )}

            <button
              className="sq-submit"
              onClick={submit}
              disabled={loading || !username || !password}
            >
              {loading ? (
                <>
                  <div className="sq-spinner" /> processing
                </>
              ) : mode === "login" ? (
                <>
                  Sign in <span aria-hidden="true">→</span>
                </>
              ) : (
                <>
                  Create account <span aria-hidden="true">→</span>
                </>
              )}
            </button>
          </div>

          <div className="sq-footer">
            <div className="sq-footer-dot" />
            <span className="sq-footer-text">
              {mode === "login"
                ? "No account? Switch to register above."
                : "Already have an account? Switch to login above."}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
