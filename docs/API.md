# SmartQueue — API Reference

## Table of Contents

1. [Overview](#overview)
2. [Base URLs](#base-urls)
3. [Job API](#job-api)
4. [ML Predictor API](#ml-predictor-api)
5. [Request & Response Models](#request--response-models)
6. [Error Handling](#error-handling)
7. [Examples](#examples)

---

## Overview

SmartQueue exposes two HTTP APIs:

| Service      | Base URL                | Description                             |
| ------------ | ----------------------- | --------------------------------------- |
| Job API      | `http://localhost:8000` | Submit, list, and query jobs            |
| ML Predictor | `http://localhost:8001` | Runtime prediction and priority scoring |

Both APIs are built with FastAPI and expose interactive Swagger documentation at `/docs`.

All request and response bodies are JSON. All timestamps are ISO 8601 UTC.

---

## Base URLs

### Development

```
Job API:      http://localhost:8000
ML Predictor: http://localhost:8001
```

### Interactive Docs

```
http://localhost:8000/docs   ← Swagger UI (Job API)
http://localhost:8001/docs   ← Swagger UI (ML Predictor)
```

---

## Job API

### Health Check

```
GET /health
```

Returns the API status.

**Response**

```json
{
  "status": "ok"
}
```

---

### Submit a Job

```
POST /jobs/
```

Submits a new job to the queue. Before inserting, the API calls the ML Predictor to compute a priority score based on the job type and recent execution history. The priority score determines where in the queue this job will be placed.

**Request Body**

| Field   | Type   | Required | Description                            |
| ------- | ------ | -------- | -------------------------------------- |
| name    | string | yes      | Human-readable job name                |
| type    | string | yes      | Job type: `etl`, `ml`, `http`, `shell` |
| payload | object | yes      | Arbitrary JSON parameters for the job  |

**Example Request**

```bash
curl -X POST http://localhost:8000/jobs/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "export-user-data",
    "type": "etl",
    "payload": {
      "source": "users_table",
      "destination": "s3://bucket/export.csv",
      "rows": 50000
    }
  }'
```

**Example Response** `200 OK`

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "name": "export-user-data",
  "type": "etl",
  "payload": {
    "source": "users_table",
    "destination": "s3://bucket/export.csv",
    "rows": 50000
  },
  "status": "queued",
  "priority": 0.847,
  "created_at": "2026-05-30T06:42:11.123456Z",
  "started_at": null,
  "finished_at": null,
  "retry_count": 0,
  "error_msg": null
}
```

**Notes**

- `priority` is assigned by the ML Predictor automatically — you do not set it manually
- If the ML Predictor is unavailable, priority defaults to `0.5`
- `status` is always `queued` on creation

---

### List Jobs

```
GET /jobs/
```

Returns the 50 most recently created jobs, ordered by `created_at` descending. Optionally filter by status.

**Query Parameters**

| Parameter | Type   | Required | Description                                             |
| --------- | ------ | -------- | ------------------------------------------------------- |
| status    | string | no       | Filter by status: `queued`, `running`, `done`, `failed` |

**Example Requests**

```bash
# All jobs (last 50)
curl http://localhost:8000/jobs/

# Only queued jobs
curl http://localhost:8000/jobs/?status=queued

# Only failed jobs
curl http://localhost:8000/jobs/?status=failed
```

**Example Response** `200 OK`

```json
[
  {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "name": "export-user-data",
    "type": "etl",
    "payload": { "source": "users_table" },
    "status": "done",
    "priority": 0.847,
    "created_at": "2026-05-30T06:42:11.123456Z",
    "started_at": "2026-05-30T06:42:13.001234Z",
    "finished_at": "2026-05-30T06:42:15.223456Z",
    "retry_count": 0,
    "error_msg": null
  },
  {
    "id": "7bc91e32-1234-4abc-9def-111222333444",
    "name": "train-model-v2",
    "type": "ml",
    "payload": { "dataset": "training_v2.parquet" },
    "status": "running",
    "priority": 0.623,
    "created_at": "2026-05-30T06:41:00.000000Z",
    "started_at": "2026-05-30T06:41:05.000000Z",
    "finished_at": null,
    "retry_count": 0,
    "error_msg": null
  }
]
```

---

### Get a Specific Job

```
GET /jobs/{job_id}
```

Returns the full details of a single job by its UUID.

**Path Parameters**

| Parameter | Type        | Description         |
| --------- | ----------- | ------------------- |
| job_id    | UUID string | The job's unique ID |

**Example Request**

```bash
curl http://localhost:8000/jobs/3fa85f64-5717-4562-b3fc-2c963f66afa6
```

**Example Response** `200 OK`

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "name": "export-user-data",
  "type": "etl",
  "payload": {
    "source": "users_table",
    "destination": "s3://bucket/export.csv",
    "rows": 50000
  },
  "status": "done",
  "priority": 0.847,
  "created_at": "2026-05-30T06:42:11.123456Z",
  "started_at": "2026-05-30T06:42:13.001234Z",
  "finished_at": "2026-05-30T06:42:15.223456Z",
  "retry_count": 0,
  "error_msg": null
}
```

**Error Response** `404 Not Found`

```json
{
  "detail": "Job not found"
}
```

---

## ML Predictor API

### Health Check

```
GET /health
```

Returns predictor status and whether a trained model is loaded.

**Response**

```json
{
  "status": "ok",
  "model_trained": true
}
```

---

### Predict Job Priority

```
POST /predict
```

Takes a job type and optional history of recent job types, and returns a predicted runtime in milliseconds and a priority score between 0 and 1.

**Request Body**

| Field    | Type             | Required | Description                                               |
| -------- | ---------------- | -------- | --------------------------------------------------------- |
| job_type | string           | yes      | The job type to predict for: `etl`, `ml`, `http`, `shell` |
| history  | array of strings | no       | Last 1–3 job types for context (most recent last)         |

**Example Request**

```bash
curl -X POST http://localhost:8001/predict \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "ml",
    "history": ["etl", "http"]
  }'
```

**Example Response** `200 OK`

```json
{
  "predicted_runtime_ms": 7240,
  "predicted_priority": 0.408,
  "job_type": "ml"
}
```

**How Priority is Computed**

```
priority = 1.0 / (1.0 + predicted_runtime_ms / 5000.0)
```

| Predicted Runtime | Priority Score |
| ----------------- | -------------- |
| 500ms             | 0.909          |
| 1000ms            | 0.833          |
| 2000ms            | 0.714          |
| 5000ms            | 0.500          |
| 10000ms           | 0.333          |
| 30000ms           | 0.143          |

Shorter jobs → higher priority → processed first.

**Job Type Reference**

| Type    | Typical Runtime | Typical Priority |
| ------- | --------------- | ---------------- |
| `http`  | ~800ms          | ~0.86            |
| `shell` | ~1500ms         | ~0.77            |
| `etl`   | ~2000ms         | ~0.71            |
| `ml`    | ~8000ms         | ~0.38            |

---

## Request & Response Models

### JobCreate (Request)

```typescript
{
  name: string; // required, job display name
  type: string; // required, one of: etl | ml | http | shell
  payload: object; // required, arbitrary JSON
}
```

### JobResponse

```typescript
{
  id: string; // UUID
  name: string;
  type: string;
  payload: object;
  status: string; // queued | running | done | failed
  priority: number; // 0.0 – 1.0, ML-assigned
  created_at: string; // ISO 8601 UTC
  started_at: string | null;
  finished_at: string | null;
  retry_count: number;
  error_msg: string | null;
}
```

### PredictRequest

```typescript
{
  job_type: string;         // etl | ml | http | shell
  history: string[];        // optional, last 1-3 job types
}
```

### PredictResponse

```typescript
{
  predicted_runtime_ms: number; // estimated execution time in ms
  predicted_priority: number; // 0.0 – 1.0
  job_type: string;
}
```

---

## Error Handling

All errors follow FastAPI's standard error format:

```json
{
  "detail": "Error message here"
}
```

### HTTP Status Codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| 200  | Success                                                |
| 422  | Validation error — missing or malformed request fields |
| 404  | Job not found                                          |
| 500  | Internal server error — check API logs                 |

### Common Errors

**Missing required field**

```json
{
  "detail": [
    {
      "loc": ["body", "name"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

**Invalid JSON payload**

```
HTTP 422 Unprocessable Entity
```

Make sure `payload` is a valid JSON object, not a string.

**Job not found**

```json
{
  "detail": "Job not found"
}
```

---

## Examples

### Submit and poll until done

```bash
# Submit
JOB_ID=$(curl -s -X POST http://localhost:8000/jobs/ \
  -H "Content-Type: application/json" \
  -d '{"name": "my-job", "type": "etl", "payload": {"file": "data.csv"}}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Job ID: $JOB_ID"

# Poll until done
while true; do
  STATUS=$(curl -s http://localhost:8000/jobs/$JOB_ID | python -c "import sys,json; print(json.load(sys.stdin)['status'])")
  echo "Status: $STATUS"
  if [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
  sleep 2
done
```

### Submit multiple job types and compare priorities

```bash
for TYPE in etl ml http shell; do
  RESULT=$(curl -s -X POST http://localhost:8001/predict \
    -H "Content-Type: application/json" \
    -d "{\"job_type\": \"$TYPE\", \"history\": []}")
  echo "$TYPE → $RESULT"
done
```

### Get all failed jobs

```bash
curl -s http://localhost:8000/jobs/?status=failed | python -m json.tool
```

---

_This document is part of the SmartQueue final year project documentation._  
_Author: Akshat Chauhan | KIIT | B.Tech CSE_
