from datetime import date as Date, datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.expense import ExpenseOut
from app.services.expense_service import get_monthly_summary, get_range_summary, get_weekly_summary

router = APIRouter(prefix="/api/stats", tags=["stats"])


class CategoryStat(BaseModel):
    name: str
    emoji: str
    total: float


class SummaryResponse(BaseModel):
    total: float
    count: int = 0
    by_category: list[CategoryStat]
    recent: list[ExpenseOut]
    start: datetime
    end: datetime


def _build_response(data: dict) -> SummaryResponse:
    return SummaryResponse(
        total=data["total"],
        count=data.get("count", 0),
        by_category=[CategoryStat(**c) for c in data["by_category"]],
        recent=[ExpenseOut.from_expense(e) for e in data["recent"]],
        start=data["start"],
        end=data["end"],
    )


@router.get("/monthly", response_model=SummaryResponse)
async def monthly_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return _build_response(await get_monthly_summary(current_user.id, db))


@router.get("/weekly", response_model=SummaryResponse)
async def weekly_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return _build_response(await get_weekly_summary(current_user.id, db))


@router.get("/range", response_model=SummaryResponse)
async def range_stats(
    date_from: Date,
    date_to: Date,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    start = datetime(date_from.year, date_from.month, date_from.day, 0, 0, 0, tzinfo=timezone.utc)
    end = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc)
    return _build_response(await get_range_summary(current_user.id, start, end, db))
