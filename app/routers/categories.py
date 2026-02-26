from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services.expense_service import get_all_categories

router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryOut(BaseModel):
    id: int
    name: str
    emoji: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    categories = await get_all_categories(current_user.id, db)
    return [CategoryOut.model_validate(c) for c in categories]
