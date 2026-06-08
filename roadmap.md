# SmartQueue — Improvement Roadmap

Ordered by effort (lowest first) and impact. Each item builds on the previous.

---

## Phase 1 — Core Reliability (1–2 days)

These complete the fault tolerance story and require no new infrastructure.

### 1.1 Exponential Backoff on Retries
**What:** Currently retries happen immediately. Add exponential backoff with jitter.
**Why:** Prevents thundering herd when a dependency (DB, predictor) recovers.
**How:** In `worker.py`, compute `wait = min(2^retry_count + random jitter, 60s)` before requeuing.
**Resume signal:** "Implemented exponential backoff with jitter on job retries, preventing thundering herd under recovery conditions."

### 1.2 Heartbeats + Stuck Job Recovery
**What:** Workers write a heartbeat to the DB every 5s. A watchdog requeues jobs whose worker hasn't heartbeated in 15s.
**Why:** Right now a crashed worker leaves its job stuck in `running` forever.
**How:** New `worker_registry` table (`worker_id`, `last_seen`). Watchdog runs in the worker process. Jobs with `status=running` and `last_seen > 15s` get reset to `queued`.
**Resume signal:** "Implemented heartbeat-based worker liveness detection with automatic stuck-job recovery, eliminating zombie job accumulation."

### 1.3 Dead Letter Queue
**What:** Jobs that exceed `max_retries` move to a `failed_permanent` status and a separate DLQ view in the dashboard.
**Why:** Right now failed jobs just sit there with no distinction between "will retry" and "gave up".
**How:** Add `max_retries=3` config, update worker to check before requeuing. Add DLQ tab to frontend.
**Resume signal:** "Designed dead-letter queue for permanently failed jobs with dashboard visibility."

---

## Phase 2 — Distributed Primitives (3–5 days)

These make the system genuinely distributed rather than just multi-service.

### 2.1 Worker Registration + Discovery
**What:** Workers register themselves on startup with metadata (worker_id, hostname, capacity). API exposes `/workers` endpoint showing live worker pool.
**Why:** Currently workers are anonymous — there's no way to know how many are running or their state.
**How:** `worker_registry` table from 1.2 extended with `hostname`, `started_at`, `jobs_processed`. Show in dashboard.
**Resume signal:** "Built worker registration and discovery system exposing live worker pool state through the dashboard."

### 2.2 Task Leasing + Visibility Timeout
**What:** When a worker claims a job, it gets a lease (deadline). If it doesn't finish or heartbeat before the deadline, the job is released back to the queue.
**Why:** Stronger than heartbeats alone — guarantees job reclamation even if the watchdog itself is slow.
**How:** Add `lease_expires_at` column to `jobs`. Worker renews lease every 10s. Scheduler reclaims expired leases.
**Resume signal:** "Implemented lease-based job claiming with visibility timeouts, guaranteeing exactly-once execution semantics under worker failure."

### 2.3 Leader Election for Scheduler
**What:** Run multiple scheduler instances. They compete for a PostgreSQL advisory lock — only the lock holder rebuilds the heap and dispatches. If it dies, another wins within seconds.
**Why:** Scheduler is currently a single point of failure. This makes it fault-tolerant.
**How:** `pg_try_advisory_lock(12345)` in a loop with TTL. Losing instances stand by and retry every 2s.
**Resume signal:** "Implemented leader election for the scheduler layer using PostgreSQL advisory locks, eliminating the single point of failure without external coordination services."

### 2.4 Idempotency Keys on Job Submission
**What:** Clients can submit a job with an `idempotency_key`. Duplicate submissions with the same key return the existing job instead of creating a new one.
**Why:** Guarantees exactly-once submission semantics — safe to retry API calls.
**How:** Add `idempotency_key` (unique, nullable) to `jobs`. Check before insert.
**Resume signal:** "Added idempotency keys to job submission, enabling exactly-once delivery semantics across retried API calls."

---

## Phase 3 — Observability (2–3 days)

The highest-signal phase for SRE/infra roles. Shows production-grade thinking.

### 3.1 Structured Logging + Correlation IDs
**What:** Every request gets a `request_id` (UUID). All logs across services include it. Log format is JSON.
**Why:** Right now you can't trace a single job's journey across API → scheduler → worker logs.
**How:** FastAPI middleware generates `request_id`, passes it in headers. Worker and scheduler include it in every log line.
**Resume signal:** "Implemented structured JSON logging with correlation IDs across all services, enabling end-to-end request tracing."

### 3.2 Prometheus Metrics + Grafana Dashboard
**What:** Expose `/metrics` endpoint on the API. Instrument: queue depth, jobs/sec, worker utilization, prediction MAPE, p95 job latency per type.
**Why:** The Recharts dashboard is good for end users. Prometheus/Grafana is what SREs actually use.
**How:** Add `prometheus-fastapi-instrumentator` to API. Add Prometheus + Grafana containers to `docker-compose.yml`. Import a pre-built dashboard.
**Resume signal:** "Instrumented Prometheus metrics across all services with Grafana dashboards tracking queue depth, worker utilization, and p95 job latency per type."

### 3.3 OpenTelemetry Distributed Tracing
**What:** Add trace spans across the full job lifecycle: submit → predict → queue → execute → log.
**Why:** Lets you see exactly where time is spent for any individual job.
**How:** `opentelemetry-sdk` in Python services, export to Jaeger (add to docker-compose). Trace ID propagated in headers.
**Resume signal:** "Instrumented distributed tracing with OpenTelemetry across 6 services, providing end-to-end visibility into job execution latency."

---

## Phase 4 — Event-Driven Architecture (3–4 days)

Eliminates polling. The biggest architectural upgrade.

### 4.1 PostgreSQL LISTEN/NOTIFY
**What:** When a job is inserted, the API fires `NOTIFY new_job`. The scheduler listens and rebuilds the heap immediately instead of waiting 2 seconds.
**Why:** Polling every 2s is wasteful and adds latency. LISTEN/NOTIFY is built into PostgreSQL — no new infrastructure.
**How:** `NOTIFY new_job` in the jobs INSERT trigger. `asyncpg` LISTEN in the scheduler.
**Resume signal:** "Replaced polling-based scheduler with PostgreSQL LISTEN/NOTIFY, reducing job pickup latency from 2s to sub-100ms."

### 4.2 Redis Pub/Sub for Worker Notifications
**What:** API publishes job events to Redis. Workers subscribe and wake up immediately instead of polling every 3s.
**Why:** Reduces DB load from constant worker polling.
**How:** Add Redis to docker-compose. `redis-py` in worker. Publish on job insert, subscribe in worker.
**Resume signal:** "Replaced DB polling with Redis Pub/Sub for worker job notification, reducing unnecessary DB load by ~80% at idle."

---

## Phase 5 — Scale & Advanced Features (1+ week)

Do these after everything above is solid.

### 5.1 KEDA — Event-Driven Autoscaling
**What:** Replace CPU-based HPA with KEDA scaling on queue depth. Workers scale up when queue has >10 jobs, scale down when empty.
**Why:** CPU is a lagging indicator. Queue depth is a leading indicator of actual load.
**How:** Install KEDA in K8s cluster. Replace HPA with `ScaledObject` targeting PostgreSQL job count.
**Resume signal:** "Replaced CPU-based HPA with KEDA event-driven autoscaling on queue depth, achieving proactive worker scaling."

### 5.2 Delayed Jobs + Cron Scheduling
**What:** Jobs can have a `run_at` timestamp (run in the future) or a `cron_expr` (recurring).
**Why:** Most real schedulers support this. Adds significant practical utility.
**How:** Add `run_at` and `cron_expr` to `jobs`. Scheduler skips jobs where `run_at > now()`.

### 5.3 Queue Partitioning by Job Type
**What:** Each job type (etl, ml, http, shell) gets its own worker pool. ML jobs don't block HTTP jobs.
**Why:** Type isolation prevents one slow job type from starving others.
**How:** Worker reads `JOB_TYPE` env var and only polls for that type. Run 4 worker deployments in K8s.

### 5.4 Circuit Breakers
**What:** If the ML predictor fails 5 times in a row, stop calling it and fall back to default priority until it recovers.
**Why:** Right now predictor failure just falls back silently. A circuit breaker prevents cascading retry storms.
**How:** `pybreaker` library. Wrap `call_predictor()` in a circuit breaker.

### 5.5 Load Testing
**What:** Benchmark SmartQueue under realistic load. Target: 1000+ jobs/min without degradation.
**How:** Use `locust` or `k6`. Document results: max throughput, p99 latency, worker scaling behavior.
**Resume signal:** "Load tested at 1,000+ jobs/min with k6, documenting p99 latency and HPA scaling behavior under sustained load."

---

## Suggested Order for Maximum Resume Impact

If you have 2 weeks:

| Week | Focus |
|------|-------|
| Days 1–2 | Phase 1 (backoff, heartbeats, DLQ) |
| Days 3–5 | Phase 2.1–2.3 (worker registry, leasing, leader election) |
| Days 6–8 | Phase 3.1–3.2 (structured logs, Prometheus/Grafana) |
| Days 9–11 | Phase 4.1 (LISTEN/NOTIFY) |
| Days 12–14 | Phase 5.5 (load testing + document results) |

After this, the honest resume framing becomes:

> "Distributed task scheduler with leader election, lease-based exactly-once execution, heartbeat liveness detection, Prometheus/Grafana observability, and event-driven job dispatch via PostgreSQL NOTIFY — load tested at 1,000+ jobs/min."

That sentence gets interviews at infrastructure-focused companies.

---

## What This Project Will NOT Be (And That's Fine)

- A distributed database (CockroachDB-level complexity)
- A full consensus implementation (Raft/Paxos — use ZooKeeper/etcd for that)
- A message broker (Kafka-level throughput)

PostgreSQL advisory locks for leader election is the correct pragmatic choice. Real systems (Kubernetes, Patroni, many internal job schedulers at big tech) use this exact pattern.

---

Security & Compliance basics (we'll fix below).