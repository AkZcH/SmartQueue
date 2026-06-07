Need **5 terminals**:

---

**Terminal 1 — Database**

```bash
cd "C:\Users\KIIT0001\Desktop\Personal Vault\Projects\Final Year Projects\smartqueue\docker"
docker-compose up -d
```

---

**Terminal 2 — API**

```bash
cd "C:\Users\KIIT0001\Desktop\Personal Vault\Projects\Final Year Projects\smartqueue\services\api"
uvicorn app.main:app --reload --port 8000
```

---

**Terminal 3 — ML Predictor**

```bash
cd "C:\Users\KIIT0001\Desktop\Personal Vault\Projects\Final Year Projects\smartqueue\services\predictor"
uvicorn app:app --reload --port 8001
```

---

**Terminal 4 — Scheduler**

```bash
cd "C:\Users\KIIT0001\Desktop\Personal Vault\Projects\Final Year Projects\smartqueue\services\scheduler"
npx ts-node src/index.ts
```

---

**Terminal 5 — Worker**

```bash
cd "C:\Users\KIIT0001\Desktop\Personal Vault\Projects\Final Year Projects\smartqueue\services\worker"
python worker.py
```

---

**Terminal 6 — Frontend**

```bash
cd "C:\Users\KIIT0001\Desktop\Personal Vault\Projects\Final Year Projects\smartqueue\frontend"
npm run dev
```

---

Then open:

- **http://localhost:3000** — dashboard
- **http://localhost:8000/docs** — API explorer
- **http://localhost:8001/docs** — ML predictor

Start them in order — DB first, then API, then everything else.
