from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import os
from predictor import LSTMPredictor

app = FastAPI(title="SmartQueue ML Predictor")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

TYPE_MAP = {'etl': 0, 'ml': 1, 'http': 2, 'shell': 3}

# Base runtimes learned from training data (ms)
# These anchor the predictions to reality
BASE_RUNTIMES = {
    'http':  400,
    'shell': 1500,
    'etl':   3000,
    'ml':    12000,
}

model = LSTMPredictor(input_size=4, hidden_size=64)

if os.path.exists("model.npz"):
    model.load("model.npz")
    print("Loaded trained model")
else:
    print("No model found - using base runtimes only")

class PredictRequest(BaseModel):
    job_type: str
    history: list[str] = []

@app.post("/predict")
def predict(req: PredictRequest):
    history = (req.history + [req.job_type])[-3:]
    while len(history) < 3:
        history = [req.job_type] + history

    seq = []
    for t in history:
        seq.append([1.0 if TYPE_MAP.get(t, 0) == k else 0.0 for k in range(4)])
    X = np.array(seq, dtype=np.float64)

    # LSTM context adjustment (-30% to +30% of base)
    raw = model.predict(X)
    context_factor = 0.7 + (raw * 0.6)  # maps [0,1] → [0.7, 1.3]

    # Base runtime for this job type + context adjustment
    base_ms = BASE_RUNTIMES.get(req.job_type, 2000)
    runtime_ms = max(100, int(base_ms * context_factor))

    # Priority: shorter = higher priority
    priority = round(1.0 / (1.0 + runtime_ms / 3000.0), 3)

    return {
        "predicted_runtime_ms": runtime_ms,
        "predicted_priority": priority,
        "job_type": req.job_type
    }

@app.get("/health")
def health():
    return {"status": "ok", "model_trained": os.path.exists("model.npz")}