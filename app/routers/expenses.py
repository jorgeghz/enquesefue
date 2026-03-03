import csv
import io
import math
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.limiter import limiter
from app.models.expense import Expense as ExpenseModel
from app.models.user import User
from app.schemas.expense import (
    CreateExpenseRequest,
    EditExpenseRequest,
    ExpenseListResponse,
    ExpenseOut,
    ExpenseOutWithDuplicate,
)
from app.services.ai_service import parse_expense_from_text
from app.services.expense_service import (
    delete_expense,
    list_expenses,
    make_duplicate_info,
    save_expense,
    update_expense,
)

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


@router.get("/export")
async def export_expenses(
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    category_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expenses, _ = await list_expenses(
        user_id=current_user.id, db=db, page=1, limit=10000,
        category_id=category_id, date_from=date_from, date_to=date_to,
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["fecha", "descripcion", "monto", "moneda", "categoria", "fuente"])
    for e in expenses:
        writer.writerow([
            e.date.strftime("%Y-%m-%d"),
            e.description,
            f"{float(e.amount):.2f}",
            e.currency,
            e.category.name if e.category else "",
            e.source,
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=gastos.csv"},
    )


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


@router.post("", response_model=ExpenseOutWithDuplicate, status_code=201)
@limiter.limit("1/minute")
async def create_expense(
    request: Request,
    body: CreateExpenseRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        parsed = await parse_expense_from_text(body.text, tz_name=current_user.timezone)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar el gasto: {e}")
    if not parsed:
        raise HTTPException(
            status_code=422,
            detail="No pude identificar un gasto en el texto. Intenta ser más específico con el monto.",
        )
    expense, dup = await save_expense(parsed, current_user, source="text", raw_input=body.text, db=db)
    result = await db.execute(
        select(ExpenseModel).where(ExpenseModel.id == expense.id).options(selectinload(ExpenseModel.category))
    )
    expense = result.scalar_one()
    return ExpenseOutWithDuplicate(
        **ExpenseOut.from_expense(expense).model_dump(),
        possible_duplicate=make_duplicate_info(dup),
    )


@router.patch("/{expense_id}", response_model=ExpenseOut)
async def edit_expense(
    expense_id: int,
    body: EditExpenseRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expense = await update_expense(
        expense_id, current_user.id,
        body.model_dump(exclude_none=True),
        db,
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
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
