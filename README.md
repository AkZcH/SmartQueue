# SmartQueue — AI-Powered Adaptive Task Scheduler

> Final Year Project | B.Tech Computer Science & Engineering
> Akshat Chauhan | Kalinga Institute of Industrial Technology (KIIT)

---

## Overview

SmartQueue is a distributed task scheduling platform that uses a hand-built LSTM neural network (NumPy, no frameworks) to learn from historical job execution patterns and dynamically assign priority scores to incoming tasks. Unlike conventional schedulers that use static rules, SmartQueue gets smarter over time — predicting how long a job will take and reordering the queue accordingly.

Multi-tenant by design: users belong to organizations, see each other's jobs within their org, and are isolated from other orgs. Three role tiers — `admin`, `org_admin`, `user` — with JWT-based auth and rate limiting throughout.

---

## Problem Statement

Modern backend systems run heterogeneous workloads — data pipelines, ML training jobs, HTTP callbacks, shell scripts — all competing for the same worker resources. Static priority scheduling causes two core problems:

1. **Priority inversion** — long-running low-priority jobs block short high-priority ones
2. **No learning** — the scheduler never improves from past execution data

SmartQueue solves both by training an LSTM on execution history and using predicted runtime to compute dynamic priority scores in real time.

---

## Key Features

- **AI-powered priority scheduling** — LSTM trained from scratch in NumPy predicts job runtime and assigns dynamic priority scores
- **Multi-tenant org model** — users belong to organizations, org-scoped job visibility, role-based access control
- **JWT authentication** — HMAC-SHA256 tokens, no third-party auth libraries, stateless across API replicas
- **Distributed microservices** — 6 independent services communicating over HTTP and a shared PostgreSQL database
- **Analytics dashboard** — throughput charts, predicted vs actual runtime, prediction accuracy scatter plot
- **Fault tolerance** — `FOR UPDATE SKIP LOCKED` for safe concurrent worker access, automatic retry logic
- **Auto-scaling** — Kubernetes Horizontal Pod Autoscaler scales workers 1→5 pods based on CPU
- **Security hardening** — rate limiting (`slowapi`), input validation (Pydantic), CORS lockdown
- **CI/CD** — GitHub Actions builds and pushes Docker images to Docker Hub on every push to `main`
- **Fully containerised** — every service in Docker, orchestrated with Kubernetes

---

## Tech Stack

| Layer            | Technology                             |
| ---------------- | -------------------------------------- |
| Frontend         | Next.js 15, React, TypeScript          |
| API              | FastAPI (Python 3.12)                  |
| Scheduler        | Node.js, TypeScript, min-heap          |
| Worker           | Python 3.12                            |
| ML Predictor     | Python 3.12, NumPy (LSTM from scratch) |
| Database         | PostgreSQL 16                          |
| Auth             | JWT — HMAC-SHA256, stdlib only         |
| Containerisation | Docker, Docker Compose                 |
| Orchestration    | Kubernetes, kubectl, HPA               |
| CI/CD            | GitHub Actions, Docker Hub             |
| Rate Limiting    | slowapi                                |

---

## System Architecture

```
┌─────────────────┐
│   Next.js UI    │  ← Submit jobs, view queue, analytics, profile
└────────┬────────┘
         │ REST + JWT
┌────────▼────────┐
│   FastAPI API   │  ← Auth, job CRUD, org management, analytics
└────────┬────────┘
         │
    ┌────┴──────────┐
    │               │
┌───▼──────┐  ┌────▼────────┐
│Scheduler │  │ML Predictor │  ← LSTM inference (port 8001)
│(TS heap) │  │  (FastAPI)  │
└───┬──────┘  └─────────────┘
    │ dispatches
┌───▼──────────────┐
│  Worker Pool     │  ← Python workers, scales via K8s HPA (1→5 pods)
└───┬──────────────┘
    │
┌───▼──────────────┐
│   PostgreSQL     │  ← jobs, execution_logs, users, organizations
└──────────────────┘
```

---

## Project Structure

```
smartqueue/
├── services/
│   ├── api/              # FastAPI — auth, jobs, orgs, analytics
│   ├── scheduler/        # TypeScript — min-heap priority queue
│   ├── worker/           # Python — job execution, retry logic
│   └── predictor/        # NumPy LSTM — training and inference
├── frontend/             # Next.js — queue, analytics, profile
│   └── app/
│       ├── components/   # Shared Topbar with profile dropdown
│       ├── analytics/    # Analytics dashboard page
│       └── login/        # Login / register page
├── db/
│   └── migrations/       # 001_init → 004_organizations
├── docker/
│   └── docker-compose.yml
├── k8s/                  # Kubernetes manifests + HPA
│   ├── namespace.yaml
│   ├── secrets.yaml
│   ├── postgres/
│   ├── api/
│   ├── worker/           # includes hpa.yaml
│   ├── scheduler/
│   ├── predictor/
│   └── frontend/
└── .github/
    └── workflows/
        └── ci.yml        # Build + push to Docker Hub, lint, typecheck
```

---

## Getting Started

### Option 1 — Docker Compose (recommended)

```bash
git clone https://github.com/AkZcH/SmartQueue.git
cd SmartQueue/docker
docker compose up -d
```

All 6 services start automatically in the correct order. Open:

- **http://localhost:3000** — dashboard
- **http://localhost:8000/docs** — API explorer
- **http://localhost:8001/docs** — ML predictor

### Option 2 — Kubernetes

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/predictor/
kubectl apply -f k8s/api/
kubectl apply -f k8s/worker/
kubectl apply -f k8s/scheduler/
kubectl apply -f k8s/frontend/
kubectl get pods -n smartqueue
```

Frontend at **http://localhost:30001**, API at **http://localhost:30000**.

### Option 3 — Local dev

```bash
# Terminal 1 — Database
cd docker && docker compose up -d db

# Terminal 2 — API
cd services/api && uvicorn app.main:app --reload --port 8000

# Terminal 3 — ML Predictor
cd services/predictor && uvicorn app:app --reload --port 8001

# Terminal 4 — Scheduler
cd services/scheduler && npx ts-node src/index.ts

# Terminal 5 — Worker
cd services/worker && python worker.py

# Terminal 6 — Frontend
cd frontend && npm run dev
```

---

## Authentication & Authorization

All job endpoints require a JWT token. Register and login:

```bash
# Register
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "secret123"}'

# Login
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "secret123"}'
```

Use the returned token in subsequent requests:

```bash
curl http://localhost:8000/jobs/ \
  -H "Authorization: Bearer <token>"
```

### Roles

| Role        | Permissions                               |
| ----------- | ----------------------------------------- |
| `admin`     | See all jobs across all orgs              |
| `org_admin` | See all jobs in their org, invite members |
| `user`      | See all jobs in their org, submit jobs    |

### Organizations

```bash
# Create an org (you become org_admin)
curl -X POST http://localhost:8000/orgs/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-company"}'

# Invite a user
curl -X POST http://localhost:8000/orgs/<org_id>/invite \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"username": "bob"}'
```

---

## API Reference

### Auth

| Method | Endpoint         | Description             |
| ------ | ---------------- | ----------------------- |
| POST   | `/auth/register` | Register (5/min limit)  |
| POST   | `/auth/login`    | Login (10/min limit)    |
| GET    | `/auth/users`    | List users (admin only) |

### Jobs

| Method | Endpoint     | Description            |
| ------ | ------------ | ---------------------- |
| POST   | `/jobs/`     | Submit a job           |
| GET    | `/jobs/`     | List jobs (org-scoped) |
| GET    | `/jobs/{id}` | Get a specific job     |

### Organizations

| Method | Endpoint            | Description        |
| ------ | ------------------- | ------------------ |
| POST   | `/orgs/`            | Create org         |
| POST   | `/orgs/{id}/invite` | Invite user to org |
| GET    | `/orgs/me`          | Get your org info  |
| GET    | `/orgs/me/members`  | List org members   |

### Analytics

| Method | Endpoint                         | Description              |
| ------ | -------------------------------- | ------------------------ |
| GET    | `/analytics/summary`             | Job counts, success rate |
| GET    | `/analytics/throughput`          | Jobs per hour (last 24h) |
| GET    | `/analytics/prediction-accuracy` | Actual vs predicted      |

---

## The ML Model

The priority prediction model is a 2-layer LSTM implemented entirely in NumPy — no PyTorch, no TensorFlow. It takes the last 3 job types as input sequence and outputs a context adjustment factor applied to base runtimes:

```
Base runtimes: http=400ms, shell=1500ms, etl=3000ms, ml=12000ms
Context factor: LSTM output mapped to [0.7, 1.3] (±30% adjustment)
Predicted runtime: base_ms × context_factor
Priority score: 1.0 / (1.0 + predicted_runtime_ms / 3000.0)
```

Shorter predicted runtime → higher priority score → job moves up the queue.

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
| user_id     | UUID        | Submitting user                  |
| org_id      | UUID        | Submitting user's org            |
| created_at  | TIMESTAMPTZ | Submission time                  |
| started_at  | TIMESTAMPTZ | Execution start                  |
| finished_at | TIMESTAMPTZ | Execution end                    |
| retry_count | INT         | Number of retries                |
| error_msg   | TEXT        | Error message if failed          |

### `execution_logs`

| Column               | Type        | Description           |
| -------------------- | ----------- | --------------------- |
| id                   | UUID        | Primary key           |
| job_id               | UUID        | Foreign key → jobs    |
| runtime_ms           | INT         | Actual execution time |
| predicted_runtime_ms | INT         | ML predicted time     |
| worker_id            | TEXT        | Which worker ran it   |
| logged_at            | TIMESTAMPTZ | Log timestamp         |

### `users`

| Column        | Type        | Description                 |
| ------------- | ----------- | --------------------------- |
| id            | UUID        | Primary key                 |
| username      | TEXT        | Unique username             |
| password_hash | TEXT        | HMAC-SHA256 hash            |
| role          | TEXT        | admin / org_admin / user    |
| org_id        | UUID        | Foreign key → organizations |
| created_at    | TIMESTAMPTZ | Registration time           |

### `organizations`

| Column     | Type        | Description     |
| ---------- | ----------- | --------------- |
| id         | UUID        | Primary key     |
| name       | TEXT        | Unique org name |
| created_at | TIMESTAMPTZ | Creation time   |

---

## CI/CD

Every push to `main` triggers a GitHub Actions workflow that:

1. Runs Python import checks and TypeScript typecheck
2. Builds Docker images for all 5 services
3. Pushes tagged images to Docker Hub (`de4dl0ck/smartqueue-*:latest` and `:<git-sha>`)

Images: `de4dl0ck/smartqueue-api`, `de4dl0ck/smartqueue-worker`, `de4dl0ck/smartqueue-predictor`, `de4dl0ck/smartqueue-scheduler`, `de4dl0ck/smartqueue-frontend`

---

## What Makes This Novel

Conventional schedulers (Celery, Airflow, BullMQ) assign priority statically — either manually or by FIFO. SmartQueue differs in three ways:

1. **Learns runtime patterns** from execution history using a hand-built LSTM — no ML framework dependency
2. **Org-scoped multi-tenancy** — team-aware job visibility with role-based access, not just single-user
3. **Adaptive infrastructure** — Kubernetes HPA scales the worker layer automatically based on CPU load, no manual intervention

---

## Author

**Akshat Chauhan**
B.Tech Computer Science & Engineering
Kalinga Institute of Industrial Technology (KIIT), Bhubaneswar

GitHub: [AkZcH](https://github.com/AkZcH)

---

_Built from scratch — every layer, every algorithm, every line of infrastructure._
