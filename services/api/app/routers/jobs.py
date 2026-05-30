from fastapi import APIRouter, HTTPException
from app.models import JobCreate, JobResponse
from app.database import get_db
import json
import uuid

router = APIRouter(prefix="/jobs", tags=["jobs"])

@router.post("/", response_model=JobResponse)
def create_job(job: JobCreate):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=__import__('psycopg2').extras.RealDictCursor)
        cur.execute(
            """
            INSERT INTO jobs (name, type, payload)
            VALUES (%s, %s, %s)
            RETURNING *
            """,
            (job.name, job.type, json.dumps(job.payload))
        )
        row = cur.fetchone()
        return dict(row)

@router.get("/", response_model=list[JobResponse])
def list_jobs(status: str | None = None):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=__import__('psycopg2').extras.RealDictCursor)
        if status:
            cur.execute("SELECT * FROM jobs WHERE status=%s ORDER BY created_at DESC", (status,))
        else:
            cur.execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50")
        return [dict(r) for r in cur.fetchall()]

@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=__import__('psycopg2').extras.RealDictCursor)
        cur.execute("SELECT * FROM jobs WHERE id=%s", (job_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        return dict(row)