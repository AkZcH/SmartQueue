from fastapi import APIRouter, Depends
from app.database import get_db
from app.routers.auth import get_current_user
import psycopg2.extras

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/summary")
def get_summary(user=Depends(get_current_user)):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'done')    AS total_done,
                COUNT(*) FILTER (WHERE status = 'failed')  AS total_failed,
                COUNT(*) FILTER (WHERE status = 'queued')  AS total_queued,
                COUNT(*) FILTER (WHERE status = 'running') AS total_running,
                ROUND(
                    100.0 * COUNT(*) FILTER (WHERE status = 'done')
                    / NULLIF(COUNT(*) FILTER (WHERE status IN ('done','failed')), 0),
                2) AS success_rate
            FROM jobs
        """)
        counts = dict(cur.fetchone())

        cur.execute("""
            SELECT j.type,
                   ROUND(AVG(el.runtime_ms))           AS avg_actual_ms,
                   ROUND(AVG(el.predicted_runtime_ms)) AS avg_predicted_ms,
                   COUNT(*) AS total
            FROM jobs j
            JOIN execution_logs el ON el.job_id = j.id
            WHERE j.status = 'done'
              AND el.predicted_runtime_ms IS NOT NULL
            GROUP BY j.type
            ORDER BY avg_actual_ms DESC
        """)
        by_type = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT ROUND(AVG(
                ABS(el.predicted_runtime_ms - el.runtime_ms)
                * 100.0 / NULLIF(el.runtime_ms, 0)
            ), 1) AS mape_pct
            FROM execution_logs el
            WHERE el.predicted_runtime_ms IS NOT NULL AND el.runtime_ms > 0
        """)
        mape_row = cur.fetchone()
        mape = float(mape_row['mape_pct']) if mape_row['mape_pct'] else None

        # Queue health metrics
        cur.execute("""
            SELECT
                ROUND(AVG(
                    EXTRACT(EPOCH FROM (started_at - created_at)) * 1000
                )) AS avg_queue_wait_ms,
                ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (started_at - created_at)) * 1000
                )) AS p95_queue_wait_ms
            FROM jobs
            WHERE started_at IS NOT NULL AND created_at IS NOT NULL
              AND started_at >= now() - INTERVAL '24 hours'
        """)
        wait_row = cur.fetchone()

        cur.execute("""
            SELECT ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (
                ORDER BY el.runtime_ms
            )) AS p95_execution_ms
            FROM execution_logs el
            WHERE el.logged_at >= now() - INTERVAL '24 hours'
              AND el.runtime_ms IS NOT NULL
        """)
        p95_row = cur.fetchone()

        cur.execute("""
            SELECT COUNT(*) AS jobs_last_hour
            FROM jobs
            WHERE finished_at >= now() - INTERVAL '1 hour'
              AND status = 'done'
        """)
        jph_row = cur.fetchone()

        return {
            "counts": counts,
            "by_type": by_type,
            "prediction_mape_pct": mape,
            "queue_health": {
                "avg_queue_wait_ms": float(wait_row['avg_queue_wait_ms']) if wait_row['avg_queue_wait_ms'] else 0,
                "p95_queue_wait_ms": float(wait_row['p95_queue_wait_ms']) if wait_row['p95_queue_wait_ms'] else 0,
                "p95_execution_ms": float(p95_row['p95_execution_ms']) if p95_row['p95_execution_ms'] else 0,
                "jobs_last_hour": int(jph_row['jobs_last_hour']) if jph_row['jobs_last_hour'] else 0,
            }
        }

@router.get("/throughput")
def get_throughput(user=Depends(get_current_user)):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Check if we have recent data (last 24h)
        cur.execute("""
            SELECT COUNT(*) AS recent
            FROM jobs
            WHERE finished_at >= now() - INTERVAL '24 hours'
        """)
        recent_count = cur.fetchone()['recent']

        if recent_count > 0:
            # Use 30-min buckets for last 24h
            cur.execute("""
                SELECT
                    DATE_TRUNC('hour', finished_at) +
                    INTERVAL '30 min' * FLOOR(EXTRACT(MINUTE FROM finished_at) / 30) AS bucket,
                    COUNT(*) FILTER (WHERE status = 'done')   AS done,
                    COUNT(*) FILTER (WHERE status = 'failed') AS failed
                FROM jobs
                WHERE finished_at IS NOT NULL
                  AND finished_at >= now() - INTERVAL '24 hours'
                GROUP BY bucket
                ORDER BY bucket ASC
            """)
        else:
            # Fall back to all-time hourly buckets
            cur.execute("""
                SELECT
                    DATE_TRUNC('hour', finished_at) AS bucket,
                    COUNT(*) FILTER (WHERE status = 'done')   AS done,
                    COUNT(*) FILTER (WHERE status = 'failed') AS failed
                FROM jobs
                WHERE finished_at IS NOT NULL
                GROUP BY bucket
                ORDER BY bucket ASC
                LIMIT 48
            """)

        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r['bucket'] = r['bucket'].isoformat()
        return rows

@router.get("/queue-depth")
def get_queue_depth(user=Depends(get_current_user)):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT
                DATE_TRUNC('hour', created_at) AS bucket,
                COUNT(*) AS jobs_created
            FROM jobs
            WHERE created_at >= now() - INTERVAL '48 hours'
            GROUP BY bucket
            ORDER BY bucket ASC
        """)
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r['bucket'] = r['bucket'].isoformat()
        return rows

@router.get("/prediction-accuracy")
def get_prediction_accuracy(user=Depends(get_current_user)):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT
                j.type,
                el.runtime_ms           AS actual_ms,
                el.predicted_runtime_ms AS predicted_ms,
                j.finished_at
            FROM execution_logs el
            JOIN jobs j ON j.id = el.job_id
            WHERE el.predicted_runtime_ms IS NOT NULL
              AND el.runtime_ms IS NOT NULL
            ORDER BY j.finished_at DESC
            LIMIT 100
        """)
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r['finished_at'] = r['finished_at'].isoformat() if r['finished_at'] else None
        return rows

@router.get("/scheduler-leader")
def get_scheduler_leader(user=Depends(get_current_user)):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT worker_id, elected_at, last_seen,
                   EXTRACT(EPOCH FROM (now() - last_seen))::int AS seconds_since_heartbeat
            FROM scheduler_leader
            WHERE id = 1
        """)
        row = cur.fetchone()
        if not row:
            return {"leader": None, "status": "no leader elected"}
        row = dict(row)
        row['elected_at'] = row['elected_at'].isoformat()
        row['last_seen'] = row['last_seen'].isoformat()
        row['status'] = 'active' if row['seconds_since_heartbeat'] < 15 else 'stale'
        return row