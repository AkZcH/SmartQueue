import asyncio
import logging
from app.database import get_db
import psycopg2.extras

logger = logging.getLogger(__name__)

def _fetch_metrics():
    """Synchronous DB reads — runs inside asyncio.to_thread."""
    results = {}
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute("SELECT COUNT(*) AS cnt FROM jobs WHERE status = 'queued'")
        results["queue_depth"] = cur.fetchone()["cnt"]

        cur.execute("""
            SELECT COUNT(*) AS cnt FROM worker_registry
            WHERE last_seen > NOW() - INTERVAL '15 seconds'
        """)
        results["worker_count"] = cur.fetchone()["cnt"]

        cur.execute("""
            SELECT predicted_runtime_ms, actual_runtime_ms
            FROM jobs
            WHERE status = 'completed'
              AND predicted_runtime_ms IS NOT NULL
              AND actual_runtime_ms IS NOT NULL
              AND actual_runtime_ms > 0
            ORDER BY updated_at DESC
            LIMIT 100
        """)
        rows = cur.fetchall()
        if rows:
            mape = sum(
                abs(r["predicted_runtime_ms"] - r["actual_runtime_ms"])
                / r["actual_runtime_ms"]
                for r in rows
            ) / len(rows) * 100
            results["mape"] = round(mape, 2)
        else:
            results["mape"] = None

    return results

async def collect_custom_metrics(queue_depth_gauge, worker_count_gauge, prediction_mape_gauge):
    while True:
        try:
            results = await asyncio.to_thread(_fetch_metrics)
            queue_depth_gauge.set(results["queue_depth"])
            worker_count_gauge.set(results["worker_count"])
            if results["mape"] is not None:
                prediction_mape_gauge.set(results["mape"])
        except Exception as e:
            logger.error(f"Metrics collection error: {e}")
        await asyncio.sleep(10)