from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.routers import jobs, analytics, auth, orgs
from prometheus_fastapi_instrumentator import Instrumentator
from prometheus_client import Gauge, Counter, Histogram
import asyncio
import time

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="SmartQueue API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- Prometheus setup ---
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# Custom metrics
queue_depth_gauge = Gauge(
    "smartqueue_queue_depth",
    "Number of jobs currently in queued state"
)
worker_count_gauge = Gauge(
    "smartqueue_worker_count",
    "Number of live workers (seen in last 15s)"
)
jobs_completed_counter = Counter(
    "smartqueue_jobs_completed_total",
    "Total jobs completed",
    ["job_type", "status"]  # labels: job_type=http/shell/etl/ml, status=completed/failed
)
prediction_mape_gauge = Gauge(
    "smartqueue_prediction_mape",
    "Current prediction MAPE across recent jobs"
)
job_latency_histogram = Histogram(
    "smartqueue_job_duration_seconds",
    "Actual job runtime in seconds",
    ["job_type"],
    buckets=[0.1, 0.5, 1, 2, 5, 10, 30, 60, 120]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:30001",
         "http://127.0.0.1:3000",
    ],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(jobs.router)
app.include_router(analytics.router)
app.include_router(auth.router)
app.include_router(orgs.router)

@app.on_event("startup")
async def start_metrics_collector():
    from app.routers.metrics_collector import collect_custom_metrics
    asyncio.create_task(collect_custom_metrics(
        queue_depth_gauge,
        worker_count_gauge,
        prediction_mape_gauge
    ))

@app.get("/health")
def health():
    return {"status": "ok"}