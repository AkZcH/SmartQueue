from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import jobs, analytics, auth

app = FastAPI(title="SmartQueue API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs.router)
app.include_router(analytics.router)   
app.include_router(auth.router)

@app.get("/health")
def health():
    return {"status": "ok"}