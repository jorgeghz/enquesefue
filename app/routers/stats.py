from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.expense import ExpenseOut
from app.services.expense_service import get_monthly_summary, get_weekly_summary

router = APIRouter(prefix="/api/stats", tags=["stats"])


class CategoryStat(BaseModel):
    name: str
    emoji: str
    total: float


class SummaryResponse(BaseModel):
    total: float
    by_category: list[CategoryStat]
    recent: list[ExpenseOut]
    start: datetime
    end: datetime


@router.get("/monthly", response_model=SummaryResponse)
async def monthly_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await get_monthly_summary(current_user.id, db)
    return SummaryResponse(
        total=data["total"],
        by_category=[CategoryStat(**c) for c in data["by_category"]],
        recent=[ExpenseOut.from_expense(e) for e in data["recent"]],
        start=data["start"],
        end=data["end"],
    )


@router.get("/weekly", response_model=SummaryResponse)
async def weekly_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await get_weekly_summary(current_user.id, db)
    return SummaryResponse(
        total=data["total"],
        by_category=[CategoryStat(**c) for c in data["by_category"]],
        recent=[ExpenseOut.from_expense(e) for e in data["recent"]],
        start=data["start"],
        end=data["end"],
    )
