import psycopg2
import psycopg2.extras
import time
import requests
from datetime import datetime, timezone
import os

DB = os.getenv("DB_URL", "host=127.0.0.1 port=5433 dbname=smartqueue user=sq password=anything")
PREDICTOR_URL = os.getenv("PREDICTOR_URL", "http://localhost:8001")
WORKER_ID = "worker-1"
POLL_INTERVAL = 3

def get_conn():
    return psycopg2.connect(DB)

def call_predictor(job_type: str, history: list) -> int:
    try:
        res = requests.post(f"{PREDICTOR_URL}/predict", json={
            "job_type": job_type,
            "history": history
        }, timeout=2)
        return res.json()["predicted_runtime_ms"]
    except Exception:
        return 2000  # fallback

def get_recent_types(conn, limit=3) -> list:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT type FROM jobs
            WHERE status = 'done'
            ORDER BY finished_at DESC
            LIMIT %s
        """, (limit,))
        return [r[0] for r in cur.fetchall()]

def pick_job(conn):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            UPDATE jobs
            SET status = 'running', started_at = now()
            WHERE id = (
                SELECT id FROM jobs
                WHERE status = 'queued'
                ORDER BY priority DESC, created_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING *
        """)
        conn.commit()
        return cur.fetchone()

def finish_job(conn, job_id, success, error_msg=None):
    with conn.cursor() as cur:
        if success:
            cur.execute("""
                UPDATE jobs SET status = 'done', finished_at = now()
                WHERE id = %s
            """, (job_id,))
        else:
            cur.execute("""
                UPDATE jobs SET status = 'failed', finished_at = now(), error_msg = %s
                WHERE id = %s
            """, (error_msg, job_id))
        conn.commit()

def log_execution(conn, job_id, runtime_ms, predicted_runtime_ms):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO execution_logs (job_id, runtime_ms, predicted_runtime_ms, worker_id)
            VALUES (%s, %s, %s, %s)
        """, (job_id, runtime_ms, predicted_runtime_ms, WORKER_ID))
        conn.commit()

def execute_job(job):
    job_type = job['type']
    payload = job['payload']
    print(f"  Executing [{job_type}] payload={payload}")
    durations = {'etl': 2, 'ml': 4, 'http': 1, 'shell': 2}
    time.sleep(durations.get(job_type, 2))
    return True, None

def run():
    print(f"Worker {WORKER_ID} starting...")
    conn = get_conn()
    while True:
        try:
            job = pick_job(conn)
            if job:
                job = dict(job)
                print(f"Picked job: {job['id']} | {job['name']} | {job['type']}")

                # Get prediction before executing
                history = get_recent_types(conn)
                predicted_ms = call_predictor(job['type'], history)
                print(f"  Predicted runtime: {predicted_ms}ms")

                start = time.time()
                success, error = execute_job(job)
                runtime_ms = int((time.time() - start) * 1000)

                finish_job(conn, job['id'], success, error)
                log_execution(conn, job['id'], runtime_ms, predicted_ms)
                print(f"  Actual: {runtime_ms}ms | Predicted: {predicted_ms}ms | status: {'done' if success else 'failed'}")
            else:
                print(f"No jobs in queue. Waiting {POLL_INTERVAL}s...")
                time.sleep(POLL_INTERVAL)
        except Exception as e:
            print(f"Worker error: {e}")
            time.sleep(POLL_INTERVAL)
            try:
                conn = get_conn()
            except:
                pass

if __name__ == "__main__":
    run()