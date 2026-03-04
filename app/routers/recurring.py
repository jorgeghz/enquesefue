"""
Endpoints CRUD para gastos recurrentes.
"""
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, extract, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.expense import Expense
from app.models.recurring_expense import RecurringExpense
from app.models.user import User
from app.schemas.recurring_expense import (
    RecurringExpenseCreate,
    RecurringExpenseOut,
    RecurringExpenseUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/recurring", tags=["recurring"])
_MEXICO = ZoneInfo("America/Mexico_City")


async def _create_expense_from_template(rec: RecurringExpense, db: AsyncSession) -> None:
    """Crea el Expense del mes actual a partir de un template recurrente, si no existe ya."""
    now = datetime.now(_MEXICO)
    # Solo crear si el día programado ya llegó este mes
    if now.day < rec.day_of_month:
        return

    # Verificar que no existe ya un gasto de este template este mes
    dup_template = await db.execute(
        select(Expense).where(
            Expense.user_id == rec.user_id,
            Expense.recurring_expense_id == rec.id,
            extract("year", Expense.date) == now.year,
            extract("month", Expense.date) == now.month,
        ).limit(1)
    )
    if dup_template.scalar_one_or_none():
        return  # Ya existe

    # Verificar que no existe un gasto con el mismo monto+descripción/merchant este mes
    content_filters = [Expense.description.ilike(rec.description)]
    if rec.merchant:
        content_filters.append(Expense.merchant.ilike(rec.merchant))
    dup_content = await db.execute(
        select(Expense).where(
            and_(
                Expense.user_id == rec.user_id,
                Expense.amount == rec.amount,
                Expense.currency == rec.currency,
                extract("year", Expense.date) == now.year,
                extract("month", Expense.date) == now.month,
                or_(*content_filters),
            )
        ).limit(1)
    )
    if dup_content.scalar_one_or_none():
        return  # Ya existe uno similar registrado manualmente

    expense = Expense(
        user_id=rec.user_id,
        amount=rec.amount,
        currency=rec.currency,
        description=rec.description,
        merchant=rec.merchant,
        category_id=rec.category_id,
        date=now.astimezone(timezone.utc),
        source="recurring",
        raw_input=f"Gasto recurrente automático: {rec.description}",
        recurring_expense_id=rec.id,
    )
    db.add(expense)
    await db.commit()
    logger.info("Gasto recurrente creado al guardar template: '%s' (user %d)", rec.description, rec.user_id)


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
    rec = result.scalar_one()
    # Crear el gasto del mes actual inmediatamente si el día ya llegó
    await _create_expense_from_template(rec, db)
    return RecurringExpenseOut.from_model(rec)


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
