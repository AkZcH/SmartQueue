from pydantic import BaseModel, field_validator
from typing import Any, Optional
from uuid import UUID
from datetime import datetime
from enum import Enum

class JobType(str, Enum):
    etl = "etl"
    ml = "ml"
    http = "http"
    shell = "shell"

class JobCreate(BaseModel):
    name: str
    type: JobType
    payload: dict[str, Any]

    @field_validator('name')
    @classmethod
    def name_valid(cls, v):
        v = v.strip()
        if len(v) < 1 or len(v) > 64:
            raise ValueError('Job name must be 1-64 characters')
        return v

    @field_validator('payload')
    @classmethod
    def payload_valid(cls, v):
        if len(str(v)) > 10000:
            raise ValueError('Payload too large')
        return v

class JobResponse(BaseModel):
    id: UUID
    name: str
    type: str
    payload: dict[str, Any]
    status: str
    priority: float
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    retry_count: int
    error_msg: Optional[str]
    user_id: Optional[UUID] = None