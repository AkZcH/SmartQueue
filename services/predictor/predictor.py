import numpy as np

class LSTMCell:
    def __init__(self, input_size, hidden_size):
        self.input_size = input_size
        self.hidden_size = hidden_size
        scale = 0.01
        # Gates: forget, input, output, candidate
        self.Wf = np.random.randn(hidden_size, input_size + hidden_size) * scale
        self.bf = np.zeros((hidden_size, 1))
        self.Wi = np.random.randn(hidden_size, input_size + hidden_size) * scale
        self.bi = np.zeros((hidden_size, 1))
        self.Wo = np.random.randn(hidden_size, input_size + hidden_size) * scale
        self.bo = np.zeros((hidden_size, 1))
        self.Wc = np.random.randn(hidden_size, input_size + hidden_size) * scale
        self.bc = np.zeros((hidden_size, 1))

    def sigmoid(self, x):
        return 1 / (1 + np.exp(-np.clip(x, -10, 10)))

    def forward(self, x, h_prev, c_prev):
        combined = np.vstack([x, h_prev])
        f = self.sigmoid(self.Wf @ combined + self.bf)
        i = self.sigmoid(self.Wi @ combined + self.bi)
        o = self.sigmoid(self.Wo @ combined + self.bo)
        c_hat = np.tanh(self.Wc @ combined + self.bc)
        c = f * c_prev + i * c_hat
        h = o * np.tanh(c)
        cache = (x, h_prev, c_prev, f, i, o, c_hat, c, h, combined)
        return h, c, cache

    def backward(self, dh, dc, cache):
        x, h_prev, c_prev, f, i, o, c_hat, c, h, combined = cache
        do = dh * np.tanh(c)
        dc_total = dh * o * (1 - np.tanh(c)**2) + dc
        df = dc_total * c_prev
        di = dc_total * c_hat
        dc_hat = dc_total * i
        dc_prev = dc_total * f
        do_raw = do * o * (1 - o)
        df_raw = df * f * (1 - f)
        di_raw = di * i * (1 - i)
        dc_hat_raw = dc_hat * (1 - c_hat**2)
        dWo = do_raw @ combined.T
        dbo = do_raw
        dWf = df_raw @ combined.T
        dbf = df_raw
        dWi = di_raw @ combined.T
        dbi = di_raw
        dWc = dc_hat_raw @ combined.T
        dbc = dc_hat_raw
        dcombined = (self.Wo.T @ do_raw + self.Wf.T @ df_raw +
                     self.Wi.T @ di_raw + self.Wc.T @ dc_hat_raw)
        dh_prev = dcombined[self.input_size:]
        grads = dict(Wf=dWf, bf=dbf, Wi=dWi, bi=dbi,
                     Wo=dWo, bo=dbo, Wc=dWc, bc=dbc)
        return dh_prev, dc_prev, grads


class LSTMPredictor:
    def __init__(self, input_size=4, hidden_size=64, output_size=1, lr=0.005):
        self.hidden_size = hidden_size
        self.lr = lr
        self.lstm = LSTMCell(input_size, hidden_size)
        self.Wy = np.random.randn(output_size, hidden_size) * 0.01
        self.by = np.zeros((output_size, 1))
        self.losses = []

    def forward(self, X):
        h = np.zeros((self.hidden_size, 1))
        c = np.zeros((self.hidden_size, 1))
        caches = []
        for t in range(X.shape[0]):
            x = X[t].reshape(-1, 1)
            h, c, cache = self.lstm.forward(x, h, c)
            caches.append(cache)
        y_pred = self.Wy @ h + self.by
        return y_pred, h, c, caches

    def backward(self, X, y_true, y_pred, h, caches):
        loss = float((y_pred - y_true) ** 2)
        dy = 2 * (y_pred - y_true)
        dWy = dy @ h.T
        dby = dy
        dh = self.Wy.T @ dy
        dc = np.zeros_like(dh)
        total_grads = {k: np.zeros_like(v) for k, v in
                       vars(self.lstm).items() if isinstance(v, np.ndarray)}
        for t in reversed(range(len(caches))):
            dh, dc, grads = self.lstm.backward(dh, dc, caches[t])
            for k in grads:
                total_grads[k] += grads[k]
        # Gradient clipping
        for k in total_grads:
            total_grads[k] = np.clip(total_grads[k], -1, 1)
        # Update weights
        for k in total_grads:
            setattr(self.lstm, k, getattr(self.lstm, k) - self.lr * total_grads[k])
        self.Wy -= self.lr * np.clip(dWy, -1, 1)
        self.by -= self.lr * np.clip(dby, -1, 1)
        return loss

    def train(self, X_seq, y_seq, epochs=50):
        print(f"Training LSTM on {len(X_seq)} samples...")
        for epoch in range(epochs):
            total_loss = 0
            indices = np.random.permutation(len(X_seq))
            for idx in indices:
                y_pred, h, c, caches = self.forward(X_seq[idx])
                loss = self.backward(X_seq[idx], y_seq[idx], y_pred, h, caches)
                total_loss += loss
            avg_loss = total_loss / len(X_seq)
            self.losses.append(avg_loss)
            if (epoch + 1) % 10 == 0:
                print(f"  Epoch {epoch+1}/{epochs} — loss: {avg_loss:.4f}")
        return self.losses

    def predict(self, X):
        y_pred, _, _, _ = self.forward(X)
        return float(y_pred)

    def save(self, path="model.npz"):
        np.savez(path,
            Wf=self.lstm.Wf, bf=self.lstm.bf,
            Wi=self.lstm.Wi, bi=self.lstm.bi,
            Wo=self.lstm.Wo, bo=self.lstm.bo,
            Wc=self.lstm.Wc, bc=self.lstm.bc,
            Wy=self.Wy, by=self.by)
        print(f"Model saved to {path}")

    def load(self, path="model.npz"):
        data = np.load(path)
        self.lstm.Wf = data['Wf']; self.lstm.bf = data['bf']
        self.lstm.Wi = data['Wi']; self.lstm.bi = data['bi']
        self.lstm.Wo = data['Wo']; self.lstm.bo = data['bo']
        self.lstm.Wc = data['Wc']; self.lstm.bc = data['bc']
        self.Wy = data['Wy']; self.by = data['by']
        print(f"Model loaded from {path}")