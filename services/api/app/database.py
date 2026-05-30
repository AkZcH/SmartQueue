import psycopg2
import psycopg2.extras
from contextlib import contextmanager

DATABASE_URL = "host=127.0.0.1 port=5433 dbname=smartqueue user=sq password=anything"

def get_conn():
    return psycopg2.connect(DATABASE_URL)

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