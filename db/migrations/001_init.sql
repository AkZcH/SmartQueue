CREATE TABLE jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,        -- 'etl' | 'ml' | 'http' | 'shell'
  payload     JSONB NOT NULL,
  status      TEXT DEFAULT 'queued', -- queued | running | done | failed
  priority    FLOAT DEFAULT 0.5,
  created_at  TIMESTAMPTZ DEFAULT now(),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  retry_count INT DEFAULT 0,
  error_msg   TEXT
);

CREATE TABLE execution_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID REFERENCES jobs(id),
  runtime_ms  INT,
  worker_id   TEXT,
  logged_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE execution_logs ADD COLUMN predicted_runtime_ms INT;