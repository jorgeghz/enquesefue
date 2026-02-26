"""
CRUD y lógica de negocio para gastos.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.category import Category
from app.models.expense import Expense
from app.models.user import User
from app.schemas.expense import ExpenseParsed


async def get_or_create_category(name: str, user_id: int, db: AsyncSession) -> Category:
    result = await db.execute(
        select(Category).where(
            Category.name == name,
            (Category.user_id.is_(None)) | (Category.user_id == user_id),
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        category = Category(name=name, emoji="💰", user_id=user_id)
        db.add(category)
        await db.flush()
    return category


async def save_expense(parsed: ExpenseParsed, user: User, source: str, raw_input: str, db: AsyncSession) -> Expense:
    category = await get_or_create_category(parsed.category_name, user.id, db)

    expense = Expense(
        user_id=user.id,
        amount=parsed.amount,
        currency=parsed.currency or user.currency,
        description=parsed.description,
        category_id=category.id,
        date=parsed.date or datetime.now(timezone.utc),
        source=source,
        raw_input=raw_input,
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return expense


async def list_expenses(
    user_id: int,
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    category_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[list[Expense], int]:
    filters = [Expense.user_id == user_id]
    if category_id:
        filters.append(Expense.category_id == category_id)
    if date_from:
        filters.append(Expense.date >= date_from)
    if date_to:
        filters.append(Expense.date <= date_to)

    count_result = await db.execute(select(func.count()).where(and_(*filters)))
    total = count_result.scalar() or 0

    result = await db.execute(
        select(Expense)
        .where(and_(*filters))
        .order_by(desc(Expense.date))
        .offset((page - 1) * limit)
        .limit(limit)
        .options(selectinload(Expense.category))
    )
    expenses = result.scalars().all()
    return list(expenses), total


async def delete_expense(expense_id: int, user_id: int, db: AsyncSession) -> bool:
    result = await db.execute(
        select(Expense).where(Expense.id == expense_id, Expense.user_id == user_id)
    )
    expense = result.scalar_one_or_none()
    if not expense:
        return False
    await db.delete(expense)
    await db.commit()
    return True


async def get_monthly_summary(user_id: int, db: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return await _summary_for_period(user_id, start, now, db)


async def get_weekly_summary(user_id: int, db: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=7)
    return await _summary_for_period(user_id, start, now, db)


async def _summary_for_period(user_id: int, start: datetime, end: datetime, db: AsyncSession) -> dict:
    total_result = await db.execute(
        select(func.sum(Expense.amount)).where(
            Expense.user_id == user_id, Expense.date >= start, Expense.date <= end,
        )
    )
    total = total_result.scalar() or Decimal("0")

    cat_result = await db.execute(
        select(Category.name, Category.emoji, func.sum(Expense.amount).label("subtotal"))
        .join(Expense, Expense.category_id == Category.id)
        .where(Expense.user_id == user_id, Expense.date >= start, Expense.date <= end)
        .group_by(Category.id, Category.name, Category.emoji)
        .order_by(desc("subtotal"))
    )
    by_category = [
        {"name": row.name, "emoji": row.emoji, "total": float(row.subtotal)}
        for row in cat_result
    ]

    recent_result = await db.execute(
        select(Expense)
        .where(Expense.user_id == user_id, Expense.date >= start)
        .order_by(desc(Expense.date))
        .limit(5)
        .options(selectinload(Expense.category))
    )
    recent = recent_result.scalars().all()

    return {
        "total": float(total),
        "by_category": by_category,
        "recent": recent,
        "start": start,
        "end": end,
    }


async def get_all_categories(user_id: int, db: AsyncSession) -> list[Category]:
    result = await db.execute(
        select(Category)
        .where((Category.user_id.is_(None)) | (Category.user_id == user_id))
        .order_by(Category.name)
    )
    return result.scalars().all()
