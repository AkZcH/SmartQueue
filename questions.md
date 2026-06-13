Good foundation. You understand the core flow. But there are gaps a senior engineer would push on. Let me fill them in:

**What you got right:**

- Predictor assigns priority based on job type ✓
- Scheduler maintains a queue ✓
- Worker picks up the job ✓
- Locking prevents double execution ✓

**What's missing from the full answer:**

The complete flow is:

1. User submits job via **Next.js frontend** → hits `POST /jobs/` on **FastAPI API**
2. API calls **ML Predictor** (port 8001) with job type + last 3 job types as history → gets back `predicted_runtime_ms` and `predicted_priority`
3. API inserts job into **PostgreSQL** with the priority score, then fires `pg_notify('new_job', job_id)`
4. **Scheduler** (TypeScript) is listening via LISTEN/NOTIFY — receives the notification instantly, rebuilds its min-heap priority queue from the DB
5. **Worker** polls PostgreSQL every 3 seconds → claims the highest priority job using `FOR UPDATE SKIP LOCKED` — this is the lock that prevents double execution
6. Worker gets a **lease** (`lease_expires_at = now() + 30s`) — must finish or renew before it expires
7. Worker executes the job, logs actual runtime to `execution_logs`, updates job status to `done`
8. Worker increments its `jobs_processed` counter in `worker_registry`

**Key detail you missed:** The scheduler doesn't "assign" jobs to workers. It maintains a priority-ordered view of the queue, but workers pull jobs themselves using `FOR UPDATE SKIP LOCKED`. There's no push from scheduler to worker — workers are pull-based.

**Practice saying this out loud:**

> "The scheduler maintains a priority heap but doesn't assign jobs. Workers are pull-based — they compete for jobs using PostgreSQL's `FOR UPDATE SKIP LOCKED`, which guarantees exactly-once execution even with multiple concurrent workers."

That distinction matters. Ready for question 2?
