"""
Servicio de IA para extraer datos de gastos desde texto libre usando GPT-4o.
"""
import asyncio
import json
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation

from openai import OpenAI

from app.config import settings
from app.schemas.expense import ExpenseParsed

logger = logging.getLogger(__name__)
client = OpenAI(api_key=settings.openai_api_key)

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

MULTI_SYSTEM_PROMPT = f"""Eres un asistente que extrae gastos de mensajes en español.
El mensaje puede contener UNO O VARIOS gastos, posiblemente de fechas distintas.

Devuelve un array JSON con TODOS los gastos encontrados. Cada elemento debe tener:
- amount: número decimal (sin símbolo de moneda)
- currency: código ISO 4217 (por defecto "MXN")
- description: descripción corta y clara (máximo 100 caracteres)
- category_name: una de las siguientes categorías exactas: {", ".join(CATEGORIES)}
- date: fecha en formato ISO 8601 (YYYY-MM-DDTHH:MM:SS), o null si no se menciona

Responde ÚNICAMENTE con el array JSON, sin texto adicional, sin markdown.
Si no encuentras ningún gasto claro, devuelve [].
Ejemplo: [{{"amount": 150, "currency": "MXN", "description": "Tacos", "category_name": "Alimentación", "date": null}}]
"""


async def parse_expense_from_text(text: str, today: datetime | None = None) -> ExpenseParsed | None:
    """
    Extrae datos de un gasto a partir de texto libre.
    Retorna None si el texto no contiene un gasto reconocible.
    """
    today = today or datetime.now()

    def _call() -> str:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Fecha actual: {today.isoformat()}\n\nMensaje: {text}"},
            ],
            temperature=0,
            max_tokens=300,
        )
        return response.choices[0].message.content.strip()

    try:
        raw = await asyncio.to_thread(_call)
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines and lines[-1].strip() == "```" else lines[1:])
            raw = raw.strip()
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


async def parse_multiple_expenses_from_text(
    text: str, today: datetime | None = None
) -> list[ExpenseParsed]:
    """
    Extrae uno o varios gastos de texto libre (ideal para notas de voz).
    Retorna lista vacía si no se identifican gastos.
    """
    today = today or datetime.now()

    def _call() -> str:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": MULTI_SYSTEM_PROMPT},
                {"role": "user", "content": f"Fecha actual: {today.isoformat()}\n\nMensaje: {text}"},
            ],
            temperature=0,
            max_tokens=800,
        )
        return response.choices[0].message.content.strip()

    try:
        raw = await asyncio.to_thread(_call)
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines and lines[-1].strip() == "```" else lines[1:])
            raw = raw.strip()
        items = json.loads(raw)
        if not isinstance(items, list):
            return []

        results: list[ExpenseParsed] = []
        for item in items:
            try:
                date = None
                if item.get("date"):
                    try:
                        date = datetime.fromisoformat(item["date"])
                    except ValueError:
                        date = today
                results.append(ExpenseParsed(
                    amount=Decimal(str(item["amount"])),
                    currency=item.get("currency", "MXN"),
                    description=item["description"],
                    category_name=item.get("category_name", "Otros"),
                    date=date or today,
                ))
            except (KeyError, InvalidOperation) as e:
                logger.warning("Saltando gasto malformado en respuesta multi: %s | item: %s", e, item)
        return results

    except (json.JSONDecodeError, Exception) as e:
        logger.error("Error parseando respuesta multi de IA: %s | raw: %s", e, locals().get("raw", ""))
        return []
