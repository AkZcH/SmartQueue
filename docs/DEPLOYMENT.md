# SmartQueue — Deployment Documentation

## Table of Contents

1. [Overview](#overview)
2. [Local Development](#local-development)
3. [Docker](#docker)
4. [Kubernetes](#kubernetes)
5. [Environment Variables](#environment-variables)
6. [Service Ports](#service-ports)
7. [Troubleshooting](#troubleshooting)

---

## Overview

SmartQueue has three deployment modes:

| Mode               | Use Case                      | Tools                             |
| ------------------ | ----------------------------- | --------------------------------- |
| **Local**          | Development, debugging        | Python, Node.js, Docker (DB only) |
| **Docker Compose** | Full local stack, demo        | Docker, docker-compose            |
| **Kubernetes**     | Production, auto-scaling demo | Minikube, kubectl                 |

---

## Local Development

The fastest way to get running. Database runs in Docker, all services run natively.

### Prerequisites

| Tool           | Version | Install     |
| -------------- | ------- | ----------- |
| Python         | 3.11+   | python.org  |
| Node.js        | 20+     | nodejs.org  |
| Docker Desktop | latest  | docker.com  |
| Git            | any     | git-scm.com |

### Step 1 — Clone and setup

```bash
git clone <repo-url>
cd smartqueue
```

### Step 2 — Start everything

```bash
chmod +x start.sh
./start.sh
```

Or manually in 6 terminals:

**Terminal 1 — Database**

```bash
cd docker
docker-compose up -d
docker exec -i docker-postgres-1 psql -U sq -d smartqueue < ../db/migrations/001_init.sql
```

**Terminal 2 — API**

```bash
cd services/api
pip install fastapi uvicorn psycopg2-binary pydantic requests
uvicorn app.main:app --reload --port 8000
```

**Terminal 3 — ML Predictor**

```bash
cd services/predictor
pip install numpy psycopg2-binary fastapi uvicorn
python generate_data.py
python train.py
uvicorn app:app --reload --port 8001
```

**Terminal 4 — Scheduler**

```bash
cd services/scheduler
npm install
npx ts-node src/index.ts
```

**Terminal 5 — Worker**

```bash
cd services/worker
python worker.py
```

**Terminal 6 — Frontend**

```bash
cd frontend
npm install
npm run dev
```

### Step 3 — Verify

| Service      | URL                          | Expected          |
| ------------ | ---------------------------- | ----------------- |
| Dashboard    | http://localhost:3000        | Live job queue UI |
| API docs     | http://localhost:8000/docs   | Swagger UI        |
| ML Predictor | http://localhost:8001/docs   | Swagger UI        |
| Health check | http://localhost:8000/health | `{"status":"ok"}` |

---

## Docker

Each service has its own `Dockerfile`. Docker Compose runs the full stack together.

### Dockerfiles

**`docker/Dockerfile.api`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY services/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/api/app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**`docker/Dockerfile.worker`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY services/worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/worker/worker.py .
CMD ["python", "worker.py"]
```

**`docker/Dockerfile.predictor`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY services/predictor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/predictor/ .
EXPOSE 8001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
```

**`docker/Dockerfile.scheduler`**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY services/scheduler/package*.json .
RUN npm install
COPY services/scheduler/ .
CMD ["npx", "ts-node", "src/index.ts"]
```

**`docker/Dockerfile.frontend`**

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY frontend/package*.json .
RUN npm install
COPY frontend/ .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

### Full Docker Compose

**`docker/docker-compose.full.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: smartqueue
      POSTGRES_USER: sq
      POSTGRES_PASSWORD: sq_pass
      POSTGRES_HOST_AUTH_METHOD: trust
    ports:
      - "5433:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sq -d smartqueue"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: ..
      dockerfile: docker/Dockerfile.api
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://sq:sq_pass@postgres:5432/smartqueue
    depends_on:
      postgres:
        condition: service_healthy

  predictor:
    build:
      context: ..
      dockerfile: docker/Dockerfile.predictor
    ports:
      - "8001:8001"
    environment:
      DATABASE_URL: postgresql://sq:sq_pass@postgres:5432/smartqueue
    depends_on:
      postgres:
        condition: service_healthy

  scheduler:
    build:
      context: ..
      dockerfile: docker/Dockerfile.scheduler
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: smartqueue
      DB_USER: sq
      DB_PASSWORD: sq_pass
    depends_on:
      postgres:
        condition: service_healthy

  worker:
    build:
      context: ..
      dockerfile: docker/Dockerfile.worker
    environment:
      DATABASE_URL: postgresql://sq:sq_pass@postgres:5432/smartqueue
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    build:
      context: ..
      dockerfile: docker/Dockerfile.frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    depends_on:
      - api

volumes:
  pg_data:
```

### Running Full Docker Stack

```bash
cd docker
docker-compose -f docker-compose.full.yml up --build
```

---

## Kubernetes

Kubernetes is used for the production deployment demo — specifically to show **Horizontal Pod Autoscaling (HPA)** of the worker pods based on CPU usage (which correlates with queue depth).

### Prerequisites

```bash
# Install minikube
# Windows: choco install minikube
# Mac: brew install minikube

# Install kubectl
# Windows: choco install kubernetes-cli
# Mac: brew install kubectl

# Start minikube
minikube start --driver=docker
```

### Kubernetes Manifests

All manifests live in `k8s/`.

**`k8s/postgres.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16
          env:
            - name: POSTGRES_DB
              value: smartqueue
            - name: POSTGRES_USER
              value: sq
            - name: POSTGRES_PASSWORD
              value: sq_pass
            - name: POSTGRES_HOST_AUTH_METHOD
              value: trust
          ports:
            - containerPort: 5432
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
```

**`k8s/api.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 1
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: smartqueue-api:latest
          imagePullPolicy: Never
          env:
            - name: DATABASE_URL
              value: postgresql://sq:sq_pass@postgres:5432/smartqueue
          ports:
            - containerPort: 8000
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "256Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  type: NodePort
  selector:
    app: api
  ports:
    - port: 8000
      targetPort: 8000
      nodePort: 30000
```

**`k8s/worker.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worker
spec:
  replicas: 2
  selector:
    matchLabels:
      app: worker
  template:
    metadata:
      labels:
        app: worker
    spec:
      containers:
        - name: worker
          image: smartqueue-worker:latest
          imagePullPolicy: Never
          env:
            - name: DATABASE_URL
              value: postgresql://sq:sq_pass@postgres:5432/smartqueue
          resources:
            requests:
              cpu: "100m"
              memory: "64Mi"
            limits:
              cpu: "300m"
              memory: "128Mi"
```

**`k8s/hpa.yaml`** — Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: worker
  minReplicas: 1
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
```

### Deploy to Minikube

```bash
# Start minikube
minikube start --driver=docker

# Enable metrics server for HPA
minikube addons enable metrics-server

# Build images inside minikube's Docker
eval $(minikube docker-env)
docker build -f docker/Dockerfile.api -t smartqueue-api:latest .
docker build -f docker/Dockerfile.worker -t smartqueue-worker:latest .
docker build -f docker/Dockerfile.predictor -t smartqueue-predictor:latest .
docker build -f docker/Dockerfile.scheduler -t smartqueue-scheduler:latest .

# Apply all manifests
kubectl apply -f k8s/

# Check everything is running
kubectl get pods
kubectl get services
kubectl get hpa
```

### Access the API in Minikube

```bash
minikube service api --url
```

### Watch HPA Scaling (Demo)

```bash
# Watch pods scale in real time
kubectl get hpa worker-hpa --watch

# In another terminal — flood the queue
for i in {1..50}; do
  curl -s -X POST http://$(minikube service api --url)/jobs/ \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"load-test-$i\", \"type\": \"ml\", \"payload\": {}}" &
done

# Watch pods increase from 2 → up to 10
kubectl get pods --watch
```

### Useful kubectl Commands

```bash
# View all pods
kubectl get pods

# View logs of a worker pod
kubectl logs -l app=worker --tail=50

# View HPA status
kubectl get hpa

# Scale workers manually
kubectl scale deployment worker --replicas=5

# Delete everything
kubectl delete -f k8s/

# Stop minikube
minikube stop
```

---

## Environment Variables

### API Service

| Variable        | Default                                             | Description                  |
| --------------- | --------------------------------------------------- | ---------------------------- |
| `DATABASE_URL`  | `postgresql://sq:sq_pass@127.0.0.1:5433/smartqueue` | PostgreSQL connection string |
| `PREDICTOR_URL` | `http://localhost:8001`                             | ML Predictor base URL        |

### ML Predictor

| Variable       | Default                                             | Description                  |
| -------------- | --------------------------------------------------- | ---------------------------- |
| `DATABASE_URL` | `postgresql://sq:sq_pass@127.0.0.1:5433/smartqueue` | PostgreSQL connection string |

### Worker

| Variable        | Default                                             | Description                                |
| --------------- | --------------------------------------------------- | ------------------------------------------ |
| `DATABASE_URL`  | `postgresql://sq:sq_pass@127.0.0.1:5433/smartqueue` | PostgreSQL connection string               |
| `WORKER_ID`     | `worker-1`                                          | Unique identifier for this worker instance |
| `POLL_INTERVAL` | `3`                                                 | Seconds between queue polls                |

### Scheduler

| Variable      | Default      | Description       |
| ------------- | ------------ | ----------------- |
| `DB_HOST`     | `127.0.0.1`  | PostgreSQL host   |
| `DB_PORT`     | `5433`       | PostgreSQL port   |
| `DB_NAME`     | `smartqueue` | Database name     |
| `DB_USER`     | `sq`         | Database user     |
| `DB_PASSWORD` | `anything`   | Database password |

### Frontend

| Variable              | Default                 | Description  |
| --------------------- | ----------------------- | ------------ |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | API base URL |

---

## Service Ports

| Service      | Local Port | Container Port | Description                                         |
| ------------ | ---------- | -------------- | --------------------------------------------------- |
| PostgreSQL   | 5433       | 5432           | Database (5433 avoids conflict with local Postgres) |
| FastAPI      | 8000       | 8000           | Job API                                             |
| ML Predictor | 8001       | 8001           | LSTM inference API                                  |
| Next.js      | 3000       | 3000           | Frontend dashboard                                  |
| Scheduler    | —          | —              | No HTTP server, internal only                       |
| Worker       | —          | —              | No HTTP server, internal only                       |

---

## Troubleshooting

### Port 5432 already in use

A local PostgreSQL installation is running on port 5432. SmartQueue uses port 5433 to avoid this conflict. Check `docker-compose.yml` has `"5433:5432"` in the ports section.

```bash
# Check what is using port 5432
netstat -ano | grep 5432
```

### Docker container not starting

```bash
# Check container logs
docker logs docker-postgres-1

# Check Docker is running
docker ps
```

### API cannot connect to database

```bash
# Test connection
python -c "
import psycopg2
conn = psycopg2.connect('host=127.0.0.1 port=5433 dbname=smartqueue user=sq password=anything')
print('Connected:', conn.status)
"
```

### ML Predictor returns 0.5 for all jobs

The model file `model.npz` is missing. Run training:

```bash
cd services/predictor
python generate_data.py
python train.py
```

### Scheduler shows stale queue size

The scheduler syncs with the DB every 2 seconds. If it shows a non-zero queue size but the DB has no queued jobs, restart the scheduler:

```bash
cd services/scheduler
npx ts-node src/index.ts
```

### Kubernetes pods not starting

```bash
# Check pod status
kubectl describe pod <pod-name>

# Check if images are built
docker images | grep smartqueue

# Rebuild images inside minikube
eval $(minikube docker-env)
docker build -f docker/Dockerfile.worker -t smartqueue-worker:latest .
```

### HPA not scaling

Make sure the metrics server addon is enabled:

```bash
minikube addons enable metrics-server
kubectl top pods   # should show CPU usage
```

---

_This document is part of the SmartQueue final year project documentation._  
_Author: Akshat Chauhan | KIIT | B.Tech CSE_
