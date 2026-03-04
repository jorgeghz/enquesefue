"""
Endpoints CRUD para gastos recurrentes.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.recurring_expense import RecurringExpense
from app.models.user import User
from app.schemas.recurring_expense import (
    RecurringExpenseCreate,
    RecurringExpenseOut,
    RecurringExpenseUpdate,
)

router = APIRouter(prefix="/api/recurring", tags=["recurring"])


async def _get_rec_or_404(rec_id: int, user_id: int, db: AsyncSession) -> RecurringExpense:
    result = await db.execute(
        select(RecurringExpense)
        .where(RecurringExpense.id == rec_id, RecurringExpense.user_id == user_id)
        .options(selectinload(RecurringExpense.category))
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Gasto recurrente no encontrado")
    return rec


@router.get("", response_model=list[RecurringExpenseOut])
async def list_recurring(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RecurringExpense)
        .where(RecurringExpense.user_id == current_user.id)
        .options(selectinload(RecurringExpense.category))
        .order_by(RecurringExpense.day_of_month, RecurringExpense.description)
    )
    return [RecurringExpenseOut.from_model(r) for r in result.scalars().all()]


@router.post("", response_model=RecurringExpenseOut, status_code=201)
async def create_recurring(
    body: RecurringExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rec = RecurringExpense(
        user_id=current_user.id,
        description=body.description,
        amount=body.amount,
        currency=body.currency,
        category_id=body.category_id,
        merchant=body.merchant,
        day_of_month=body.day_of_month,
        active=True,
    )
    db.add(rec)
    await db.commit()
    result = await db.execute(
        select(RecurringExpense)
        .where(RecurringExpense.id == rec.id)
        .options(selectinload(RecurringExpense.category))
    )
    return RecurringExpenseOut.from_model(result.scalar_one())


@router.patch("/{rec_id}", response_model=RecurringExpenseOut)
async def update_recurring(
    rec_id: int,
    body: RecurringExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rec = await _get_rec_or_404(rec_id, current_user.id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(rec, field, value)
    await db.commit()
    result = await db.execute(
        select(RecurringExpense)
        .where(RecurringExpense.id == rec_id)
        .options(selectinload(RecurringExpense.category))
    )
    return RecurringExpenseOut.from_model(result.scalar_one())


@router.delete("/{rec_id}", status_code=204)
async def delete_recurring(
    rec_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rec = await _get_rec_or_404(rec_id, current_user.id, db)
    await db.delete(rec)
    await db.commit()
