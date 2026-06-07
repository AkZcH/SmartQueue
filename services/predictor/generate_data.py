import psycopg2
import random
from datetime import datetime, timezone, timedelta

DB = "host=127.0.0.1 port=5433 dbname=smartqueue user=sq password=anything"

# Much more distinct runtime distributions per type
RUNTIMES = {
    'etl':   {'mean': 3000,  'std': 500},
    'ml':    {'mean': 12000, 'std': 2000},
    'http':  {'mean': 400,   'std': 80},
    'shell': {'mean': 1500,  'std': 300},
}

def generate():
    conn = psycopg2.connect(DB)
    cur = conn.cursor()

    # First clear old synthetic data
    cur.execute("DELETE FROM execution_logs WHERE worker_id = 'worker-synthetic'")
    cur.execute("DELETE FROM jobs WHERE payload::text LIKE '%synthetic%'")
    conn.commit()

    now = datetime.now(timezone.utc)
    count = 0

    # Generate 200 jobs with strongly distinct runtimes
    for i in range(200):
        job_type = random.choice(['etl', 'ml', 'http', 'shell'])
        dist = RUNTIMES[job_type]
        runtime_ms = max(100, int(random.gauss(dist['mean'], dist['std'])))

        created = now - timedelta(hours=random.randint(1, 72))
        started = created + timedelta(seconds=random.randint(1, 5))
        finished = started + timedelta(milliseconds=runtime_ms)

        cur.execute("""
            INSERT INTO jobs (name, type, payload, status, priority, created_at, started_at, finished_at)
            VALUES (%s, %s, %s, 'done', %s, %s, %s, %s)
            RETURNING id
        """, (
            f"synthetic-job-{i}",
            job_type,
            '{"synthetic": true}',
            round(random.uniform(0.2, 0.9), 2),
            created, started, finished
        ))
        job_id = cur.fetchone()[0]
        cur.execute("""
            INSERT INTO execution_logs (job_id, runtime_ms, worker_id)
            VALUES (%s, %s, 'worker-synthetic')
        """, (job_id, runtime_ms))
        count += 1

    conn.commit()
    conn.close()
    print(f"Generated {count} synthetic jobs.")
    print("Runtime distributions:")
    for t, d in RUNTIMES.items():
        print(f"  {t:6s} → mean={d['mean']}ms  std={d['std']}ms")

if __name__ == "__main__":
    generate()