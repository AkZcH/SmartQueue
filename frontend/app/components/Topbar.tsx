"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface User {
  username: string;
  role: string;
  org?: string | null;
}

function decodeToken(
  token: string,
): { username: string; role: string; sub: string } | null {
  try {
    const payload = token.split(".")[1];
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function initials(username: string) {
  return username.slice(0, 2).toUpperCase();
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin: { bg: "#f59e0b22", color: "#f59e0b" },
  org_admin: { bg: "#a855f722", color: "#a855f7" },
  user: { bg: "#3b82f622", color: "#3b82f6" },
};

export default function Topbar({ active }: { active: "queue" | "analytics" }) {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    const decoded = decodeToken(token);
    if (!decoded) {
      window.location.href = "/login";
      return;
    }

    // Fetch org info
    fetch("http://localhost:8000/orgs/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((org) => {
        setUser({
          username: decoded.username,
          role: decoded.role,
          org: org?.name ?? null,
        });
      })
      .catch(() => {
        setUser({ username: decoded.username, role: decoded.role, org: null });
      });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  const roleStyle = user
    ? (ROLE_COLORS[user.role] ?? ROLE_COLORS.user)
    : ROLE_COLORS.user;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 0 40px",
        borderBottom: "1px solid var(--border)",
        marginBottom: 40,
      }}
    >
      {/* Logo */}
      <div
        style={{
          fontSize: 15,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
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

      {/* Nav */}
      <div style={{ display: "flex", gap: 4 }}>
        {[
          { href: "/", label: "Queue", key: "queue" },
          { href: "/analytics", label: "Analytics", key: "analytics" },
        ].map((item) => (
          <Link
            key={item.key}
            href={item.href}
            style={{
              fontSize: 12,
              fontFamily: "var(--mono)",
              color: active === item.key ? "var(--text)" : "var(--text3)",
              textDecoration: "none",
              padding: "6px 12px",
              borderRadius: 6,
              border: `1px solid ${active === item.key ? "var(--border2)" : "transparent"}`,
              background: active === item.key ? "var(--surface2)" : "none",
              transition: "all 0.15s",
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Live badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--text3)",
            fontFamily: "var(--mono)",
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#4ade80",
              boxShadow: "0 0 8px #4ade80",
              animation: "blink 2s ease-in-out infinite",
            }}
          />
          live
        </div>

        {/* Profile dropdown */}
        {user && (
          <div ref={ref} style={{ position: "relative" }}>
            <button
              onClick={() => setOpen((o) => !o)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--surface)",
                border: "1px solid var(--border2)",
                borderRadius: 8,
                padding: "6px 10px",
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: roleStyle.bg,
                  border: `1px solid ${roleStyle.color}33`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontFamily: "var(--mono)",
                  fontWeight: 600,
                  color: roleStyle.color,
                  flexShrink: 0,
                }}
              >
                {initials(user.username)}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "var(--mono)",
                  color: "var(--text)",
                  letterSpacing: "-0.01em",
                }}
              >
                {user.username}
              </span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                style={{
                  color: "var(--text3)",
                  transform: open ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s",
                }}
              >
                <path
                  d="M2 3.5L5 6.5L8 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {/* Dropdown */}
            {open && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  background: "var(--surface)",
                  border: "1px solid var(--border2)",
                  borderRadius: 10,
                  width: 220,
                  overflow: "hidden",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                  animation: "slideUp 0.15s ease",
                  zIndex: 50,
                }}
              >
                {/* Profile section */}
                <div
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: roleStyle.bg,
                        border: `1px solid ${roleStyle.color}44`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontFamily: "var(--mono)",
                        fontWeight: 600,
                        color: roleStyle.color,
                        flexShrink: 0,
                      }}
                    >
                      {initials(user.username)}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--text)",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {user.username}
                      </div>
                      <div
                        style={{
                          display: "inline-block",
                          marginTop: 3,
                          fontSize: 10,
                          fontFamily: "var(--mono)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: roleStyle.bg,
                          color: roleStyle.color,
                        }}
                      >
                        {user.role}
                      </div>
                    </div>
                  </div>
                  {/* Org */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 10px",
                      background: "var(--bg)",
                      borderRadius: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text3)",
                        fontFamily: "var(--mono)",
                      }}
                    >
                      org
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: user.org ? "var(--text2)" : "var(--text3)",
                        fontFamily: "var(--mono)",
                      }}
                    >
                      {user.org ?? "none"}
                    </span>
                  </div>
                </div>
                {/* Logout */}
                <button
                  onClick={logout}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 12,
                    fontFamily: "var(--mono)",
                    color: "#f87171",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#2d0a0a")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "none")
                  }
                >
                  logout →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
