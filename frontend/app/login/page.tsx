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
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .page {
          min-height: 100vh; display: flex; align-items: center;
          justify-content: center; padding: 24px; background: #000000;
        }
        .card {
          background: #0a0a0a; border: 1px solid #1a1a1a; border-radius: 10px;
          width: 100%; max-width: 360px; overflow: hidden;
        }
        .card-header { padding: 22px 24px 18px; border-bottom: 1px solid #1a1a1a; }
        .logo {
          font-size: 14px; font-weight: 500; display: flex;
          align-items: center; gap: 8px; margin-bottom: 16px; color: #ededed;
          font-family: var(--sq-font-sans);
        }
        .logo-icon {
          width: 20px; height: 20px; background: #ededed; border-radius: 4px;
          display: flex; align-items: center; justify-content: center;
        }
        .logo-icon svg { color: #000000; }
        .tabs { display: flex; gap: 4px; }
        .tab {
          flex: 1; padding: 6px; border-radius: 5px; border: 1px solid transparent;
          background: none; font-size: 11px; font-family: var(--sq-font-mono);
          color: #52525b; cursor: pointer; transition: all 0.15s; text-align: center;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .tab.active { background: #111111; border-color: #222222; color: #ededed; }
        .card-body { padding: 22px 24px; display: flex; flex-direction: column; gap: 14px; }
        .field-label {
          font-size: 10px; color: #52525b; font-family: var(--sq-font-mono);
          margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.06em;
        }
        .input {
          width: 100%; background: #000000; border: 1px solid #1a1a1a;
          border-radius: 7px; padding: 9px 12px; font-size: 13px; color: #ededed;
          font-family: var(--sq-font-sans); outline: none; transition: border-color 0.15s;
        }
        .input:focus { border-color: #333333; }
        .input::placeholder { color: #52525b; }
        .submit-btn {
          width: 100%; padding: 9px; border-radius: 7px; border: none;
          background: #ededed; color: #000000; font-size: 13px; font-weight: 600;
          font-family: var(--sq-font-sans); cursor: pointer; transition: opacity 0.15s;
          margin-top: 4px;
        }
        .submit-btn:hover { opacity: 0.88; }
        .submit-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .error {
          font-size: 12px; font-family: var(--sq-font-mono); color: #f87171;
          padding: 10px 12px; background: #2d0a0a; border: 1px solid #991b1b;
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
