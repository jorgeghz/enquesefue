from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    currency: str
    created_at: datetime

    model_config = {"from_attributes": True}
