CREATE TABLE scheduler_leader (
  id          INT PRIMARY KEY DEFAULT 1,
  worker_id   TEXT NOT NULL,
  elected_at  TIMESTAMPTZ DEFAULT now(),
  last_seen   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);