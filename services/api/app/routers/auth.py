from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from app.database import get_db
from app.auth import create_token, verify_token, hash_password, verify_password
import psycopg2.extras

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()

class RegisterRequest(BaseModel):
    username: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/register")
def register(req: RegisterRequest):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id FROM users WHERE username = %s", (req.username,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Username already exists")
        cur.execute(
            "INSERT INTO users (username, password_hash) VALUES (%s, %s) RETURNING id, username, role",
            (req.username, hash_password(req.password))
        )
        user = dict(cur.fetchone())
        conn.commit()
        token = create_token(str(user['id']), user['username'], user['role'])
        return {"token": token, "user": user}

@router.post("/login")
def login(req: LoginRequest):
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM users WHERE username = %s", (req.username,))
        user = cur.fetchone()
        if not user or not verify_password(req.password, user['password_hash']):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = create_token(str(user['id']), user['username'], user['role'])
        return {
            "token": token,
            "user": {"id": str(user['id']), "username": user['username'], "role": user['role']}
        }

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        return verify_token(credentials.credentials)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

def require_admin(user=Depends(get_current_user)):
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin only")
    return user