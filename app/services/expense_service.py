"""
CRUD y lógica de negocio para gastos.
"""
import hashlib
from datetime import date as PyDate, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import Date as SQLDate, and_, cast, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.category import Category
from app.models.category_rule import UserCategoryRule
from app.models.expense import Expense
from app.models.user import User
from app.schemas.expense import DuplicateInfo, ExpenseParsed
from app.utils.tz import now_local


def compute_file_hash(file_bytes: bytes) -> str:
    """SHA-256 hex digest de los bytes de un archivo."""
    return hashlib.sha256(file_bytes).hexdigest()


def make_duplicate_info(dup: Expense | None) -> DuplicateInfo | None:
    """Convierte un Expense en DuplicateInfo para la respuesta API."""
    if not dup:
        return None
    return DuplicateInfo(
        id=dup.id,
        amount=float(dup.amount),
        currency=dup.currency,
        description=dup.description,
        date=dup.date,
        source=dup.source,
    )


async def find_duplicate_by_hash(file_hash: str, user_id: int, db: AsyncSession) -> Expense | None:
    """Busca un gasto existente con el mismo hash de archivo (mismo archivo re-subido)."""
    result = await db.execute(
        select(Expense)
        .where(Expense.user_id == user_id, Expense.file_hash == file_hash)
        .options(selectinload(Expense.category))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def find_duplicate_by_fingerprint(
    parsed: ExpenseParsed, user_id: int, db: AsyncSession
) -> Expense | None:
    """Busca un gasto existente con mismo monto+moneda en ventana de ±1 día (detección cross-source)."""
    expense_date = parsed.date or datetime.now(timezone.utc)
    date_min = expense_date - timedelta(days=1)
    date_max = expense_date + timedelta(days=1)
    result = await db.execute(
        select(Expense)
        .where(
            Expense.user_id == user_id,
            Expense.amount == parsed.amount,
            Expense.currency == parsed.currency,
            Expense.date >= date_min,
            Expense.date <= date_max,
        )
        .options(selectinload(Expense.category))
        .order_by(desc(Expense.date))
        .limit(1)
    )
    return result.scalar_one_or_none()


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


async def _apply_user_rule(merchant: str | None, user_id: int, db: AsyncSession) -> Category | None:
    """Devuelve la categoría aprendida para este merchant, o None si no hay regla."""
    if not merchant:
        return None
    keyword = merchant.lower().strip()[:100]
    rule_result = await db.execute(
        select(UserCategoryRule).where(
            UserCategoryRule.user_id == user_id,
            UserCategoryRule.keyword == keyword,
        )
    )
    rule = rule_result.scalar_one_or_none()
    if not rule:
        return None
    cat_result = await db.execute(select(Category).where(Category.id == rule.category_id))
    return cat_result.scalar_one_or_none()


async def _upsert_category_rule(user_id: int, merchant: str, category_id: int, db: AsyncSession) -> None:
    """Guarda o actualiza la regla merchant → categoría para este usuario."""
    keyword = merchant.lower().strip()[:100]
    result = await db.execute(
        select(UserCategoryRule).where(
            UserCategoryRule.user_id == user_id,
            UserCategoryRule.keyword == keyword,
        )
    )
    rule = result.scalar_one_or_none()
    if rule:
        rule.category_id = category_id
    else:
        db.add(UserCategoryRule(user_id=user_id, keyword=keyword, category_id=category_id))


async def save_expense(
    parsed: ExpenseParsed,
    user: User,
    source: str,
    raw_input: str,
    db: AsyncSession,
    file_hash: str | None = None,
    file_bytes: bytes | None = None,
    file_content_type: str | None = None,
    file_filename: str | None = None,
) -> tuple[Expense, Expense | None]:
    """Guarda el gasto y devuelve (gasto_nuevo, posible_duplicado_o_None)."""
    # Buscar duplicado: hash primero (lookup exacto), luego huella semántica
    duplicate: Expense | None = None
    if file_hash:
        duplicate = await find_duplicate_by_hash(file_hash, user.id, db)
    if not duplicate:
        duplicate = await find_duplicate_by_fingerprint(parsed, user.id, db)

    # Aplicar regla aprendida: si el merchant tiene una categoría guardada, usarla en lugar de la de GPT
    category = await _apply_user_rule(parsed.merchant, user.id, db)
    if category is None:
        category = await get_or_create_category(parsed.category_name, user.id, db)

    expense = Expense(
        user_id=user.id,
        amount=parsed.amount,
        currency=parsed.currency or user.currency,
        description=parsed.description,
        merchant=parsed.merchant,
        address=parsed.address,
        category_id=category.id,
        date=parsed.date or datetime.now(timezone.utc),
        source=source,
        raw_input=raw_input,
        file_hash=file_hash,
        has_file=file_bytes is not None,
    )
    db.add(expense)
    await db.flush()  # obtener expense.id antes de crear ExpenseFile

    if file_bytes:
        from app.models.expense_file import ExpenseFile
        db.add(ExpenseFile(
            expense_id=expense.id,
            content_type=file_content_type or "application/octet-stream",
            filename=file_filename or "archivo",
            data=file_bytes,
        ))

    await db.commit()
    await db.refresh(expense)
    return expense, duplicate


async def list_expenses(
    user_id: int,
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    category_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = None,
) -> tuple[list[Expense], int]:
    filters = [Expense.user_id == user_id]
    if category_id:
        filters.append(Expense.category_id == category_id)
    if date_from:
        filters.append(Expense.date >= date_from)
    if date_to:
        filters.append(Expense.date <= date_to)
    if search:
        like = f"%{search}%"
        filters.append(or_(
            Expense.description.ilike(like),
            Expense.merchant.ilike(like),
        ))

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


async def update_expense(
    expense_id: int,
    user_id: int,
    data: dict,
    db: AsyncSession,
) -> Expense | None:
    result = await db.execute(
        select(Expense).where(Expense.id == expense_id, Expense.user_id == user_id)
    )
    expense = result.scalar_one_or_none()
    if not expense:
        return None
    if "description" in data and data["description"] is not None:
        expense.description = data["description"]
    if "amount" in data and data["amount"] is not None:
        expense.amount = Decimal(str(data["amount"]))
    if "currency" in data and data["currency"] is not None:
        expense.currency = data["currency"]
    if "category_id" in data and data["category_id"] is not None:
        old_category_id = expense.category_id
        expense.category_id = data["category_id"]
        # Aprender: si el gasto tiene merchant y el usuario cambió la categoría, guardar la regla
        if expense.merchant and old_category_id != data["category_id"]:
            await _upsert_category_rule(expense.user_id, expense.merchant, data["category_id"], db)
    if "date" in data and data["date"] is not None:
        expense.date = data["date"]
    if "notes" in data:
        expense.notes = data["notes"] or None
    await db.commit()
    result = await db.execute(
        select(Expense).where(Expense.id == expense_id).options(selectinload(Expense.category))
    )
    return result.scalar_one()


async def get_daily_totals(user_id: int, start: datetime, end: datetime, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(
            cast(Expense.date, SQLDate).label("day"),
            func.sum(Expense.amount).label("total"),
        )
        .where(Expense.user_id == user_id, Expense.date >= start, Expense.date <= end)
        .group_by("day")
        .order_by("day")
    )
    rows = result.all()
    by_date = {str(row.day): float(row.total) for row in rows}

    out: list[dict] = []
    current_day: PyDate = start.date()
    end_day: PyDate = end.date()
    while current_day <= end_day:
        out.append({"date": str(current_day), "total": by_date.get(str(current_day), 0.0)})
        current_day += timedelta(days=1)
    return out


async def get_monthly_summary(
    user_id: int, db: AsyncSession, tz_name: str = settings.app_timezone
) -> dict:
    now = now_local(tz_name)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return await _summary_for_period(user_id, start, now, db)


async def get_weekly_summary(
    user_id: int, db: AsyncSession, tz_name: str = settings.app_timezone
) -> dict:
    now = now_local(tz_name)
    start = now - timedelta(days=7)
    return await _summary_for_period(user_id, start, now, db)


async def get_range_summary(user_id: int, start: datetime, end: datetime, db: AsyncSession) -> dict:
    return await _summary_for_period(user_id, start, end, db)


async def _summary_for_period(user_id: int, start: datetime, end: datetime, db: AsyncSession) -> dict:
    total_result = await db.execute(
        select(func.sum(Expense.amount)).where(
            Expense.user_id == user_id, Expense.date >= start, Expense.date <= end,
        )
    )
    total = total_result.scalar() or Decimal("0")

    count_result = await db.execute(
        select(func.count()).where(
            Expense.user_id == user_id, Expense.date >= start, Expense.date <= end,
        )
    )
    count = count_result.scalar() or 0

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
        .where(Expense.user_id == user_id, Expense.date >= start, Expense.date <= end)
        .order_by(desc(Expense.date))
        .limit(5)
        .options(selectinload(Expense.category))
    )
    recent = recent_result.scalars().all()

    return {
        "total": float(total),
        "count": count,
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
