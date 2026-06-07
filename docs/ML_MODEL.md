# SmartQueue — ML Model Documentation

## Table of Contents
1. [Overview](#overview)
2. [Why LSTM](#why-lstm)
3. [Architecture](#architecture)
4. [Mathematics](#mathematics)
5. [Implementation](#implementation)
6. [Training Pipeline](#training-pipeline)
7. [Inference](#inference)
8. [Input Encoding](#input-encoding)
9. [Output and Priority Derivation](#output-and-priority-derivation)
10. [Training Results](#training-results)
11. [Limitations and Future Work](#limitations-and-future-work)

---

## Overview

SmartQueue uses a Long Short-Term Memory (LSTM) neural network to predict the expected runtime of an incoming job based on the sequence of recently completed job types. The predicted runtime is then converted into a priority score that determines the job's position in the queue.

**The model is implemented entirely from scratch in NumPy** — no PyTorch, no TensorFlow, no Keras. Every operation — the forward pass, gate computations, backpropagation through time (BPTT), and gradient clipping — is written explicitly in matrix algebra.

### At a Glance

| Property | Value |
|---|---|
| Model type | LSTM (Long Short-Term Memory) |
| Input | Sequence of 3 job types (one-hot encoded) |
| Output | Predicted runtime in milliseconds |
| Input size | 4 (one-hot vector for 4 job types) |
| Hidden size | 32 |
| Output size | 1 |
| Training | Backpropagation Through Time (BPTT) |
| Optimiser | Vanilla SGD with gradient clipping |
| Learning rate | 0.001 |
| Epochs | 50 |
| Implementation | NumPy only |

---

## Why LSTM

### Why not a simple feedforward network?
Job scheduling is a **sequential problem**. The runtime of the next job is influenced by what has been running recently — for example, if several long ML jobs have just completed, the system is likely being used for heavy compute workloads, and the next job is also likely to be expensive. A feedforward network treats each prediction independently. An LSTM retains memory of the sequence.

### Why not a Transformer?
Transformers are more powerful but require far more data and training time. With tens to hundreds of job records, an LSTM is the right tool — small, interpretable, and trainable in seconds on a CPU.

### Why from scratch?
Using PyTorch reduces the ML component to:
```python
model = nn.LSTM(input_size=4, hidden_size=32)
```
That is a configuration, not an implementation. Writing the LSTM in NumPy — including the gate equations, cell state updates, and backpropagation — demonstrates genuine understanding of how neural networks work at the mathematical level. This is what separates the project from a tutorial.

---

## Architecture

```
Input sequence (length 3)
┌──────────┐  ┌──────────┐  ┌──────────┐
│  t = 0   │  │  t = 1   │  │  t = 2   │
│ [0,0,1,0]│  │ [1,0,0,0]│  │ [0,1,0,0]│
│  (http)  │  │  (etl)   │  │   (ml)   │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │              │              │
     ▼              ▼              ▼
┌─────────────────────────────────────┐
│           LSTM Cell                 │
│                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐         │
│  │Forget│ │Input │ │Output│         │
│  │ Gate │ │ Gate │ │ Gate │         │
│  └──┬───┘ └──┬───┘ └──┬───┘         │
│     │        │        │       1     │
│     └────────┼────────┘             │
│              │                      │
│         Cell State                  │
│         (memory)                    │
└──────────────┬──────────────────────┘
               │ h (hidden state at t=2)
               ▼
        ┌─────────────┐
        │ Output Layer│  (Wy @ h + by)
        │  (32 → 1)   │
        └──────┬──────┘
               │
               ▼
        predicted_runtime_ms
```

---

## Mathematics

### LSTM Gate Equations

At each timestep `t`, the LSTM cell receives:
- `x_t` — current input (shape: 4×1)
- `h_{t-1}` — previous hidden state (shape: 32×1)
- `c_{t-1}` — previous cell state (shape: 32×1)

The combined input is formed by stacking:
```
z = [x_t ; h_{t-1}]    (shape: 36×1)
```

**Forget Gate** — how much of the previous cell state to keep:
```
f_t = σ(W_f · z + b_f)
```

**Input Gate** — how much new information to add:
```
i_t = σ(W_i · z + b_i)
```

**Output Gate** — what to expose from the cell state:
```
o_t = σ(W_o · z + b_o)
```

**Candidate Cell State** — new information to potentially add:
```
c̃_t = tanh(W_c · z + b_c)
```

**Cell State Update:**
```
c_t = f_t ⊙ c_{t-1} + i_t ⊙ c̃_t
```

**Hidden State:**
```
h_t = o_t ⊙ tanh(c_t)
```

Where:
- `σ` = sigmoid function = `1 / (1 + e^{-x})`
- `⊙` = element-wise multiplication (Hadamard product)
- `W_f, W_i, W_o, W_c` ∈ ℝ^{32×36} — weight matrices
- `b_f, b_i, b_o, b_c` ∈ ℝ^{32×1} — bias vectors

### Output Layer

After the final timestep (t=2):
```
y_pred = W_y · h_2 + b_y
```

Where `W_y` ∈ ℝ^{1×32} and `b_y` ∈ ℝ^{1×1}.

### Loss Function

Mean Squared Error (MSE) on a single sample:
```
L = (y_pred - y_true)²
```

---

## Implementation

### LSTMCell (forward pass)

```python
def forward(self, x, h_prev, c_prev):
    combined = np.vstack([x, h_prev])          # stack input + hidden state

    f = self.sigmoid(self.Wf @ combined + self.bf)   # forget gate
    i = self.sigmoid(self.Wi @ combined + self.bi)   # input gate
    o = self.sigmoid(self.Wo @ combined + self.bo)   # output gate
    c_hat = np.tanh(self.Wc @ combined + self.bc)    # candidate cell state

    c = f * c_prev + i * c_hat                 # cell state update
    h = o * np.tanh(c)                         # hidden state

    cache = (x, h_prev, c_prev, f, i, o, c_hat, c, h, combined)
    return h, c, cache
```

### Backpropagation Through Time (BPTT)

The backward pass computes gradients starting from the output and flowing back through each timestep:

```python
def backward(self, dh, dc, cache):
    x, h_prev, c_prev, f, i, o, c_hat, c, h, combined = cache

    # Output gate gradient
    do = dh * np.tanh(c)

    # Cell state gradient (from both dh and incoming dc)
    dc_total = dh * o * (1 - np.tanh(c)**2) + dc

    # Gate gradients
    df = dc_total * c_prev
    di = dc_total * c_hat
    dc_hat = dc_total * i
    dc_prev = dc_total * f

    # Pre-activation gradients (chain rule through sigmoid/tanh)
    do_raw   = do    * o     * (1 - o)           # sigmoid derivative
    df_raw   = df    * f     * (1 - f)
    di_raw   = di    * i     * (1 - i)
    dc_raw   = dc_hat * (1 - c_hat**2)           # tanh derivative

    # Weight gradients
    dWo = do_raw @ combined.T
    dWf = df_raw @ combined.T
    dWi = di_raw @ combined.T
    dWc = dc_raw @ combined.T

    # Gradient flowing back to previous hidden state
    dcombined = (Wo.T @ do_raw + Wf.T @ df_raw +
                 Wi.T @ di_raw + Wc.T @ dc_raw)
    dh_prev = dcombined[input_size:]

    return dh_prev, dc_prev, grads
```

### Gradient Clipping

Gradient clipping prevents the **exploding gradient problem** — a common failure mode in RNNs where gradients grow exponentially during backprop through long sequences:

```python
for k in total_grads:
    total_grads[k] = np.clip(total_grads[k], -1, 1)
```

All gradients are clipped to the range `[-1, 1]` before the weight update. This keeps training stable without requiring a learning rate scheduler.

### Weight Update (SGD)

```python
for k in total_grads:
    setattr(self.lstm, k,
            getattr(self.lstm, k) - self.lr * total_grads[k])
self.Wy -= self.lr * np.clip(dWy, -1, 1)
self.by -= self.lr * np.clip(dby, -1, 1)
```

---

## Training Pipeline

### Step 1 — Data Collection
The worker logs every completed job to `execution_logs`:
```sql
INSERT INTO execution_logs (job_id, runtime_ms, worker_id)
VALUES ($1, $2, $3)
```

### Step 2 — Sequence Construction
`train.py` queries execution logs and builds input/output pairs:

```
Completed jobs (in order):
  etl  → 2100ms
  http → 800ms
  ml   → 7800ms
  etl  → 1950ms
  shell→ 1600ms

Sequences of length 3:
  X[0] = [etl, http, ml]   → y[0] = 1950ms  (next job runtime)
  X[1] = [http, ml, etl]   → y[1] = 1600ms
```

### Step 3 — One-Hot Encoding
```python
TYPE_MAP = {'etl': 0, 'ml': 1, 'http': 2, 'shell': 3}

# 'etl'  → [1, 0, 0, 0]
# 'ml'   → [0, 1, 0, 0]
# 'http' → [0, 0, 1, 0]
# 'shell'→ [0, 0, 0, 1]
```

### Step 4 — Normalisation
Runtime targets are normalised before training to keep values in a numerically stable range:
```python
y_normalised = runtime_ms / 10000.0
```
A 2000ms job becomes `0.2`, an 8000ms job becomes `0.8`.

### Step 5 — Training Loop
```python
for epoch in range(50):
    indices = np.random.permutation(len(X_seq))   # shuffle
    for idx in indices:
        y_pred, h, c, caches = model.forward(X_seq[idx])
        loss = model.backward(X_seq[idx], y_seq[idx], y_pred, h, caches)
```

Shuffling prevents the model from memorising the order of training samples.

### Step 6 — Save Weights
```python
np.savez("model.npz",
    Wf=lstm.Wf, bf=lstm.bf,
    Wi=lstm.Wi, bi=lstm.bi,
    Wo=lstm.Wo, bo=lstm.bo,
    Wc=lstm.Wc, bc=lstm.bc,
    Wy=Wy, by=by)
```

### Generating Synthetic Training Data
Before real execution data accumulates, `generate_data.py` creates 100 synthetic jobs with realistic runtime distributions:

| Job Type | Mean Runtime | Std Dev |
|---|---|---|
| `etl` | 2000ms | 400ms |
| `ml` | 8000ms | 1600ms |
| `http` | 800ms | 160ms |
| `shell` | 1500ms | 300ms |

---

## Inference

When a new job is submitted, the API calls the predictor:

```python
# 1. Get last 3 completed job types from DB
recent = ['etl', 'http', 'ml']   # most recent last

# 2. Build input sequence
history = recent[-3:]             # pad if < 3 available
seq = [[1,0,0,0], [0,0,1,0], [0,1,0,0]]   # one-hot encoded

# 3. Run LSTM forward pass
X = np.array(seq)                 # shape: (3, 4)
raw = model.predict(X)            # normalised output

# 4. Denormalise
runtime_ms = max(500, raw * 10000)

# 5. Compute priority
priority = 1.0 / (1.0 + runtime_ms / 5000.0)
```

Inference is synchronous and completes in under 5ms on any CPU — well within the 2-second timeout.

---

## Input Encoding

### One-Hot Encoding

Job types are encoded as 4-dimensional binary vectors:

```
etl   → [1, 0, 0, 0]
ml    → [0, 1, 0, 0]
http  → [0, 0, 1, 0]
shell → [0, 0, 0, 1]
```

This encoding is chosen over integer encoding (etl=0, ml=1...) because integer encoding implies an ordinal relationship (ml > etl numerically) which has no semantic meaning. One-hot treats all types as categorically distinct.

### Sequence Padding

If fewer than 3 jobs have been completed, the sequence is left-padded with the current job type:

```python
while len(history) < 3:
    history = [req.job_type] + history
```

---

## Output and Priority Derivation

### Raw Output
The LSTM outputs a single normalised float in approximately [0, 1]:
```
y_raw ∈ [0.0, 1.0]   (after training converges)
```

### Denormalisation
```
predicted_runtime_ms = max(500, y_raw × 10000)
```
The `max(500, ...)` floor prevents pathological low predictions from giving a job artificially high priority.

### Priority Formula
```
priority = 1.0 / (1.0 + predicted_runtime_ms / 5000.0)
```

This is a monotonically decreasing function of runtime:

```
runtime →  priority
  500ms →  0.909
 1000ms →  0.833
 2000ms →  0.714
 5000ms →  0.500    ← pivot point
10000ms →  0.333
30000ms →  0.143
```

The constant `5000` (5 seconds) is the **pivot** — jobs expected to run in under 5 seconds get `priority > 0.5` and rise in the queue. Jobs expected to run longer get `priority < 0.5` and yield to faster jobs.

---

## Training Results

Typical training run on 100 synthetic samples, 50 epochs:

```
Epoch 10/50 — loss: 0.0143
Epoch 20/50 — loss: 0.0049
Epoch 30/50 — loss: 0.0016
Epoch 40/50 — loss: 0.0006
Epoch 50/50 — loss: 0.0002
```

Loss decreases by ~98.6% over 50 epochs, indicating the model successfully learns the runtime distribution of each job type from the synthetic data.

### What the Model Learns

After training, the model learns that:
- `http` jobs are fast → high priority
- `shell` and `etl` jobs are medium → medium priority
- `ml` jobs are slow → lower priority

And crucially — it learns **context**. A sequence of `[ml, ml, ml]` predicts a different runtime than `[http, http, ml]`, because the model encodes the history of what has been running.

---

## Limitations and Future Work

### Current Limitations

| Limitation | Impact |
|---|---|
| Synthetic training data | Predictions may not match real workload patterns initially |
| No payload features | Model ignores job size (e.g. 1000 rows vs 1M rows) |
| Fixed sequence length (3) | Cannot use longer execution history |
| SGD optimiser | Adam would converge faster and more reliably |
| No validation set | Cannot detect overfitting during training |

### Planned Improvements

1. **Payload feature extraction** — include numeric fields from the job payload (row count, file size) as additional input features
2. **Adam optimiser** — replace SGD with Adam for faster, more stable convergence
3. **Online learning** — update model weights incrementally after each job completes, without full retraining
4. **Prediction confidence** — output a confidence interval alongside the point estimate
5. **Multi-output** — predict both runtime and failure probability simultaneously

---

## Files

| File | Description |
|---|---|
| `services/predictor/predictor.py` | LSTM implementation (LSTMCell, LSTMPredictor classes) |
| `services/predictor/train.py` | Training script — loads data, trains, saves weights |
| `services/predictor/generate_data.py` | Synthetic data generator for bootstrapping |
| `services/predictor/app.py` | FastAPI inference endpoint |
| `services/predictor/model.npz` | Saved model weights (NumPy compressed format) |

---

*This document is part of the SmartQueue final year project documentation.*  
*Author: Akshat Chauhan | KIIT | B.Tech CSE*