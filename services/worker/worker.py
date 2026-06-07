import psycopg2
import psycopg2.extras
import time
import requests
import os
import socket
import random

DB = os.getenv("DB_URL", "host=127.0.0.1 port=5433 dbname=smartqueue user=sq password=anything")
PREDICTOR_URL = os.getenv("PREDICTOR_URL", "http://localhost:8001")
WORKER_ID = os.getenv("WORKER_ID", f"worker-{socket.gethostname()}")
POLL_INTERVAL = 3
HEARTBEAT_INTERVAL = 5
LEASE_DURATION = 30      # seconds — job must finish within this or gets reclaimed
STUCK_JOB_TIMEOUT = 15   # seconds — worker silent this long = dead
MAX_RETRIES = 3

def get_conn():
    return psycopg2.connect(DB)

# ── Registration & Heartbeat ─────────────────────────────────────────────────

def register_worker(conn):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO worker_registry (worker_id, hostname, status)
            VALUES (%s, %s, 'active')
            ON CONFLICT (worker_id) DO UPDATE
              SET hostname = EXCLUDED.hostname,
                  last_seen = now(),
                  status = 'active'
        """, (WORKER_ID, socket.gethostname()))
        conn.commit()
    print(f"[{WORKER_ID}] Registered")

def heartbeat(conn):
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE worker_registry
            SET last_seen = now()
            WHERE worker_id = %s
        """, (WORKER_ID,))
        conn.commit()

def deregister_worker(conn):
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE worker_registry SET status = 'offline'
            WHERE worker_id = %s
        """, (WORKER_ID,))
        conn.commit()
    print(f"[{WORKER_ID}] Deregistered")

# ── Stuck Job Recovery (watchdog) ────────────────────────────────────────────

def recover_stuck_jobs(conn):
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE jobs
            SET status = 'queued',
                started_at = NULL,
                lease_expires_at = NULL
            WHERE status = 'running'
              AND lease_expires_at < now()
            RETURNING id, name
        """)
        recovered = cur.fetchall()
        if recovered:
            for job_id, name in recovered:
                print(f"[watchdog] Recovered stuck job: {name} ({job_id})")
        conn.commit()
        return len(recovered)

# ── Job Claiming ──────────────────────────────────────────────────────────────

def pick_job(conn):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            UPDATE jobs
            SET status = 'running',
                started_at = now(),
                lease_expires_at = now() + interval '%s seconds'
            WHERE id = (
                SELECT id FROM jobs
                WHERE status = 'queued'
                ORDER BY priority DESC, created_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING *
        """, (LEASE_DURATION,))
        conn.commit()
        return cur.fetchone()

# ── Job Execution ─────────────────────────────────────────────────────────────

def renew_lease(conn, job_id):
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE jobs
            SET lease_expires_at = now() + interval '%s seconds'
            WHERE id = %s
        """, (LEASE_DURATION, job_id))
        conn.commit()

def finish_job(conn, job_id, success, error_msg=None):
    with conn.cursor() as cur:
        if success:
            cur.execute("""
                UPDATE jobs
                SET status = 'done', finished_at = now(), lease_expires_at = NULL
                WHERE id = %s
            """, (job_id,))
        else:
            cur.execute("""
                UPDATE jobs
                SET status = 'failed',
                    finished_at = now(),
                    lease_expires_at = NULL,
                    error_msg = %s
                WHERE id = %s
            """, (error_msg, job_id))
        conn.commit()

def requeue_job(conn, job_id, retry_count, error_msg):
    backoff = min(2 ** retry_count + random.uniform(0, 1), 60)
    print(f"  Requeuing in {backoff:.1f}s (retry {retry_count + 1}/{MAX_RETRIES})")
    time.sleep(backoff)
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE jobs
            SET status = 'queued',
                started_at = NULL,
                lease_expires_at = NULL,
                retry_count = retry_count + 1,
                error_msg = %s
            WHERE id = %s
        """, (error_msg, job_id))
        conn.commit()

def log_execution(conn, job_id, runtime_ms, predicted_runtime_ms, success):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO execution_logs (job_id, runtime_ms, predicted_runtime_ms, worker_id, status)
            VALUES (%s, %s, %s, %s, %s)
        """, (job_id, runtime_ms, predicted_runtime_ms, WORKER_ID, 'success' if success else 'failed'))
        conn.commit()

def increment_jobs_processed(conn):
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE worker_registry
            SET jobs_processed = jobs_processed + 1
            WHERE worker_id = %s
        """, (WORKER_ID,))
        conn.commit()

# ── Predictor ─────────────────────────────────────────────────────────────────

def call_predictor(job_type: str, history: list) -> int:
    try:
        res = requests.post(f"{PREDICTOR_URL}/predict", json={
            "job_type": job_type,
            "history": history
        }, timeout=2)
        return res.json()["predicted_runtime_ms"]
    except Exception:
        return 2000

def get_recent_types(conn, limit=3) -> list:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT type FROM jobs
            WHERE status = 'done'
            ORDER BY finished_at DESC
            LIMIT %s
        """, (limit,))
        return [r[0] for r in cur.fetchall()]

# ── Job Simulation ────────────────────────────────────────────────────────────

def execute_job(job):
    job_type = job['type']
    payload = job['payload']
    print(f"  Executing [{job_type}] payload={payload}")
    durations = {'etl': 2, 'ml': 4, 'http': 1, 'shell': 2}
    time.sleep(durations.get(job_type, 2))
    return True, None

# ── Main Loop ─────────────────────────────────────────────────────────────────

def run():
    print(f"Worker {WORKER_ID} starting...")
    conn = get_conn()
    register_worker(conn)

    last_heartbeat = time.time()
    last_watchdog = time.time()

    try:
        while True:
            now = time.time()

            # Heartbeat
            if now - last_heartbeat >= HEARTBEAT_INTERVAL:
                heartbeat(conn)
                last_heartbeat = now

            # Watchdog — recover stuck jobs
            if now - last_watchdog >= STUCK_JOB_TIMEOUT:
                recover_stuck_jobs(conn)
                last_watchdog = now

            # Pick and execute a job
            job = pick_job(conn)
            if job:
                job = dict(job)
                print(f"Picked job: {job['id']} | {job['name']} | {job['type']}")

                history = get_recent_types(conn)
                predicted_ms = call_predictor(job['type'], history)
                print(f"  Predicted runtime: {predicted_ms}ms")

                start = time.time()
                success, error = execute_job(job)
                runtime_ms = int((time.time() - start) * 1000)

                if success:
                    finish_job(conn, job['id'], True)
                    log_execution(conn, job['id'], runtime_ms, predicted_ms, True)
                    increment_jobs_processed(conn)
                    print(f"  Done in {runtime_ms}ms | Predicted: {predicted_ms}ms")
                else:
                    if job['retry_count'] < MAX_RETRIES:
                        requeue_job(conn, job['id'], job['retry_count'], error)
                    else:
                        finish_job(conn, job['id'], False, f"Max retries exceeded: {error}")
                        log_execution(conn, job['id'], runtime_ms, predicted_ms, False)
                        print(f"  Failed permanently after {MAX_RETRIES} retries")
            else:
                print(f"No jobs. Waiting {POLL_INTERVAL}s...")
                time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print(f"\n[{WORKER_ID}] Shutting down...")
        deregister_worker(conn)
        conn.close()

if __name__ == "__main__":
    run()