from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, field_validator
from app.database import get_db
from app.auth import create_token, verify_token, hash_password, verify_password
from slowapi import Limiter
from slowapi.util import get_remote_address
import psycopg2.extras

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()
limiter = Limiter(key_func=get_remote_address)

class RegisterRequest(BaseModel):
    username: str
    password: str

    @field_validator('username')
    @classmethod
    def username_valid(cls, v):
        v = v.strip()
        if len(v) < 3 or len(v) > 32:
            raise ValueError('Username must be 3-32 characters')
        if not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError('Username can only contain letters, numbers, hyphens, underscores')
        return v

    @field_validator('password')
    @classmethod
    def password_valid(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        if len(v) > 128:
            raise ValueError('Password too long')
        return v

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/register")
@limiter.limit("5/minute")
def register(request: Request, req: RegisterRequest):
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
@limiter.limit("10/minute")
def login(request: Request, req: LoginRequest):
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