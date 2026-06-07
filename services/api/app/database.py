import psycopg2
import os
import psycopg2.extras
from contextlib import contextmanager

DB = os.getenv("DB_URL", "host=127.0.0.1 port=5433 dbname=smartqueue user=sq password=anything")
PREDICTOR_URL = os.getenv("PREDICTOR_URL", "http://localhost:8001")

def get_conn():
    return psycopg2.connect(DB)

@contextmanager
def get_db():
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()