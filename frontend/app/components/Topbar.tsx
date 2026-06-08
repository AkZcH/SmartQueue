"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  ChevronDown,
  Cpu,
  LayoutDashboard,
  LogOut,
  Settings,
} from "lucide-react";

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



const navItems = [
  { href: "/", label: "Queue", key: "queue", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", key: "analytics", icon: BarChart3 },
] as const;

export default function Topbar({ active }: { active: "queue" | "analytics" }) {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

    fetch("http://localhost:8000/orgs/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : null))
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

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function logout() {
    localStorage.removeItem("token");
    window.location.href = "/login";
  }

  return (
    <header className="sq-topbar">
      <Link className="sq-brand" href="/" aria-label="SmartQueue dashboard">
        <span className="sq-brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span className="sq-brand-text">SmartQueue</span>
      </Link>

      <nav className="sq-nav" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;

          return (
            <Link
              key={item.key}
              className="sq-nav-link"
              data-active={isActive}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={15} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
        <button className="sq-nav-link" type="button" disabled>
          <Cpu size={15} aria-hidden="true" />
          Workers
        </button>
        <button className="sq-nav-link" type="button" disabled>
          <Settings size={15} aria-hidden="true" />
          Settings
        </button>
      </nav>

      <div className="sq-topbar-actions">
        <div className="sq-env-pill" aria-label="Production environment live">
          <span className="sq-live-dot" aria-hidden="true" />
          prod
        </div>
        <button className="sq-icon-button" type="button" aria-label="Alerts">
          <Bell size={15} />
        </button>

        {user && (
          <div ref={menuRef} className="sq-user-menu">
            <button
              className="sq-user-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              <span className="sq-avatar">
                {initials(user.username)}
              </span>
              <span className="sq-user-meta">
                <span>{user.username}</span>
                <span>{user.org ?? "personal"}</span>
              </span>
              <ChevronDown
                className="sq-user-chevron"
                data-open={open}
                size={14}
                aria-hidden="true"
              />
            </button>

            {open && (
              <div className="sq-menu" role="menu">
                <div className="sq-menu-profile">
                  <span className="sq-avatar sq-avatar-large">
                    {initials(user.username)}
                  </span>
                  <div>
                    <div className="sq-menu-name">{user.username}</div>
                    <div className="sq-menu-subtitle">{user.org ?? "No org"}</div>
                  </div>
                </div>
                <div className="sq-menu-row">
                  <span>Role</span>
                  <span className="sq-role-pill">{user.role}</span>
                </div>
                <button className="sq-menu-action" type="button" onClick={logout}>
                  <LogOut size={14} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
