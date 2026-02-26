"""
Tests unitarios para ai_service.
Usan mocks para no hacer llamadas reales a OpenAI.
"""
import json
from datetime import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ai_service import parse_expense_from_text


@pytest.mark.asyncio
async def test_parse_expense_basic():
    mock_response = MagicMock()
    mock_response.choices[0].message.content = json.dumps({
        "amount": 150.0,
        "currency": "MXN",
        "description": "Supermercado",
        "category_name": "Alimentación",
        "date": None,
    })

    with patch("app.services.ai_service.client") as mock_client:
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        result = await parse_expense_from_text("Gasté 150 en el súper")

    assert result is not None
    assert result.amount == Decimal("150.0")
    assert result.category_name == "Alimentación"
    assert result.description == "Supermercado"


@pytest.mark.asyncio
async def test_parse_expense_no_amount():
    mock_response = MagicMock()
    mock_response.choices[0].message.content = json.dumps({"error": "no_amount"})

    with patch("app.services.ai_service.client") as mock_client:
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        result = await parse_expense_from_text("Hola, ¿cómo estás?")

    assert result is None


@pytest.mark.asyncio
async def test_parse_expense_with_date():
    mock_response = MagicMock()
    mock_response.choices[0].message.content = json.dumps({
        "amount": 80.0,
        "currency": "MXN",
        "description": "Taxi al aeropuerto",
        "category_name": "Transporte",
        "date": "2026-02-20T14:00:00",
    })

    with patch("app.services.ai_service.client") as mock_client:
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        result = await parse_expense_from_text("Taxi al aeropuerto 80 pesos el jueves")

    assert result is not None
    assert result.amount == Decimal("80.0")
    assert result.category_name == "Transporte"
    assert result.date == datetime(2026, 2, 20, 14, 0, 0)
