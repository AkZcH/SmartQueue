import hmac
import hashlib
import base64
import json
import time
import os

SECRET_KEY = os.getenv("JWT_SECRET", "supersecretkey-changeinprod")

def b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def b64decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + '=' * padding)

def create_token(user_id: str, username: str, role: str, expires_in: int = 3600) -> str:
    header = b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64encode(json.dumps({
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": int(time.time()) + expires_in
    }).encode())
    signature = b64encode(
        hmac.new(
            SECRET_KEY.encode(),
            f"{header}.{payload}".encode(),
            hashlib.sha256
        ).digest()
    )
    return f"{header}.{payload}.{signature}"

def verify_token(token: str) -> dict:
    try:
        header, payload, signature = token.split(".")
        expected = b64encode(
            hmac.new(
                SECRET_KEY.encode(),
                f"{header}.{payload}".encode(),
                hashlib.sha256
            ).digest()
        )
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid signature")
        data = json.loads(b64decode(payload))
        if data["exp"] < int(time.time()):
            raise ValueError("Token expired")
        return data
    except Exception as e:
        raise ValueError(f"Invalid token: {e}")

def hash_password(password: str) -> str:
    return hmac.new(
        SECRET_KEY.encode(),
        password.encode(),
        hashlib.sha256
    ).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hmac.compare_digest(hash_password(password), hashed)