# SmartQueue — AI-Powered Adaptive Task Scheduler

> Final Year Project | B.Tech Computer Science & Engineering  
> Akshat Chauhan | Kalinga Institute of Industrial Technology (KIIT)

---

## Overview

SmartQueue is a distributed task scheduling platform that uses a hand-built LSTM neural network to learn from historical job execution patterns and dynamically assign priority scores to incoming tasks. Unlike conventional schedulers that use static rules (FIFO, round-robin), SmartQueue gets smarter over time — predicting how long a job will take and reordering the queue accordingly.

---

## Problem Statement

Modern backend systems run heterogeneous workloads — data pipelines, ML training jobs, HTTP callbacks, shell scripts — all competing for the same worker resources. Static priority scheduling causes two core problems:

1. **Priority inversion** — long-running low-priority jobs block short high-priority ones
2. **No learning** — the scheduler never improves from past execution data

SmartQueue solves both by training an LSTM on execution history and using predicted runtime to compute dynamic priority scores in real time.

---

## Key Features

- **AI-powered priority scheduling** — LSTM trained from scratch in NumPy predicts job runtime and assigns dynamic priority scores
- **Distributed microservices** — 4 independent services communicating over HTTP and a shared PostgreSQL database
- **Real-time dashboard** — Next.js frontend with live queue updates every 3 seconds
- **Fault tolerance** — automatic job retry with exponential backoff, `FOR UPDATE SKIP LOCKED` for safe concurrent worker access
- **Auto-scaling** — Kubernetes Horizontal Pod Autoscaler scales workers based on queue depth
- **Fully containerised** — every service runs in Docker, orchestrated with Kubernetes

---

## Tech Stack

| Layer              | Technology                                  |
| ------------------ | ------------------------------------------- |
| Frontend           | Next.js 15, React, TypeScript, Tailwind CSS |
| API Gateway        | FastAPI (Python 3.12)                       |
| Scheduler          | Node.js, TypeScript                         |
| Worker             | Python 3.12                                 |
| ML Predictor       | Python 3.12, NumPy (LSTM from scratch)      |
| Database           | PostgreSQL 16                               |
| Containerisation   | Docker, Docker Compose                      |
| Orchestration      | Kubernetes (Minikube), kubectl              |
| Package Management | pip, npm                                    |

---

## System Architecture

```
┌─────────────────┐
│   Next.js UI    │  ← Submit jobs, view queue, see ML predictions
└────────┬────────┘
         │ REST
┌────────▼────────┐
│   FastAPI API   │  ← Auth, job CRUD, calls ML predictor on submit
└────────┬────────┘
         │
    ┌────┴─────┐
    │          │
┌───▼───┐  ┌──▼──────────┐
│Sched- │  │ ML Predictor│  ← LSTM inference endpoint (port 8001)
│uler   │  │  (FastAPI)  │
│(TS)   │  └──────────────┘
└───┬───┘
    │ dispatches
┌───▼──────────────┐
│  Worker Pool     │  ← Python workers, Kubernetes pods
│  (K8s HPA)       │
└───┬──────────────┘
    │
┌───▼──────────────┐
│   PostgreSQL     │  ← jobs, execution_logs tables
└──────────────────┘
```

---

## Project Structure

```
smartqueue/
├── services/
│   ├── api/              # FastAPI — job submission, auth, REST endpoints
│   ├── scheduler/        # TypeScript — min-heap priority queue, dispatcher
│   ├── worker/           # Python — job execution, retry logic
│   └── predictor/        # Python/NumPy — LSTM training and inference
├── frontend/             # Next.js — live dashboard
├── db/
│   └── migrations/       # PostgreSQL schema
├── docker/
│   └── docker-compose.yml
├── k8s/                  # Kubernetes manifests
└── docs/                 # Project documentation
```

---

## Getting Started

### Prerequisites

Make sure the following are installed:

- Python 3.11+
- Node.js 20+
- Docker Desktop
- Git

### 1. Clone the repository

```bash
git clone <repo-url>
cd smartqueue
```

### 2. Start all services

Open **5 terminals**:

---

**Terminal 1 — Database**

```bash
cd "C:\Users\KIIT0001\Desktop\Personal Vault\Projects\Final Year Projects\smartqueue\docker"
docker-compose up -d
```

---

**Terminal 2 — API**

```bash
cd "C:\Users\KIIT0001\Desktop\Personal Vault\Projects\Final Year Projects\smartqueue\services\api"
uvicorn app.main:app --reload --port 8000
```

---

**Terminal 3 — ML Predictor**

```bash
cd "C:\Users\KIIT0001\Desktop\Personal Vault\Projects\Final Year Projects\smartqueue\services\predictor"
uvicorn app:app --reload --port 8001
```

---

**Terminal 4 — Scheduler**

```bash
cd "C:\Users\KIIT0001\Desktop\Personal Vault\Projects\Final Year Projects\smartqueue\services\scheduler"
npx ts-node src/index.ts
```

---

**Terminal 5 — Worker**

```bash
cd "C:\Users\KIIT0001\Desktop\Personal Vault\Projects\Final Year Projects\smartqueue\services\worker"
python worker.py
```

---

**Terminal 6 — Frontend**

```bash
cd "C:\Users\KIIT0001\Desktop\Personal Vault\Projects\Final Year Projects\smartqueue\frontend"
npm run dev
```

---

Then open:

- **http://localhost:3000** — dashboard
- **http://localhost:8000/docs** — API explorer
- **http://localhost:8001/docs** — ML predictor

Start them in order — DB first, then API, then everything else.

```

This will:

- Start PostgreSQL in Docker
- Start the FastAPI service on port 8000
- Start the ML Predictor on port 8001
- Start the TypeScript Scheduler
- Start the Python Worker
- Start the Next.js frontend on port 3000

### 3. Open the dashboard

```

http://localhost:3000

```

### 4. API documentation

```

http://localhost:8000/docs ← FastAPI Swagger UI
http://localhost:8001/docs ← ML Predictor Swagger UI

````

---

## Manual Setup (step by step)

### Database

```bash
cd docker
docker-compose up -d
docker exec -i docker-postgres-1 psql -U sq -d smartqueue < ../db/migrations/001_init.sql
````

### API Service

```bash
cd services/api
pip install fastapi uvicorn psycopg2-binary pydantic requests
uvicorn app.main:app --reload --port 8000
```

### ML Predictor

```bash
cd services/predictor
pip install numpy psycopg2-binary fastapi uvicorn
python generate_data.py   # generate synthetic training data
python train.py           # train the LSTM
uvicorn app:app --reload --port 8001
```

### Scheduler

```bash
cd services/scheduler
npm install
npx ts-node src/index.ts
```

### Worker

```bash
cd services/worker
python worker.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## The ML Model

The priority prediction model is a 2-layer LSTM implemented entirely in NumPy — no PyTorch, no TensorFlow. It takes the last 3 job types as a sequence and predicts the expected runtime of the next job. Priority is computed as:

```
priority = 1.0 / (1.0 + predicted_runtime_ms / 5000.0)
```

Shorter predicted runtime → higher priority score → job moves up the queue.

The model is retrained nightly on accumulated execution logs from PostgreSQL.

See [ML_MODEL.md](./ML_MODEL.md) for full details on architecture, training, and backpropagation.

---

## Database Schema

### `jobs`

| Column      | Type        | Description                      |
| ----------- | ----------- | -------------------------------- |
| id          | UUID        | Primary key                      |
| name        | TEXT        | Job name                         |
| type        | TEXT        | etl / ml / http / shell          |
| payload     | JSONB       | Job parameters                   |
| status      | TEXT        | queued / running / done / failed |
| priority    | FLOAT       | ML-assigned priority score (0–1) |
| created_at  | TIMESTAMPTZ | Submission time                  |
| started_at  | TIMESTAMPTZ | Execution start                  |
| finished_at | TIMESTAMPTZ | Execution end                    |
| retry_count | INT         | Number of retries                |
| error_msg   | TEXT        | Error message if failed          |

### `execution_logs`

| Column     | Type        | Description           |
| ---------- | ----------- | --------------------- |
| id         | UUID        | Primary key           |
| job_id     | UUID        | Foreign key → jobs    |
| runtime_ms | INT         | Actual execution time |
| worker_id  | TEXT        | Which worker ran it   |
| logged_at  | TIMESTAMPTZ | Log timestamp         |

---

## API Endpoints

| Method | Endpoint     | Description        |
| ------ | ------------ | ------------------ |
| GET    | `/health`    | Health check       |
| POST   | `/jobs/`     | Submit a new job   |
| GET    | `/jobs/`     | List all jobs      |
| GET    | `/jobs/{id}` | Get a specific job |

### Submit a job

```bash
curl -X POST http://localhost:8000/jobs/ \
  -H "Content-Type: application/json" \
  -d '{"name": "my-job", "type": "etl", "payload": {"file": "data.csv"}}'
```

### ML prediction

```bash
curl -X POST http://localhost:8001/predict \
  -H "Content-Type: application/json" \
  -d '{"job_type": "ml", "history": ["etl", "http"]}'
```

---

## What Makes This Novel

Conventional schedulers (Celery, Airflow, BullMQ) assign priority statically — either manually or by FIFO. SmartQueue is the first lightweight scheduler that:

1. Learns runtime patterns from execution history using a hand-built LSTM
2. Automatically adjusts queue order based on predicted execution cost
3. Scales workers dynamically via Kubernetes HPA based on queue depth
4. Exposes ML predictions transparently on the dashboard

---

## Author

**Akshat Chauhan**  
B.Tech Computer Science & Engineering  
Kalinga Institute of Industrial Technology (KIIT)  
Bhubaneswar, Odisha, India

---

_Built from scratch — every layer, every algorithm, every line of infrastructure._
