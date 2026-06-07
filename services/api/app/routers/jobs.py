from fastapi import APIRouter, HTTPException, Depends
from app.models import JobCreate, JobResponse
from app.database import get_db
from app.routers.auth import get_current_user
import json
import requests
import psycopg2.extras
import os

router = APIRouter(prefix="/jobs", tags=["jobs"])

PREDICTOR_URL = os.getenv("PREDICTOR_URL", "http://localhost:8001")

def get_ml_priority(job_type: str, recent_types: list) -> float:
    try:
        res = requests.post(f"{PREDICTOR_URL}/predict", json={
            "job_type": job_type,
            "history": recent_types
        }, timeout=2)
        return res.json()["predicted_priority"]
    except Exception:
        return 0.5

@router.post("/", response_model=JobResponse)
def create_job(job: JobCreate, user=Depends(get_current_user)):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT type FROM jobs
            WHERE status = 'done'
            ORDER BY finished_at DESC
            LIMIT 3
        """)
        recent = [r['type'] for r in cur.fetchall()]
        priority = get_ml_priority(job.type, recent)
        cur.execute(
            """
            INSERT INTO jobs (name, type, payload, priority, user_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
            """,
            (job.name, job.type, json.dumps(job.payload), priority, user['sub'])
        )
        row = cur.fetchone()
        conn.commit()
        return dict(row)

@router.get("/", response_model=list[JobResponse])
def list_jobs(status: str | None = None, user=Depends(get_current_user)):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if user['role'] == 'admin':
            if status:
                cur.execute("SELECT * FROM jobs WHERE status=%s ORDER BY created_at DESC", (status,))
            else:
                cur.execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50")
        else:
            if status:
                cur.execute("SELECT * FROM jobs WHERE user_id=%s AND status=%s ORDER BY created_at DESC", (user['sub'], status))
            else:
                cur.execute("SELECT * FROM jobs WHERE user_id=%s ORDER BY created_at DESC LIMIT 50", (user['sub'],))
        return [dict(r) for r in cur.fetchall()]

@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str, user=Depends(get_current_user)):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if user['role'] == 'admin':
            cur.execute("SELECT * FROM jobs WHERE id=%s", (job_id,))
        else:
            cur.execute("SELECT * FROM jobs WHERE id=%s AND user_id=%s", (job_id, user['sub']))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        return dict(row)