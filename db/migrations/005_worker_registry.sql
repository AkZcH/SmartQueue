CREATE TABLE worker_registry (
  worker_id    TEXT PRIMARY KEY,
  hostname     TEXT NOT NULL,
  started_at   TIMESTAMPTZ DEFAULT now(),
  last_seen    TIMESTAMPTZ DEFAULT now(),
  jobs_processed INT DEFAULT 0,
  status       TEXT DEFAULT 'active'
);

ALTER TABLE jobs ADD COLUMN lease_expires_at TIMESTAMPTZ;