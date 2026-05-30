from pydantic import BaseModel
from typing import Any, Optional
from uuid import UUID
from datetime import datetime

class JobCreate(BaseModel):
    name: str
    type: str        # etl | ml | http | shell
    payload: dict[str, Any]

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