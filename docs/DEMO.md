# SmartQueue — Live Demo Guide

All demos run against the Docker Compose stack. Start it first:

```bash
cd docker && docker compose up -d
cd ..
```

Verify everything is running:

```bash
docker compose -f docker/docker-compose.yml ps
```

---

## Table of Contents

- [Demo 1 — Worker Heartbeat + Liveness Detection](#demo-1--worker-heartbeat--liveness-detection)
- [Demo 2 — Leader Election + Automatic Failover](#demo-2--leader-election--automatic-failover)
- [Demo 3 — Rate Limiting](#demo-3--rate-limiting)
- [Demo 4 — Event-Driven Dispatch (LISTEN/NOTIFY)](#demo-4--event-driven-dispatch-listennotify)
- [Demo 5 — ML Priority Ordering](#demo-5--ml-priority-ordering)
- [Demo 6 — Exactly-Once Execution](#demo-6--exactly-once-execution)
- [Demo 7 — Kubernetes HPA Autoscaling](#demo-7--kubernetes-hpa-autoscaling)

---

## Demo 1 — Worker Heartbeat + Liveness Detection

**What this shows:** Workers register on startup, send heartbeats every 5 seconds, and the watchdog automatically requeues jobs from dead workers.

### Step 1 — Watch the worker registry

Open Terminal 1:

```bash
watch -n 2 "docker exec -i docker-db-1 psql -U sq -d smartqueue -c \"SELECT worker_id, status, last_seen, jobs_processed FROM worker_registry;\""
```

You should see one active worker with `last_seen` updating every 5 seconds.

### Step 2 — Submit a long-running job

```bash
# Login first
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "akshat", "password": "<your_password>"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Submit an ML job (simulates 4 seconds of work)
curl -X POST http://localhost:8000/jobs/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "heartbeat-demo", "type": "ml", "payload": {"file": "demo.csv"}}'
```

### Step 3 — Kill the worker mid-job

Open Terminal 2 and watch worker logs:

```bash
docker compose -f docker/docker-compose.yml logs worker --follow --timestamps
```

While a job is running, kill the worker:

```bash
docker stop docker-worker-1
```

### Step 4 — Observe stuck job recovery

Wait 30 seconds (lease duration), then check:

```bash
docker exec -i docker-db-1 psql -U sq -d smartqueue -c \
  "SELECT id, name, status, lease_expires_at FROM jobs ORDER BY created_at DESC LIMIT 5;"
```

The job will return to `queued` status automatically once the lease expires.

### Step 5 — Restart the worker

```bash
docker start docker-worker-1
```

Watch it re-register and pick up the requeued job.

**Expected output:**

```
[worker-xxxx] Registered
[watchdog] Recovered stuck job: heartbeat-demo (uuid)
Picked job: uuid | heartbeat-demo | ml
Done in 4001ms | Predicted: 10226ms
```

---

## Demo 2 — Leader Election + Automatic Failover

**What this shows:** Multiple scheduler instances compete for leadership via PostgreSQL advisory locks. When the leader dies, a standby takes over within 2 seconds.

### Step 1 — Start with one scheduler (confirm it's leader)

```bash
docker compose -f docker/docker-compose.yml logs scheduler --tail=5
```

Expected:

```
[Scheduler] scheduler-xxxx starting...
[Election] scheduler-xxxx became LEADER
[Dispatcher] Listening for new_job notifications...
```

### Step 2 — Scale to 2 scheduler instances

```bash
cd docker && docker compose up -d --scale scheduler=2
```

### Step 3 — Watch both instances in real time

```bash
docker compose logs scheduler --follow
```

Expected output:

```
scheduler-1 | [Election] scheduler-aaa became LEADER
scheduler-1 | [Dispatcher] Listening for new_job notifications...
scheduler-2 | [Standby] scheduler-bbb waiting for leadership...
scheduler-2 | [Standby] scheduler-bbb waiting for leadership...
scheduler-2 | [Standby] scheduler-bbb waiting for leadership...
```

### Step 4 — Kill the leader

```bash
docker stop docker-scheduler-1
```

### Step 5 — Watch automatic failover

Within 2 seconds you will see:

```
scheduler-2 | [Election] scheduler-bbb became LEADER
scheduler-2 | [Dispatcher] Listening for new_job notifications...
```

### Step 6 — Verify in the database

```bash
docker exec -i docker-db-1 psql -U sq -d smartqueue -c \
  "SELECT worker_id, elected_at, last_seen FROM scheduler_leader;"
```

The `worker_id` will now show the standby instance.

### Step 7 — Restore single scheduler

```bash
cd docker && docker compose up -d --scale scheduler=1
```

**Key insight:** PostgreSQL automatically releases the advisory lock when the connection dies — no TTL, no manual cleanup, no split-brain possible.

---

## Demo 3 — Rate Limiting

**What this shows:** The API enforces per-IP rate limits — 10 requests/minute on login, 5 requests/minute on register. Returns `429 Too Many Requests` when exceeded.

### Login rate limit (10/minute)

```bash
for i in {1..11}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:8000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username": "test", "password": "wrongpassword"}')
  echo "Request $i: HTTP $CODE"
done
```

Expected output:

```
Request 1:  HTTP 401
Request 2:  HTTP 401
Request 3:  HTTP 401
Request 4:  HTTP 401
Request 5:  HTTP 401
Request 6:  HTTP 401
Request 7:  HTTP 401
Request 8:  HTTP 401
Request 9:  HTTP 401
Request 10: HTTP 401
Request 11: HTTP 429  ← rate limited
```

### Register rate limit (5/minute)

```bash
for i in {1..6}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:8000/auth/register \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"spamuser$i\", \"password\": \"test123\"}")
  echo "Request $i: HTTP $CODE"
done
```

Expected output:

```
Request 1: HTTP 200
Request 2: HTTP 200
Request 3: HTTP 200
Request 4: HTTP 200
Request 5: HTTP 200
Request 6: HTTP 429  ← rate limited
```

### Unauthorized access

```bash
# No token
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/jobs/
# Expected: 403

# Invalid token
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer invalidtoken" \
  http://localhost:8000/jobs/
# Expected: 401
```

---

## Demo 4 — Event-Driven Dispatch (LISTEN/NOTIFY)

**What this shows:** Jobs are dispatched within milliseconds of submission via PostgreSQL LISTEN/NOTIFY — not on a 2-second polling interval.

### Step 1 — Watch scheduler logs with timestamps

Terminal 1:

```bash
docker compose -f docker/docker-compose.yml logs scheduler --follow --timestamps
```

### Step 2 — Submit a job and observe latency

Terminal 2:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "akshat", "password": "<your_password>"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl -X POST http://localhost:8000/jobs/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "notify-demo", "type": "http", "payload": {"url": "example.com"}}'
```

### Step 3 — Observe the timestamp

In Terminal 1 you will see — within milliseconds of the curl completing:

```
2026-06-11T12:00:00.123Z scheduler-1 | [Dispatcher] NOTIFY received — job uuid — rebuilding heap
2026-06-11T12:00:00.124Z scheduler-1 | [Dispatcher] 1 new job(s). Queue size: 1
```

### Step 4 — Verify queue wait time in the database

```bash
docker exec -i docker-db-1 psql -U sq -d smartqueue -c "
SELECT name,
       ROUND(EXTRACT(EPOCH FROM (started_at - created_at)) * 1000) AS queue_wait_ms
FROM jobs
WHERE name = 'notify-demo'
  AND started_at IS NOT NULL;"
```

Expected: `queue_wait_ms` in the range of 50–300ms (vs 0–2000ms with polling).

---

## Demo 5 — ML Priority Ordering

**What this shows:** The LSTM predictor assigns different priority scores to different job types based on predicted runtime. Shorter predicted runtime = higher priority.

### Submit one of each job type

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "akshat", "password": "<your_password>"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

for TYPE in http shell etl ml; do
  curl -s -X POST http://localhost:8000/jobs/ \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"name\": \"priority-demo-$TYPE\", \"type\": \"$TYPE\", \"payload\": {}}" | \
    grep -o '"priority":[0-9.]*'
  echo " ($TYPE)"
done
```

Expected output (approximate):

```
"priority":0.903 (http)
"priority":0.702 (shell)
"priority":0.542 (etl)
"priority":0.224 (ml)
```

HTTP jobs (fastest) get the highest priority. ML jobs (slowest) get the lowest. The queue processes them in priority order regardless of submission order.

### Verify queue ordering

```bash
docker exec -i docker-db-1 psql -U sq -d smartqueue -c "
SELECT name, type, priority, status
FROM jobs
WHERE name LIKE 'priority-demo-%'
ORDER BY priority DESC;"
```

---

## Demo 6 — Exactly-Once Execution

**What this shows:** `FOR UPDATE SKIP LOCKED` guarantees that even with multiple workers running simultaneously, each job is claimed by exactly one worker.

### Step 1 — Scale to 3 workers

```bash
cd docker && docker compose up -d --scale worker=3
```

### Step 2 — Submit 10 jobs simultaneously

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "akshat", "password": "<your_password>"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

for i in {1..10}; do
  curl -s -X POST http://localhost:8000/jobs/ \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"name\": \"exactly-once-$i\", \"type\": \"http\", \"payload\": {}}" > /dev/null &
done
wait
```

### Step 3 — Watch all 3 workers process jobs

```bash
docker compose -f docker/docker-compose.yml logs worker --follow | grep "Picked job"
```

### Step 4 — Verify no job was processed twice

```bash
docker exec -i docker-db-1 psql -U sq -d smartqueue -c "
SELECT job_id, COUNT(*) AS execution_count
FROM execution_logs
WHERE job_id IN (
  SELECT id FROM jobs WHERE name LIKE 'exactly-once-%'
)
GROUP BY job_id
HAVING COUNT(*) > 1;"
```

Expected: **0 rows** — no job was executed more than once despite 3 workers competing.

### Step 5 — Restore single worker

```bash
cd docker && docker compose up -d --scale worker=1
```

---

## Demo 7 — Kubernetes HPA Autoscaling

**What this shows:** The Horizontal Pod Autoscaler scales worker pods from 1 to 5 based on CPU utilization when the queue is under load.

### Prerequisites

```bash
# Ensure K8s cluster is running
kubectl cluster-info

# Deploy SmartQueue to K8s
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/predictor/
kubectl apply -f k8s/api/
kubectl apply -f k8s/worker/
kubectl apply -f k8s/scheduler/
kubectl apply -f k8s/frontend/

# Verify all pods running
kubectl get pods -n smartqueue
```

### Step 1 — Watch HPA in real time

Terminal 1:

```bash
kubectl get hpa -n smartqueue --watch
```

Initial state:

```
NAME         REFERENCE           TARGETS      MINPODS   MAXPODS   REPLICAS
worker-hpa   Deployment/worker   cpu: 1%/50%  1         5         1
```

### Step 2 — Watch pods

Terminal 2:

```bash
kubectl get pods -n smartqueue --watch | grep worker
```

### Step 3 — Submit a burst of jobs

Terminal 3:

```bash
TOKEN=$(curl -s -X POST http://localhost:30000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "akshat", "password": "<your_password>"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

for i in {1..50}; do
  curl -s -X POST http://localhost:30000/jobs/ \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"name\": \"hpa-demo-$i\", \"type\": \"ml\", \"payload\": {}}" > /dev/null
done
```

### Step 4 — Observe autoscaling

Watch Terminal 1 — as CPU rises above 50%, new worker pods spin up:

```
NAME         TARGETS       REPLICAS
worker-hpa   cpu: 12%/50%  1
worker-hpa   cpu: 67%/50%  1
worker-hpa   cpu: 67%/50%  3   ← scaled up
worker-hpa   cpu: 45%/50%  3
worker-hpa   cpu: 8%/50%   3
worker-hpa   cpu: 1%/50%   1   ← scaled back down
```

Watch Terminal 2 — new worker pods appear and terminate automatically:

```
worker-xxxx   0/1   Pending    0   2s
worker-xxxx   1/1   Running    0   8s
worker-yyyy   0/1   Pending    0   2s
worker-yyyy   1/1   Running    0   9s
```

**Key insight:** No human intervention. The system observes its own load and adapts automatically.

---

## Quick Reference

| Demo                | Time  | What it proves                                  |
| ------------------- | ----- | ----------------------------------------------- |
| 1 — Heartbeat       | 3 min | Fault tolerance, stuck job recovery             |
| 2 — Leader Election | 2 min | Distributed coordination, automatic failover    |
| 3 — Rate Limiting   | 1 min | Security, API protection                        |
| 4 — LISTEN/NOTIFY   | 1 min | Event-driven architecture, sub-100ms latency    |
| 5 — ML Priority     | 2 min | LSTM prediction, adaptive scheduling            |
| 6 — Exactly-Once    | 3 min | Distributed correctness, concurrency safety     |
| 7 — HPA             | 5 min | Kubernetes autoscaling, adaptive infrastructure |

---

_All demos assume Docker Compose is running and you have valid credentials. Replace `<your_password>` with your actual password throughout._
