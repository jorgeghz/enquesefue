import math
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.expense import CreateExpenseRequest, ExpenseListResponse, ExpenseOut
from app.services.ai_service import parse_expense_from_text
from app.services.expense_service import delete_expense, list_expenses, save_expense

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


@router.get("", response_model=ExpenseListResponse)
async def get_expenses(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expenses, total = await list_expenses(
        user_id=current_user.id,
        db=db,
        page=page,
        limit=limit,
        category_id=category_id,
        date_from=date_from,
        date_to=date_to,
    )
    return ExpenseListResponse(
        items=[ExpenseOut.from_expense(e) for e in expenses],
        total=total,
        page=page,
        limit=limit,
        pages=math.ceil(total / limit) if total else 0,
    )


@router.post("", response_model=ExpenseOut, status_code=201)
async def create_expense(
    body: CreateExpenseRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        parsed = await parse_expense_from_text(body.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al llamar a OpenAI: {type(e).__name__}: {e}")
    if not parsed:
        raise HTTPException(
            status_code=422,
            detail="No pude identificar un gasto en el texto. Intenta ser más específico con el monto.",
        )
    expense = await save_expense(parsed, current_user, source="text", raw_input=body.text, db=db)
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    from app.models.expense import Expense as ExpenseModel
    result = await db.execute(
        select(ExpenseModel).where(ExpenseModel.id == expense.id).options(selectinload(ExpenseModel.category))
    )
    expense = result.scalar_one()
    return ExpenseOut.from_expense(expense)


@router.delete("/{expense_id}", status_code=204)
async def remove_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_expense(expense_id, current_user.id, db)
    if not deleted:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
