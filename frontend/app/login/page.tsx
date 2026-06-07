"use client";
import { useState } from "react";
import axios from "axios";

const API = "http://localhost:8000";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username || !password) return;
    setLoading(true);
    setError("");
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const res = await axios.post(`${API}${endpoint}`, { username, password });
      localStorage.setItem("token", res.data.token);
      window.location.href = "/";
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Something went wrong");
    }
    setLoading(false);
  };

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
        html, body { background: var(--bg); color: var(--text); font-family: var(--font); min-height: 100vh; }
        .page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          width: 100%;
          max-width: 360px;
          overflow: hidden;
        }
        .card-header {
          padding: 24px 28px 20px;
          border-bottom: 1px solid var(--border);
        }
        .logo {
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.02em;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }
        .logo-icon {
          width: 22px; height: 22px;
          background: var(--text);
          border-radius: 5px;
          display: flex; align-items: center; justify-content: center;
        }
        .logo-icon svg { color: var(--bg); }
        .tabs {
          display: flex;
          gap: 4px;
        }
        .tab {
          flex: 1;
          padding: 7px;
          border-radius: 7px;
          border: 1px solid transparent;
          background: none;
          font-size: 12px;
          font-family: var(--mono);
          color: var(--text3);
          cursor: pointer;
          transition: all 0.15s;
          text-align: center;
        }
        .tab.active {
          background: var(--surface2);
          border-color: var(--border2);
          color: var(--text);
        }
        .card-body {
          padding: 24px 28px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .field-label {
          font-size: 11px;
          color: var(--text3);
          font-family: var(--mono);
          margin-bottom: 5px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .input {
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
        }
        .input:focus { border-color: #444; }
        .input::placeholder { color: var(--text3); }
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
          margin-top: 4px;
        }
        .submit-btn:hover { opacity: 0.85; }
        .submit-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .error {
          font-size: 12px;
          font-family: var(--mono);
          color: #f87171;
          padding: 10px 12px;
          background: #2d0a0a;
          border: 1px solid #f8717133;
          border-radius: 7px;
        }
      `}</style>

      <div className="page">
        <div className="card">
          <div className="card-header">
            <div className="logo">
              <div className="logo-icon">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="1" y="1" width="4" height="4" fill="currentColor" />
                  <rect
                    x="7"
                    y="1"
                    width="4"
                    height="4"
                    fill="currentColor"
                    opacity="0.6"
                  />
                  <rect
                    x="1"
                    y="7"
                    width="4"
                    height="4"
                    fill="currentColor"
                    opacity="0.6"
                  />
                  <rect
                    x="7"
                    y="7"
                    width="4"
                    height="4"
                    fill="currentColor"
                    opacity="0.3"
                  />
                </svg>
              </div>
              SmartQueue
            </div>
            <div className="tabs">
              <button
                className={`tab ${mode === "login" ? "active" : ""}`}
                onClick={() => setMode("login")}
              >
                login
              </button>
              <button
                className={`tab ${mode === "register" ? "active" : ""}`}
                onClick={() => setMode("register")}
              >
                register
              </button>
            </div>
          </div>
          <div className="card-body">
            <div>
              <div className="field-label">Username</div>
              <input
                className="input"
                placeholder="akshat"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
            <div>
              <div className="field-label">Password</div>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button
              className="submit-btn"
              onClick={submit}
              disabled={loading || !username || !password}
            >
              {loading
                ? "..."
                : mode === "login"
                  ? "Sign in →"
                  : "Create account →"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
