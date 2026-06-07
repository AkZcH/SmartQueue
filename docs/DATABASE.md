# SmartQueue — Database Documentation

## Table of Contents
1. [Overview](#overview)
2. [Technology Choice](#technology-choice)
3. [Schema](#schema)
4. [Tables](#tables)
5. [Relationships](#relationships)
6. [Key Design Decisions](#key-design-decisions)
7. [Indexes](#indexes)
8. [Concurrency](#concurrency)
9. [Common Queries](#common-queries)
10. [Migration](#migration)

---

## Overview

SmartQueue uses a single PostgreSQL 16 database named `smartqueue`. All services — the API, worker, scheduler, and ML predictor — share this database as the single source of truth. There are two tables:

| Table | Purpose |
|---|---|
| `jobs` | Stores every job submission, its current status, priority, and lifecycle timestamps |
| `execution_logs` | Stores the runtime of every completed job — the ML model's training data |

---

## Technology Choice

### Why PostgreSQL?

| Feature | How SmartQueue Uses It |
|---|---|
| `FOR UPDATE SKIP LOCKED` | Safe concurrent job pickup by multiple workers without double-processing |
| `JSONB` | Flexible job payload storage with optional indexing |
| `UUID` | Globally unique job IDs with no auto-increment collisions |
| `TIMESTAMPTZ` | Timezone-aware timestamps for accurate duration calculations |
| `gen_random_uuid()` | Server-side UUID generation — no client coordination needed |
| ACID transactions | Job status transitions are atomic — never partial updates |

### Why not Redis?
Redis would make a fast queue, but it is not durable by default and lacks relational querying. SmartQueue needs to join `jobs` with `execution_logs` for ML training — that is a relational operation. PostgreSQL does both.

### Why not MongoDB?
The data has a clear schema and strong relational integrity requirements (execution_logs must reference a valid job). A document database adds flexibility that is not needed here and removes guarantees that are.

---

## Schema

```sql
CREATE TABLE jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT DEFAULT 'queued',
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
```

---

## Tables

### `jobs`

The central table. Every job submission creates one row. The row is updated in place as the job moves through its lifecycle.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key, globally unique |
| `name` | TEXT | NO | — | Human-readable job name |
| `type` | TEXT | NO | — | Job category: `etl`, `ml`, `http`, `shell` |
| `payload` | JSONB | NO | — | Arbitrary JSON parameters |
| `status` | TEXT | NO | `queued` | Current state (see lifecycle below) |
| `priority` | FLOAT | NO | `0.5` | ML-assigned score between 0.0 and 1.0 |
| `created_at` | TIMESTAMPTZ | NO | `now()` | When job was submitted |
| `started_at` | TIMESTAMPTZ | YES | `null` | When worker began execution |
| `finished_at` | TIMESTAMPTZ | YES | `null` | When execution completed or failed |
| `retry_count` | INT | NO | `0` | Number of retry attempts so far |
| `error_msg` | TEXT | YES | `null` | Error details if status is `failed` |

#### Job Lifecycle

```
                    ┌─────────┐
      POST /jobs/   │         │
   ──────────────►  │ queued  │
                    │         │
                    └────┬────┘
                         │ worker picks up
                         ▼
                    ┌─────────┐
                    │         │
                    │ running │
                    │         │
                    └────┬────┘
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
        ┌──────────┐          ┌──────────┐
        │          │          │          │
        │   done   │          │  failed  │◄── retry_count >= 3
        │          │          │          │
        └──────────┘          └──────────┘
                                    │
                              retry_count < 3
                                    │
                                    ▼
                              back to queued
                         (retry_count += 1)
```

#### Valid Status Values

| Status | Meaning |
|---|---|
| `queued` | Waiting to be picked up by a worker |
| `running` | Currently being executed by a worker |
| `done` | Completed successfully |
| `failed` | Failed after exhausting all retries |

---

### `execution_logs`

One row per completed job execution. This is the ML model's training dataset — every row represents one data point the LSTM learns from.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `job_id` | UUID | NO | — | Foreign key → `jobs.id` |
| `runtime_ms` | INT | YES | `null` | Actual execution time in milliseconds |
| `worker_id` | TEXT | YES | `null` | Identifier of the worker that ran the job |
| `logged_at` | TIMESTAMPTZ | NO | `now()` | When this log entry was created |

---

## Relationships

```
┌──────────────────────────────────┐
│              jobs                │
├──────────────────────────────────┤
│ id (UUID) ◄─────────────────┐    │
│ name                        │    │
│ type                        │    │
│ payload                     │    │
│ status                      │    │
│ priority                    │    │
│ created_at                  │    │
│ started_at                  │    │
│ finished_at                 │    │
│ retry_count                 │    │
│ error_msg                   │    │
└──────────────────────────────────┘
                                 │ 1
                                 │
                                 │ N
┌──────────────────────────────────┐
│          execution_logs          │
├──────────────────────────────────┤
│ id (UUID)                        │
│ job_id (UUID) ──────────────────►│
│ runtime_ms                       │
│ worker_id                        │
│ logged_at                        │
└──────────────────────────────────┘
```

**Cardinality:** One job can have multiple execution log entries (one per retry attempt). In the common case (no retries), there is exactly one log entry per completed job.

---

## Key Design Decisions

### UUID Primary Keys
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```
UUIDs are used instead of auto-incrementing integers for three reasons:
1. **Distributed safety** — multiple services can reference a job ID without coordinating on the next integer
2. **No information leakage** — sequential IDs reveal how many jobs have been created
3. **Merge safety** — if two database instances were ever merged, UUID collisions are astronomically unlikely

### JSONB for Payload
```sql
payload JSONB NOT NULL
```
Different job types carry different parameters:
- `etl` jobs might carry `{"source": "table", "destination": "s3://..."}`
- `ml` jobs might carry `{"dataset": "training.parquet", "epochs": 100}`
- `http` jobs might carry `{"url": "https://...", "method": "POST"}`

JSONB stores this without requiring schema changes for each job type. It also supports GIN indexing for fast queries on payload fields if needed.

### FLOAT Priority
```sql
priority FLOAT DEFAULT 0.5
```
A continuous float in [0.0, 1.0] allows fine-grained ordering. Integer priorities (1, 2, 3) would cause ties that require secondary sorting. The ML model outputs a continuous score naturally — no rounding needed.

### TIMESTAMPTZ
```sql
created_at TIMESTAMPTZ DEFAULT now()
```
`TIMESTAMPTZ` stores timestamps with timezone information. This ensures that duration calculations (`finished_at - started_at`) are always accurate regardless of where the server is running. `TIMESTAMP` without timezone would cause subtle bugs in multi-region deployments.

### Nullable Timestamps
`started_at` and `finished_at` are nullable because:
- A queued job has not started yet → `started_at IS NULL`
- A running job has not finished yet → `finished_at IS NULL`
- Only a done/failed job has both populated

This avoids sentinel values like `'1970-01-01'` and allows clean NULL checks in queries.

---

## Indexes

The current schema relies on PostgreSQL's default B-tree index on primary keys. For production scale, the following indexes would be added:

```sql
-- Fast queue polling by workers
CREATE INDEX idx_jobs_status_priority
ON jobs (status, priority DESC, created_at ASC)
WHERE status = 'queued';

-- Fast ML training data queries
CREATE INDEX idx_execution_logs_job_id
ON execution_logs (job_id);

-- Fast dashboard queries by status
CREATE INDEX idx_jobs_status_created
ON jobs (status, created_at DESC);
```

The partial index on `status = 'queued'` is particularly valuable — it only indexes queued jobs, making worker polling fast even when there are millions of completed jobs in the table.

---

## Concurrency

### The `FOR UPDATE SKIP LOCKED` Pattern

This is the most important query in the entire system. It allows multiple workers to run simultaneously without ever processing the same job twice:

```sql
UPDATE jobs
SET status = 'running',
    started_at = now()
WHERE id = (
    SELECT id FROM jobs
    WHERE status = 'queued'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *
```

**How it works:**

1. `SELECT ... FOR UPDATE` — locks the selected row
2. `SKIP LOCKED` — if another worker has already locked that row, skip it and move to the next one
3. The `UPDATE` is atomic with the `SELECT` — no other transaction can interleave

**Without this pattern:**
```
Worker 1: SELECT job_id=123 (status=queued)
Worker 2: SELECT job_id=123 (status=queued)   ← same job!
Worker 1: UPDATE job_id=123 SET status=running
Worker 2: UPDATE job_id=123 SET status=running ← double execution!
```

**With `FOR UPDATE SKIP LOCKED`:**
```
Worker 1: SELECT job_id=123 FOR UPDATE  ← acquires lock
Worker 2: SELECT job_id=123 FOR UPDATE SKIP LOCKED ← skips, picks job_id=124
Worker 1: UPDATE job_id=123 SET status=running
Worker 2: UPDATE job_id=124 SET status=running  ← different job, no conflict
```

This is the same pattern used by Sidekiq (Ruby), River (Go), and Oban (Elixir) in production at large scale.

---

## Common Queries

### Get next job to process
```sql
UPDATE jobs
SET status = 'running', started_at = now()
WHERE id = (
    SELECT id FROM jobs
    WHERE status = 'queued'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

### Mark job as done
```sql
UPDATE jobs
SET status = 'done', finished_at = now()
WHERE id = $1;
```

### Mark job as failed
```sql
UPDATE jobs
SET status = 'failed', finished_at = now(), error_msg = $1
WHERE id = $2;
```

### Get queue depth by status
```sql
SELECT status, COUNT(*) as count
FROM jobs
GROUP BY status;
```

### Get ML training data
```sql
SELECT j.type, j.priority,
       EXTRACT(EPOCH FROM (j.finished_at - j.started_at)) AS runtime_sec,
       el.runtime_ms
FROM jobs j
JOIN execution_logs el ON el.job_id = j.id
WHERE j.status = 'done'
  AND j.started_at IS NOT NULL
ORDER BY j.finished_at ASC;
```

### Average runtime per job type
```sql
SELECT j.type,
       ROUND(AVG(el.runtime_ms)) AS avg_runtime_ms,
       COUNT(*) AS total_jobs
FROM jobs j
JOIN execution_logs el ON el.job_id = j.id
WHERE j.status = 'done'
GROUP BY j.type
ORDER BY avg_runtime_ms DESC;
```

### Jobs completed in last 24 hours
```sql
SELECT COUNT(*) AS completed_today
FROM jobs
WHERE status = 'done'
  AND finished_at >= now() - INTERVAL '24 hours';
```

### Success rate
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'done')  AS done,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'done') / NULLIF(COUNT(*), 0),
    2
  ) AS success_rate_pct
FROM jobs
WHERE status IN ('done', 'failed');
```

---

## Migration

### Running the Migration

```bash
# Start the database
cd docker
docker-compose up -d

# Apply schema
docker exec -i docker-postgres-1 psql -U sq -d smartqueue \
  < ../db/migrations/001_init.sql
```

### Migration File Location

```
db/
└── migrations/
    └── 001_init.sql    ← creates jobs and execution_logs tables
```

### Resetting the Database

```bash
# WARNING: deletes all data
cd docker
docker-compose down -v        # -v removes the volume
docker-compose up -d
docker exec -i docker-postgres-1 psql -U sq -d smartqueue \
  < ../db/migrations/001_init.sql
```

### Connecting Directly

```bash
# From inside Docker (no password needed)
docker exec -it docker-postgres-1 psql -U sq -d smartqueue

# Useful psql commands
\dt                    -- list tables
\d jobs                -- describe jobs table
\d execution_logs      -- describe execution_logs table
SELECT * FROM jobs;    -- view all jobs
```

---

*This document is part of the SmartQueue final year project documentation.*  
*Author: Akshat Chauhan | KIIT | B.Tech CSE*