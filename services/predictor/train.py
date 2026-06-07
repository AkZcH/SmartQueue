import psycopg2
import psycopg2.extras
import numpy as np
from predictor import LSTMPredictor

DB = "host=127.0.0.1 port=5433 dbname=smartqueue user=sq password=anything"

TYPE_MAP = {'etl': 0, 'ml': 1, 'http': 2, 'shell': 3}

def load_training_data():
    conn = psycopg2.connect(DB)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT j.type, j.priority,
               EXTRACT(EPOCH FROM (j.finished_at - j.started_at)) as runtime_sec,
               el.runtime_ms
        FROM jobs j
        JOIN execution_logs el ON el.job_id = j.id
        WHERE j.status = 'done' AND j.started_at IS NOT NULL
    """)
    rows = cur.fetchall()
    conn.close()
    print(f"Loaded {len(rows)} training samples")
    return rows

def prepare_sequences(rows, seq_len=3):
    if len(rows) < seq_len + 1:
        print("Not enough data. Need at least", seq_len + 1, "completed jobs.")
        return None, None

    X_seq, y_seq = [], []
    for i in range(len(rows) - seq_len):
        seq = []
        for j in range(seq_len):
            r = rows[i + j]
            type_idx = TYPE_MAP.get(r['type'], 0)
            one_hot = [0.0] * 4
            one_hot[type_idx] = 1.0
            seq.append(one_hot)
        
        target = rows[i + seq_len]
        target_ms = float(target['runtime_ms'] or 2000)
        # Normalise against max expected runtime (15000ms)
        normalised = min(target_ms / 15000.0, 1.0)
        X_seq.append(np.array(seq, dtype=np.float64))
        y_seq.append(np.array([[normalised]], dtype=np.float64))

    print(f"Built {len(X_seq)} sequences from {len(rows)} samples")
    
    # Print what the model should learn
    type_runtimes = {}
    for r in rows:
        t = r['type']
        if t not in type_runtimes:
            type_runtimes[t] = []
        type_runtimes[t].append(float(r['runtime_ms'] or 0))
    
    print("Average runtimes in training data:")
    for t, vals in sorted(type_runtimes.items()):
        print(f"  {t:6s} → {int(sum(vals)/len(vals))}ms")
    
    return X_seq, y_seq

if __name__ == "__main__":
    rows = load_training_data()
    X_seq, y_seq = prepare_sequences(rows)
    if X_seq is None:
        print("Submit and complete more jobs first, then retrain.")
    else:
        model = LSTMPredictor(input_size=4, hidden_size=64, lr=0.005)
        losses = model.train(X_seq, y_seq, epochs=200)
        model.save("model.npz")
        print(f"Final loss: {losses[-1]:.4f}")
        print("Training complete!")