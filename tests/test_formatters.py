from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock

from app.utils.formatters import format_amount, format_expense_saved, format_monthly_summary


def test_format_amount_mxn():
    assert format_amount(Decimal("150.50"), "MXN") == "$150.50"


def test_format_amount_usd():
    assert format_amount(Decimal("10.00"), "USD") == "USD $10.00"


def test_format_expense_saved():
    expense = MagicMock()
    expense.amount = Decimal("200.00")
    expense.currency = "MXN"
    expense.description = "Cena en restaurante"
    expense.date = datetime(2026, 2, 26, tzinfo=timezone.utc)
    expense.source = "text"

    msg = format_expense_saved(expense, "Alimentación", "🍔")
    assert "✅" in msg
    assert "$200.00" in msg
    assert "Alimentación" in msg
    assert "🍔" in msg
    assert "26/02/2026" in msg


def test_format_monthly_summary_empty():
    summary = {
        "total": Decimal("0"),
        "by_category": [],
        "recent": [],
        "start": datetime(2026, 2, 1),
        "end": datetime(2026, 2, 26),
    }
    msg = format_monthly_summary(summary)
    assert "Resumen del mes" in msg
    assert "No hay gastos" in msg


def test_format_monthly_summary_with_data():
    summary = {
        "total": Decimal("500"),
        "by_category": [
            {"name": "Alimentación", "emoji": "🍔", "total": Decimal("300")},
            {"name": "Transporte", "emoji": "🚗", "total": Decimal("200")},
        ],
        "recent": [],
        "start": datetime(2026, 2, 1),
        "end": datetime(2026, 2, 26),
    }
    msg = format_monthly_summary(summary)
    assert "$500.00" in msg
    assert "Alimentación" in msg
    assert "60%" in msg
