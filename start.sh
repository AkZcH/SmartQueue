#!/bin/bash

echo "Starting SmartQueue..."

# Start Docker DB
cd docker
docker-compose up -d
cd ..

echo "Waiting for Postgres to be ready..."
sleep 3

# Terminal 2 - API
start bash -c "cd 'services/api' && uvicorn app.main:app --reload --port 8000; exec bash"

# Terminal 3 - Predictor
start bash -c "cd 'services/predictor' && uvicorn app:app --reload --port 8001; exec bash"

# Terminal 4 - Scheduler
start bash -c "cd 'services/scheduler' && npx ts-node src/index.ts; exec bash"

# Terminal 5 - Worker
start bash -c "cd 'services/worker' && python worker.py; exec bash"

# Terminal 6 - Frontend
start bash -c "cd 'frontend' && npm run dev; exec bash"

echo "All services started!"
echo "Dashboard:  http://localhost:3000"
echo "API docs:   http://localhost:8000/docs"
echo "ML Predictor: http://localhost:8001/docs"