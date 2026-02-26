"""
Tests unitarios para la detección de gastos duplicados.
Cubre: compute_file_hash, make_duplicate_info,
       find_duplicate_by_hash, find_duplicate_by_fingerprint, save_expense.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.expense import ExpenseParsed
from app.services.expense_service import (
    compute_file_hash,
    find_duplicate_by_fingerprint,
    find_duplicate_by_hash,
    make_duplicate_info,
    save_expense,
)


# ── compute_file_hash ──────────────────────────────────────────────────────────

def test_compute_file_hash_is_64_chars():
    h = compute_file_hash(b"hello world")
    assert len(h) == 64


def test_compute_file_hash_deterministic():
    assert compute_file_hash(b"abc") == compute_file_hash(b"abc")


def test_compute_file_hash_different_inputs_differ():
    assert compute_file_hash(b"abc") != compute_file_hash(b"xyz")


def test_compute_file_hash_empty_bytes():
    h = compute_file_hash(b"")
    assert len(h) == 64  # SHA-256 de bytes vacíos es válido


# ── make_duplicate_info ────────────────────────────────────────────────────────

def test_make_duplicate_info_none():
    assert make_duplicate_info(None) is None


def test_make_duplicate_info_builds_correct_fields():
    expense = MagicMock()
    expense.id = 42
    expense.amount = Decimal("150.00")
    expense.currency = "MXN"
    expense.description = "Starbucks"
    expense.date = datetime(2026, 2, 26, tzinfo=timezone.utc)
    expense.source = "text"

    info = make_duplicate_info(expense)

    assert info is not None
    assert info.id == 42
    assert info.amount == 150.0
    assert info.currency == "MXN"
    assert info.description == "Starbucks"
    assert info.source == "text"


# ── find_duplicate_by_hash ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_find_duplicate_by_hash_found():
    existing = MagicMock()
    existing.id = 7

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing

    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result

    result = await find_duplicate_by_hash("abc123", user_id=1, db=mock_db)

    assert result is existing
    mock_db.execute.assert_called_once()


@pytest.mark.asyncio
async def test_find_duplicate_by_hash_not_found():
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None

    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result

    result = await find_duplicate_by_hash("nonexistent", user_id=1, db=mock_db)

    assert result is None


# ── find_duplicate_by_fingerprint ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_find_duplicate_by_fingerprint_found_same_day():
    existing = MagicMock()
    existing.id = 3

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing

    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result

    parsed = ExpenseParsed(
        amount=Decimal("150.00"),
        currency="MXN",
        description="Café",
        category_name="Alimentación",
        date=datetime(2026, 2, 26, 12, 0, tzinfo=timezone.utc),
    )

    result = await find_duplicate_by_fingerprint(parsed, user_id=1, db=mock_db)

    assert result is existing
    mock_db.execute.assert_called_once()


@pytest.mark.asyncio
async def test_find_duplicate_by_fingerprint_not_found():
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None

    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result

    parsed = ExpenseParsed(
        amount=Decimal("99.99"),
        currency="MXN",
        description="Gasolina",
        category_name="Transporte",
        date=datetime(2026, 2, 26, tzinfo=timezone.utc),
    )

    result = await find_duplicate_by_fingerprint(parsed, user_id=1, db=mock_db)

    assert result is None


@pytest.mark.asyncio
async def test_find_duplicate_by_fingerprint_uses_now_when_no_date():
    """Si ExpenseParsed.date es None, la ventana se construye desde datetime.now()."""
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None

    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result

    parsed = ExpenseParsed(
        amount=Decimal("50.00"),
        currency="MXN",
        description="Taxi",
        category_name="Transporte",
        date=None,  # sin fecha
    )

    # No debe lanzar excepción
    result = await find_duplicate_by_fingerprint(parsed, user_id=1, db=mock_db)
    assert result is None
    mock_db.execute.assert_called_once()


# ── save_expense ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_save_expense_returns_tuple_no_duplicate():
    """Sin duplicado → (Expense, None)."""
    user = MagicMock()
    user.id = 1
    user.currency = "MXN"

    mock_category = MagicMock()
    mock_category.id = 5

    new_expense = MagicMock()
    new_expense.id = 99

    # DB mock
    mock_result_no_dup = MagicMock()
    mock_result_no_dup.scalar_one_or_none.return_value = None  # sin duplicado

    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result_no_dup
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    parsed = ExpenseParsed(
        amount=Decimal("200.00"),
        currency="MXN",
        description="Cena",
        category_name="Alimentación",
        date=datetime(2026, 2, 26, tzinfo=timezone.utc),
    )

    with patch("app.services.expense_service.get_or_create_category", return_value=mock_category):
        expense, duplicate = await save_expense(parsed, user, "text", "Cena 200", mock_db)

    assert duplicate is None
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_save_expense_returns_tuple_with_duplicate():
    """Con duplicado detectado por fingerprint → (Expense, duplicate)."""
    user = MagicMock()
    user.id = 1
    user.currency = "MXN"

    mock_category = MagicMock()
    mock_category.id = 5

    existing_dup = MagicMock()
    existing_dup.id = 55

    mock_result_dup = MagicMock()
    mock_result_dup.scalar_one_or_none.return_value = existing_dup

    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result_dup
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    parsed = ExpenseParsed(
        amount=Decimal("150.00"),
        currency="MXN",
        description="Starbucks",
        category_name="Alimentación",
        date=datetime(2026, 2, 26, tzinfo=timezone.utc),
    )

    with patch("app.services.expense_service.get_or_create_category", return_value=mock_category):
        expense, duplicate = await save_expense(parsed, user, "image", "ticket.jpg", mock_db)

    assert duplicate is existing_dup
    mock_db.add.assert_called_once()


@pytest.mark.asyncio
async def test_save_expense_hash_check_runs_before_fingerprint():
    """Con file_hash, se consulta hash primero; si encuentra, no consulta fingerprint."""
    user = MagicMock()
    user.id = 1
    user.currency = "MXN"

    mock_category = MagicMock()
    mock_category.id = 3

    hash_match = MagicMock()
    hash_match.id = 11

    mock_result_hash = MagicMock()
    mock_result_hash.scalar_one_or_none.return_value = hash_match

    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result_hash
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    parsed = ExpenseParsed(
        amount=Decimal("75.00"),
        currency="MXN",
        description="Ticket gasolina",
        category_name="Transporte",
        date=datetime(2026, 2, 26, tzinfo=timezone.utc),
    )

    with patch("app.services.expense_service.get_or_create_category", return_value=mock_category):
        _, duplicate = await save_expense(
            parsed, user, "image", "foto.jpg", mock_db, file_hash="abc123deadbeef"
        )

    # El duplicado debe ser el encontrado por hash
    assert duplicate is hash_match
    # Solo debe haberse ejecutado UNA consulta (la de hash, no la de fingerprint)
    assert mock_db.execute.call_count == 1


@pytest.mark.asyncio
async def test_save_expense_stores_file_hash():
    """El file_hash pasado se almacena en el Expense creado."""
    user = MagicMock()
    user.id = 1
    user.currency = "MXN"

    mock_category = MagicMock()
    mock_category.id = 2

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None

    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    parsed = ExpenseParsed(
        amount=Decimal("300.00"),
        currency="MXN",
        description="PDF import",
        category_name="Servicios",
        date=datetime(2026, 2, 26, tzinfo=timezone.utc),
    )

    captured = {}

    # db.add() es síncrono (no awaited) → necesita MagicMock, no AsyncMock
    def capture_add(obj):
        captured["expense"] = obj
    mock_db.add = MagicMock(side_effect=capture_add)

    file_hash = "cafebabe" * 8  # 64 chars

    with patch("app.services.expense_service.get_or_create_category", return_value=mock_category):
        await save_expense(parsed, user, "image", "foto.jpg", mock_db, file_hash=file_hash)

    assert captured["expense"].file_hash == file_hash
