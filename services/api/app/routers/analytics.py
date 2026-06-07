from fastapi import APIRouter
from app.database import get_db
import psycopg2.extras

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/summary")
def get_summary():
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Overall counts
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

        # Avg runtime per type
        cur.execute("""
            SELECT j.type,
                   ROUND(AVG(el.runtime_ms))       AS avg_actual_ms,
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

        # ML prediction accuracy (MAPE)
        cur.execute("""
            SELECT
                ROUND(AVG(
                    ABS(el.predicted_runtime_ms - el.runtime_ms)
                    * 100.0 / NULLIF(el.runtime_ms, 0)
                ), 1) AS mape_pct
            FROM execution_logs el
            WHERE el.predicted_runtime_ms IS NOT NULL
              AND el.runtime_ms > 0
        """)
        mape_row = cur.fetchone()
        mape = float(mape_row['mape_pct']) if mape_row['mape_pct'] else None

        return {
            "counts": counts,
            "by_type": by_type,
            "prediction_mape_pct": mape
        }

@router.get("/throughput")
def get_throughput():
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT
                DATE_TRUNC('hour', finished_at) AS bucket,
                COUNT(*) FILTER (WHERE status = 'done')   AS done,
                COUNT(*) FILTER (WHERE status = 'failed') AS failed
            FROM jobs
            WHERE finished_at IS NOT NULL
              AND finished_at >= now() - INTERVAL '24 hours'
            GROUP BY bucket
            ORDER BY bucket ASC
        """)
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r['bucket'] = r['bucket'].isoformat()
        return rows

@router.get("/queue-depth")
def get_queue_depth():
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
def get_prediction_accuracy():
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT
                j.type,
                el.runtime_ms       AS actual_ms,
                el.predicted_runtime_ms AS predicted_ms,
                j.finished_at
            FROM execution_logs el
            JOIN jobs j ON j.id = el.job_id
            WHERE el.predicted_runtime_ms IS NOT NULL
              AND el.runtime_ms IS NOT NULL
            ORDER BY j.finished_at DESC
            LIMIT 50
        """)
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r['finished_at'] = r['finished_at'].isoformat() if r['finished_at'] else None
        return rows