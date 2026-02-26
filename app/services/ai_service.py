"""
Servicio de IA para extraer datos de gastos desde texto libre usando GPT-4o.
"""
import json
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation

from openai import AsyncOpenAI

from app.config import settings
from app.schemas.expense import ExpenseParsed

logger = logging.getLogger(__name__)
client = AsyncOpenAI(api_key=settings.openai_api_key)

CATEGORIES = [
    "Alimentación", "Transporte", "Hogar", "Entretenimiento",
    "Ropa", "Salud", "Tecnología", "Educación", "Trabajo",
    "Servicios", "Regalos", "Otros",
]

SYSTEM_PROMPT = f"""Eres un asistente que extrae información de gastos de mensajes en español.
Tu tarea es analizar el texto y devolver un JSON con los siguientes campos:
- amount: número decimal con el monto del gasto (solo el número, sin símbolo de moneda)
- currency: código de moneda ISO 4217 (por defecto "MXN" si no se especifica)
- description: descripción corta y clara del gasto (máximo 100 caracteres)
- category_name: una de las siguientes categorías exactas: {", ".join(CATEGORIES)}
- date: fecha del gasto en formato ISO 8601 (YYYY-MM-DDTHH:MM:SS), si no se menciona usa null

Responde ÚNICAMENTE con el JSON, sin texto adicional, sin markdown.
Si no puedes identificar un monto claro, devuelve {{"error": "no_amount"}}.
"""


async def parse_expense_from_text(text: str, today: datetime | None = None) -> ExpenseParsed | None:
    """
    Extrae datos de un gasto a partir de texto libre.
    Retorna None si el texto no contiene un gasto reconocible.
    """
    today = today or datetime.now()

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Fecha actual: {today.isoformat()}\n\nMensaje: {text}"},
            ],
            temperature=0,
            max_tokens=300,
        )

        raw = response.choices[0].message.content.strip()
        data = json.loads(raw)

        if "error" in data:
            return None

        date = None
        if data.get("date"):
            try:
                date = datetime.fromisoformat(data["date"])
            except ValueError:
                date = today

        return ExpenseParsed(
            amount=Decimal(str(data["amount"])),
            currency=data.get("currency", "MXN"),
            description=data["description"],
            category_name=data.get("category_name", "Otros"),
            date=date or today,
        )

    except (json.JSONDecodeError, KeyError, InvalidOperation) as e:
        logger.error("Error parseando respuesta de IA: %s | raw: %s", e, locals().get("raw", ""))
        return None
    except Exception as e:
        logger.exception("Error inesperado en ai_service: %s", e)
        return None
