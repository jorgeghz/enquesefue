"""Endpoint para registrar tokens de push notifications de Expo."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/push", tags=["push"])


class PushTokenRequest(BaseModel):
    token: str


@router.post("/register", status_code=204)
async def register_push_token(
    body: PushTokenRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Guarda el Expo Push Token del dispositivo del usuario."""
    current_user.push_token = body.token
    await db.commit()
