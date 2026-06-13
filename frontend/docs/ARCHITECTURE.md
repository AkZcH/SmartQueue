# SmartQueue — System Architecture

## Table of Contents
1. [Overview](#overview)
2. [Design Philosophy](#design-philosophy)
3. [Service Breakdown](#service-breakdown)
4. [Data Flow](#data-flow)
5. [Database Design](#database-design)
6. [Scheduling Algorithm](#scheduling-algorithm)
7. [ML Integration](#ml-integration)
8. [Fault Tolerance](#fault-tolerance)
9. [Scalability](#scalability)
10. [Technology Decisions](#technology-decisions)

---

## Overview

SmartQueue follows a **microservices architecture** — each concern is isolated into its own independently deployable service. Services communicate over HTTP and share state through PostgreSQL. No message broker (like Kafka or RabbitMQ) is used deliberately — PostgreSQL's `FOR UPDATE SKIP LOCKED` serves as the coordination primitive, keeping the stack simple without sacrificing correctness.

```
                        ┌─────────────────────────┐
                        │      Next.js Frontend   │
                        │      (port 3000)         │
                        └────────────┬────────────┘
                                     │ HTTP REST
                        ┌────────────▼────────────┐
                        │      FastAPI (API)       │
                        │      (port 8000)         │
                        └──┬─────────────────┬────┘
                           │                 │ HTTP
                    writes │          ┌──────▼──────────┐
                    to DB  │          │  ML Predictor   │
                           │          │  (port 8001)    │
                           │          │  LSTM / NumPy   │
                           │          └─────────────────┘
                ┌──────────▼──────────┐
                │      PostgreSQL     │
                │      (port 5433)    │
                └──────────┬──────────┘
                           │ polls every 2s
                ┌──────────▼──────────┐
                │  TypeScript         │
                │  Scheduler          │
                │  (min-heap queue)   │
                └──────────┬──────────┘
                           │ dispatches
                ┌──────────▼──────────┐
                │   Worker Pool       │
                │   Python Workers    │
                │   (K8s HPA pods)    │
                └─────────────────────┘
```

---

## Design Philosophy

### Why microservices?
Each service has a single responsibility. The scheduler can be restarted without affecting the worker. The ML predictor can be retrained and redeployed without touching the API. This maps directly to real-world engineering practice at companies like Uber, Netflix, and Google.

### Why PostgreSQL as the queue backend?
Using a dedicated message broker (Kafka, RabbitMQ) adds operational complexity. PostgreSQL's `SELECT ... FOR UPDATE SKIP LOCKED` provides exactly-once job pickup semantics with zero additional infrastructure. This is the same pattern used by Sidekiq (Ruby) and River (Go) in production.

### Why TypeScript for the scheduler?
The scheduler is the most algorithmically intensive service — it implements a min-heap from scratch. TypeScript's strong typing makes the heap implementation verifiable and self-documenting. It also demonstrates polyglot architecture — a real-world skill.

### Why NumPy-only LSTM?
Using PyTorch or TensorFlow would reduce the ML component to a config file. Writing the LSTM in NumPy — including forward pass, backpropagation through time, and gradient clipping — demonstrates genuine understanding of how neural networks work at the mathematical level.

---

## Service Breakdown

### 1. FastAPI (API Gateway) — Python
**Port:** 8000  
**Responsibility:** Single entry point for all client requests

- Accepts job submissions via `POST /jobs/`
- Calls the ML Predictor to get a priority score before inserting the job
- Stores jobs in PostgreSQL with the ML-assigned priority
- Exposes `GET /jobs/` and `GET /jobs/{id}` for status queries
- Handles CORS so the Next.js frontend can call it freely

**Key design decision:** The API calls the ML predictor synchronously on job submission with a 2-second timeout. If the predictor is down, it falls back to `priority=0.5` — the system degrades gracefully, never fails hard.

---

### 2. TypeScript Scheduler
**Port:** none (no HTTP server)  
**Responsibility:** Maintain an in-memory priority-ordered view of the queue

- Polls PostgreSQL every 2 seconds for queued jobs
- Rebuilds the min-heap from the DB result on every poll
- Reports queue depth and top job to stdout
- Designed to be extended with a WebSocket push to the frontend

**Key data structure:** Max-heap (higher priority = closer to top)

```
        [0.92]
       /       \
   [0.85]     [0.71]
   /    \
[0.63] [0.34]
```

Jobs with higher ML-predicted priority float to the top and get dispatched first.

---

### 3. Python Worker
**Port:** none (no HTTP server)  
**Responsibility:** Execute jobs from the queue

- Polls PostgreSQL for `status='queued'` jobs using `FOR UPDATE SKIP LOCKED`
- Updates job status to `running` atomically
- Executes the job (currently simulates work; designed to run real scripts)
- Updates status to `done` or `failed`
- Logs runtime to `execution_logs` table for ML training
- Retries failed jobs up to 3 times

**Concurrency safety:** `FOR UPDATE SKIP LOCKED` ensures that if two workers poll simultaneously, each picks a different job. No job is ever processed twice.

---

### 4. ML Predictor — Python/NumPy
**Port:** 8001  
**Responsibility:** Predict job runtime and return a priority score

- Exposes `POST /predict` endpoint
- Takes job type + last 3 job types as history
- Runs inference through the trained LSTM
- Returns predicted runtime in ms and a derived priority score
- Model weights stored as `model.npz` (NumPy compressed format)

---

### 5. Next.js Frontend
**Port:** 3000  
**Responsibility:** Real-time dashboard for job management

- Polls `GET /jobs/` every 3 seconds for live updates
- Displays job queue with status, priority, type
- Submit form calls `POST /jobs/` directly
- Shows live metrics — queued, running, done, failed counts

---

## Data Flow

### Job Submission Flow

```
User clicks Submit
      │
      ▼
POST /jobs/ (FastAPI)
      │
      ├──► POST /predict (ML Predictor)
      │         │
      │         └──► LSTM inference
      │               └──► priority score (e.g. 0.85)
      │
      ▼
INSERT INTO jobs (..., priority=0.85)
      │
      ▼
Scheduler polls DB (every 2s)
      │
      └──► Job added to min-heap
```

### Job Execution Flow

```
Worker polls DB (every 3s)
      │
      ▼
SELECT ... FOR UPDATE SKIP LOCKED
      │
      ▼
UPDATE jobs SET status='running'
      │
      ▼
Execute job payload
      │
      ├── success ──► UPDATE status='done'
      │                    └──► INSERT execution_logs
      │
      └── failure ──► retry_count < 3?
                          │
                          ├── yes ──► UPDATE status='queued'
                          └── no  ──► UPDATE status='failed'
```

---

## Database Design

### Entity Relationship

```
┌─────────────────────────────┐
│            jobs             │
├─────────────────────────────┤
│ id          UUID (PK)       │
│ name        TEXT            │
│ type        TEXT            │
│ payload     JSONB           │
│ status      TEXT            │
│ priority    FLOAT           │
│ created_at  TIMESTAMPTZ     │
│ started_at  TIMESTAMPTZ     │
│ finished_at TIMESTAMPTZ     │
│ retry_count INT             │
│ error_msg   TEXT            │
└──────────────┬──────────────┘
               │ 1
               │
               │ N
┌──────────────▼──────────────┐
│        execution_logs       │
├─────────────────────────────┤
│ id          UUID (PK)       │
│ job_id      UUID (FK)       │
│ runtime_ms  INT             │
│ worker_id   TEXT            │
│ logged_at   TIMESTAMPTZ     │
└─────────────────────────────┘
```

### Key Design Decisions

- **JSONB for payload** — jobs carry arbitrary parameters. JSONB allows indexing on payload fields if needed later.
- **FLOAT priority** — continuous range (0.0–1.0) allows fine-grained ordering and easy ML output mapping.
- **TIMESTAMPTZ** — timezone-aware timestamps prevent bugs in distributed deployments across regions.
- **UUID primary keys** — globally unique, safe for distributed generation, no auto-increment collisions.

---

## Scheduling Algorithm

The scheduler uses a **max-heap** (priority queue) implemented from scratch in TypeScript.

### Heap Operations

| Operation | Time Complexity |
|---|---|
| Insert job | O(log n) |
| Get highest priority job | O(1) |
| Remove top job | O(log n) |
| Rebuild from array | O(n) |

### Priority Ordering

Jobs are ordered by ML-predicted priority (higher = first). For equal priority, earlier `created_at` wins (FIFO tiebreak). This is enforced both in the heap and in the SQL query:

```sql
SELECT ... FROM jobs 
WHERE status = 'queued'
ORDER BY priority DESC, created_at ASC
```

### Heap Rebuild Strategy

Every 2 seconds the scheduler queries the DB and rebuilds the heap from scratch (`O(n)` heapify). This keeps the in-memory state perfectly in sync with the database — no stale entries, no missed updates.

---

## ML Integration

### How Priority is Computed

```
job_type + last 3 job types
          │
          ▼
    One-hot encoding
    [etl=0, ml=1, http=2, shell=3]
          │
          ▼
    LSTM forward pass
    (2-layer, hidden_size=32)
          │
          ▼
    predicted_runtime_ms
          │
          ▼
    priority = 1.0 / (1.0 + runtime_ms / 5000.0)
```

### Why This Formula?

- Short jobs get high priority (priority → 1.0 as runtime → 0)
- Long jobs get lower priority (priority → 0.0 as runtime → ∞)
- The constant 5000ms is the "pivot" — jobs expected to run in under 5s get priority > 0.5

### Training Pipeline

1. Worker completes jobs and logs runtime to `execution_logs`
2. `train.py` queries the last N logs and builds sequences of length 3
3. LSTM is trained for 50 epochs with gradient clipping (clip value = 1.0)
4. Weights saved to `model.npz`
5. Predictor API hot-reloads the new weights on next request

---

## Fault Tolerance

### Worker Crash Recovery
If a worker crashes while a job is `running`, the job stays in `running` state. A supervisor script (or Kubernetes liveness probe) restarts the worker. A future improvement is a `stale_timeout` — jobs stuck in `running` for > N minutes get reset to `queued`.

### Predictor Unavailability
If the ML predictor is down or times out (2s timeout), the API assigns `priority=0.5` and continues. The system never fails a job submission because the ML service is unavailable.

### Database Connection Loss
Both the worker and API catch exceptions and reconnect. The worker sleeps 3 seconds between polls, giving the DB time to recover.

### Job Retry Logic
```
Job fails
    │
    ▼
retry_count < 3?
    │
    ├── yes ──► status = 'queued', retry_count += 1
    │           (picked up again by next worker poll)
    │
    └── no  ──► status = 'failed', error_msg saved
```

---

## Scalability

### Horizontal Worker Scaling
Workers are stateless — they only read from and write to the database. You can run any number of workers in parallel. `FOR UPDATE SKIP LOCKED` ensures no two workers pick the same job.

In Kubernetes:

```yaml
# HPA scales workers when queue depth is high
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  minReplicas: 1
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          averageUtilization: 60
```

### Database Bottleneck
At very high scale (10,000+ jobs/sec), the DB becomes the bottleneck. The natural next step is to introduce a Redis layer as a fast queue front-end while keeping PostgreSQL as the source of truth. This is intentionally deferred — the current architecture is correct and extensible.

---

## Technology Decisions

| Decision | Alternative Considered | Why SmartQueue's Choice |
|---|---|---|
| PostgreSQL as queue | Redis, RabbitMQ, Kafka | Simpler ops, SKIP LOCKED gives same guarantees |
| NumPy LSTM | PyTorch, TensorFlow | Demonstrates real ML understanding |
| TypeScript scheduler | Python | Shows polyglot architecture, strong typing for algorithms |
| FastAPI | Django, Flask | Async-native, automatic OpenAPI docs, Pydantic validation |
| Next.js | React + Vite | App Router, built-in API routes, production-ready |
| Kubernetes | Docker Swarm | Industry standard, HPA support, real orchestration |

---

*This document is part of the SmartQueue final year project documentation.*  
*Author: Akshat Chauhan | KIIT | B.Tech CSE*