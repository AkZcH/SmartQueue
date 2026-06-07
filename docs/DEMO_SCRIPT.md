# SmartQueue — Demo Script

> This document is a step-by-step guide for presenting SmartQueue to your project examiner.
> Estimated demo time: 10–15 minutes.
> Practice this at least 3 times before the actual presentation.

---

## Before the Demo

Do all of this the night before and again 30 minutes before the presentation.

### Checklist

- [ ] Docker Desktop is running
- [ ] All 6 terminals are open and services are started
- [ ] Browser is open at http://localhost:3000
- [ ] Browser tab 2 is open at http://localhost:8000/docs
- [ ] Browser tab 3 is open at http://localhost:8001/docs
- [ ] Database has been reset and is clean
- [ ] ML model has been trained (`model.npz` exists)
- [ ] `start.sh` has been tested end-to-end

### Reset the database before demo

```bash
cd docker
docker-compose down -v
docker-compose up -d
sleep 5
docker exec -i docker-postgres-1 psql -U sq -d smartqueue < ../db/migrations/001_init.sql
```

### Start all services

```bash
./start.sh
```

### Train the ML model

```bash
cd services/predictor
python generate_data.py
python train.py
```

---

## Opening Statement (1 minute)

Say this to open:

> "SmartQueue is a distributed task scheduling platform with an embedded AI layer.
> The core problem it solves is this — most task schedulers like Celery or Airflow
> assign priority statically, either manually or by FIFO order. They never learn
> from history. SmartQueue uses a Long Short-Term Memory neural network — written
> from scratch in NumPy, no PyTorch, no TensorFlow — to predict how long an
> incoming job will take, and uses that prediction to dynamically reorder the queue.
> The result is a system that gets smarter the more jobs it processes."

Then say:

> "Let me show you the live system."

---

## Part 1 — The Dashboard (2 minutes)

**Open http://localhost:3000**

Point out each section:

1. **Top metrics row**
   > "These four counters update every 3 seconds automatically — queued, running,
   > done, and failed. Right now everything is at zero because we just reset the database."

2. **Job queue panel**
   > "This is the live job queue. Every job shows its name, ID, status, type,
   > and most importantly — its ML-assigned priority score."

3. **Submit form on the left**
   > "From here I can submit any job directly. Let me do that now."

---

## Part 2 — Submit Jobs and Show Priority (3 minutes)

### Submit an ETL job

Fill the form:
- Name: `pipeline-export`
- Type: `etl`
- Payload: `{"file": "users.csv", "rows": 50000}`

Click Submit. Point to the priority score that appears:

> "Notice the priority score — it was assigned by the ML predictor before
> the job was even inserted into the database. For an ETL job the model
> predicts a medium runtime, so it gets a mid-range priority."

### Submit an HTTP job

- Name: `webhook-trigger`
- Type: `http`
- Payload: `{"url": "https://api.example.com/trigger"}`

> "HTTP jobs are typically fast — under a second. The model knows this from
> training, so it assigns a higher priority score. This job will jump ahead
> in the queue."

### Submit an ML job

- Name: `model-retrain`
- Type: `ml`
- Payload: `{"dataset": "training_v2.parquet", "epochs": 100}`

> "ML jobs are expensive — they can take minutes. The predictor assigns them
> a lower priority score. They go to the back of the queue and yield to
> faster jobs. This is the core intelligence of the system."

### Point to the queue ordering

> "Look at the queue now. The HTTP job is at the top despite being submitted
> last, because it has the highest priority score. The ML job is at the bottom.
> The scheduler's min-heap is ordering them by ML-predicted runtime — not by
> submission time."

---

## Part 3 — Show the Worker Processing Jobs (2 minutes)

**Switch to the worker terminal**

> "This is the worker service — a Python process polling the database every
> 3 seconds. Watch what happens."

Point to the terminal output as jobs are picked up:

> "It picked up the HTTP job first — highest priority. Then ETL. The ML job
> comes last. And critically — look at this line:"

Point to `FOR UPDATE SKIP LOCKED` behaviour by explaining:

> "If I run two workers simultaneously, they will never process the same job
> twice. PostgreSQL's FOR UPDATE SKIP LOCKED ensures that when Worker 1 locks
> a row, Worker 2 skips it and picks the next one. This is how distributed
> systems handle concurrency correctly."

**Switch back to the browser**

> "And on the dashboard — the statuses are updating in real time. Queued →
> Running → Done. The timestamps show exactly when each transition happened."

---

## Part 4 — The ML Predictor (3 minutes)

**Open http://localhost:8001/docs**

> "This is the ML Predictor — a separate microservice running on port 8001.
> It exposes a single endpoint: POST /predict."

### Live inference demo

Click `POST /predict` → Try it out → paste this body:

```json
{
  "job_type": "ml",
  "history": ["http", "http", "etl"]
}
```

Execute. Show the response:

> "The model received a sequence — HTTP, HTTP, ETL — as context, and a new
> ML job as the target. It predicted the runtime and derived a priority score
> of around 0.4. Now watch what happens if I change the context."

Change to:
```json
{
  "job_type": "ml",
  "history": ["ml", "ml", "ml"]
}
```

> "Same job type — but now the history shows three consecutive ML jobs.
> The model encodes this context through its cell state — that is the LSTM's
> memory. The prediction shifts because the model has learned that a sequence
> of heavy jobs suggests a compute-intensive workload."

### Explain the model

> "The LSTM has an input size of 4 — one dimension per job type,
> one-hot encoded. Hidden size 32. It was trained using backpropagation
> through time — BPTT — with gradient clipping at 1.0 to prevent exploding
> gradients. The loss went from 0.014 down to 0.0002 over 50 epochs.
> Every weight matrix, every gate equation, every gradient — written in NumPy."

---

## Part 5 — The Architecture (2 minutes)

**Open a whiteboard or show ARCHITECTURE.md**

Draw this quickly:

```
[Next.js] → [FastAPI] → [PostgreSQL]
                ↓               ↑
          [ML Predictor]   [Scheduler]
                              ↓
                          [Worker Pool]
```

> "Four independent microservices. Each one can be restarted, redeployed,
> or scaled without affecting the others. The only shared state is PostgreSQL.
> There is no message broker — no Kafka, no RabbitMQ. PostgreSQL's SKIP LOCKED
> does the coordination. This keeps the stack simple without sacrificing correctness."

> "The scheduler is written in TypeScript and implements a min-heap from scratch.
> Insert is O(log n), peek is O(1). The heap rebuilds from the database every
> 2 seconds to stay in sync."

---

## Part 6 — Kubernetes Scaling (2 minutes)

**Switch to a terminal with minikube running**

```bash
kubectl get pods
```

> "In Kubernetes, the worker runs as a Deployment. Right now there are 2 replicas."

Flood the queue:

```bash
for i in {1..30}; do
  curl -s -X POST http://localhost:8000/jobs/ \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"load-$i\", \"type\": \"ml\", \"payload\": {}}" &
done
```

```bash
kubectl get hpa worker-hpa --watch
```

> "The Horizontal Pod Autoscaler is watching CPU utilisation. As the queue
> fills up and workers get busy, CPU crosses the 60% threshold and Kubernetes
> automatically spins up more worker pods — up to 10. I can kill a pod right
> now and Kubernetes will restart it automatically."

```bash
kubectl delete pod <worker-pod-name>
kubectl get pods --watch
```

> "The pod restarts within seconds. Any job that was running on it gets
> retried by another worker. The system self-heals."

---

## Likely Examiner Questions and Answers

### "Why did you use PostgreSQL instead of a message broker like Kafka?"

> "Kafka adds significant operational complexity — you need Zookeeper,
> topic management, consumer groups. PostgreSQL's FOR UPDATE SKIP LOCKED
> gives me exactly-once job pickup semantics with zero additional
> infrastructure. This is the same pattern used by Sidekiq in Ruby and
> River in Go at production scale. For a system of this size, it is the
> right tool."

### "Why LSTM and not a simpler model like linear regression?"

> "Job scheduling is a sequential problem. The runtime of the next job
> is influenced by what has been running recently. A linear regression
> treats each prediction independently — it has no memory. The LSTM
> retains a cell state that accumulates information across the sequence.
> After three consecutive ML jobs, the cell state encodes a different
> context than after three HTTP jobs — and the predictions reflect that."

### "Why did you write the LSTM in NumPy instead of using PyTorch?"

> "Using PyTorch would reduce the ML component to a configuration file.
> Writing it in NumPy means I had to implement the forward pass, the
> gate equations, backpropagation through time, and gradient clipping
> from first principles. I can derive every equation on this whiteboard
> right now. That is genuine understanding — not framework usage."

### "What is FOR UPDATE SKIP LOCKED and why does it matter?"

> "It is a PostgreSQL feature that makes worker coordination safe.
> Without it, two workers polling simultaneously might both read the
> same queued job and process it twice. FOR UPDATE locks the row during
> the SELECT, and SKIP LOCKED tells other transactions to skip already-locked
> rows rather than wait. The result is that each worker atomically claims
> a different job. This is a production-grade concurrency pattern."

### "How does the priority formula work?"

> "Priority equals 1 divided by (1 plus predicted runtime divided by 5000).
> The 5000 milliseconds is the pivot — jobs predicted to run in under 5 seconds
> get a priority above 0.5 and rise in the queue. Jobs over 5 seconds get below
> 0.5 and yield. The formula is monotonically decreasing — longer predicted
> runtime always means lower priority. It maps the unbounded runtime space into
> a clean 0 to 1 range."

### "What happens if the ML predictor goes down?"

> "The API has a 2-second timeout on the predictor call. If it times out
> or returns an error, the job is assigned a default priority of 0.5 and
> inserted normally. The system degrades gracefully — job submission never
> fails because the ML service is unavailable. This is a deliberate fault
> tolerance design decision."

### "How would you scale this to handle 10,000 jobs per second?"

> "At that scale, the database becomes the bottleneck. The natural next
> step is a Redis layer as a fast queue front-end — workers pull from Redis
> for speed, while PostgreSQL remains the durable source of truth for audit
> and ML training. The current architecture is designed to make this extension
> straightforward — the worker's job pickup logic would change in one place."

### "What is the time complexity of your scheduler?"

> "The min-heap supports O(log n) insert, O(1) peek, and O(log n) removal.
> The full rebuild from the database is O(n) using Floyd's heapify algorithm —
> that is building the heap bottom-up, which is provably faster than inserting
> elements one by one which would be O(n log n)."

### "What is backpropagation through time?"

> "BPTT is the algorithm for training recurrent networks. In a standard
> feedforward network, gradients flow backward through layers. In an LSTM,
> gradients also flow backward through time steps — from timestep 2 back
> to timestep 1 back to timestep 0. At each step we apply the chain rule
> through the gate equations. The cell state gradient at timestep t depends
> on the gradient at timestep t+1, which is why we process them in reverse order."

---

## Closing Statement

> "SmartQueue demonstrates four areas of computer science engineering simultaneously —
> distributed systems, machine learning from first principles, database concurrency,
> and container orchestration. Every component was built from scratch:
> the LSTM in NumPy, the min-heap in TypeScript, the concurrency pattern in SQL.
> The system is novel because no mainstream scheduler combines learned priority
> assignment with dynamic auto-scaling in a single lightweight stack.
> Thank you."

---

## Emergency Fallback

If something breaks during the demo:

| Problem | Fix |
|---|---|
| Dashboard not loading | Restart: `cd frontend && npm run dev` |
| API 500 errors | Restart: `cd services/api && uvicorn app.main:app --reload --port 8000` |
| Worker not picking jobs | Restart: `cd services/worker && python worker.py` |
| ML predictor down | Restart: `cd services/predictor && uvicorn app:app --reload --port 8001` |
| Database connection failed | Run: `cd docker && docker-compose up -d` |
| Jobs stuck in running | Run: `docker exec -it docker-postgres-1 psql -U sq -d smartqueue -c "UPDATE jobs SET status='queued' WHERE status='running';"` |

If everything is broken, open the Swagger UI at http://localhost:8000/docs and demo the API directly — submit jobs, show the responses, explain the architecture verbally. The code and documentation speak for themselves.

---

*This document is part of the SmartQueue final year project documentation.*
*Author: Akshat Chauhan | KIIT | B.Tech CSE*