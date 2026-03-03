"""
Servicio para analizar imágenes de tickets/recibos con GPT-4o Vision.
Recibe bytes directamente (desde upload web).
"""
import asyncio
import base64
import json
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation

from app.config import settings
from app.schemas.expense import ExpenseParsed
from app.services.ai_service import CATEGORIES, client
from app.utils.tz import normalize_expense_date, now_local

logger = logging.getLogger(__name__)

VISION_SYSTEM_PROMPT = f"""Eres un asistente experto en identificar gastos a partir de imágenes.
Acepta cualquier imagen que muestre información de una compra o pago:
tickets físicos, recibos impresos, facturas, pantallas de apps de pago (Clip, Mercado Pago,
CoDi, SPEI, etc.), comprobantes digitales, notas de consumo, etc.

Extrae la información del gasto y devuelve un JSON con:
- amount: monto total pagado (número decimal, sin símbolo de moneda). Si hay varios subtotales,
  usa el TOTAL final. Si ves un precio claramente aunque no sea el total, úsalo.
- currency: código ISO 4217 (por defecto "MXN" si no se especifica)
- description: descripción corta del gasto (máximo 100 caracteres, ej: "Despensa semanal")
- category_name: una de las siguientes categorías: {", ".join(CATEGORIES)}
- date: fecha y hora del ticket en formato ISO 8601 (con hora si aparece, ej: "2026-02-15T14:30:00"), o null si no aparece
- merchant: nombre del comercio o establecimiento tal como aparece en el ticket, o null si no se ve claramente
- address: dirección del establecimiento si aparece en el ticket (calle, número, colonia, ciudad), o null si no aparece

Solo devuelve {{"error": "not_a_receipt"}} si la imagen NO muestra absolutamente ningún precio,
monto o información de pago (ej: foto de una persona, paisaje, etc.).
Solo devuelve {{"error": "no_amount"}} si claramente es una compra pero el monto está
completamente ilegible o cortado de la imagen.
En caso de duda, intenta extraer el mejor monto que puedas leer.
Responde ÚNICAMENTE con el JSON, sin texto adicional.
"""


async def analyze_receipt_bytes(
    image_bytes: bytes,
    mime_type: str = "image/jpeg",
    caption: str = "",
    today: datetime | None = None,
    tz_name: str = settings.app_timezone,
) -> ExpenseParsed | None:
    """
    Analiza una imagen de ticket/recibo y extrae los datos del gasto.
    Recibe los bytes directamente del archivo subido.
    Retorna None si la imagen no es un ticket válido.
    """
    today = today or now_local(tz_name)

    try:
        image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

        user_content = [
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{image_b64}", "detail": "high"},
            }
        ]
        if caption:
            user_content.insert(0, {"type": "text", "text": f"Nota adicional del usuario: {caption}"})
        user_content.insert(0, {"type": "text", "text": f"Fecha actual: {today.isoformat()}"})

        def _call():
            return client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": VISION_SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                temperature=0,
                max_tokens=400,
            )

        response = await asyncio.to_thread(_call)
        raw = response.choices[0].message.content.strip()
        # GPT-4o a veces envuelve el JSON en markdown code fences (```json ... ```)
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines and lines[-1].strip() == "```" else lines[1:])
            raw = raw.strip()
        logger.debug("Vision raw response: %s", raw[:300])
        data = json.loads(raw)

        if "error" in data:
            logger.warning("Vision API rechazó la imagen: %s | raw=%s", data["error"], raw[:200])
            return None

        date = today
        if data.get("date"):
            try:
                date = datetime.fromisoformat(data["date"])
            except ValueError:
                pass
        date = normalize_expense_date(date, tz_name)

        merchant = data.get("merchant") or None
        address = data.get("address") or None

        return ExpenseParsed(
            amount=Decimal(str(data["amount"])),
            currency=data.get("currency", "MXN"),
            description=data.get("description", "Ticket")[:255],
            category_name=data.get("category_name", "Otros"),
            date=date,
            merchant=merchant[:255] if merchant else None,
            address=address[:500] if address else None,
        )

    except (json.JSONDecodeError, KeyError, InvalidOperation) as e:
        logger.error("Error parseando respuesta de vision: %s | raw=%s", e, locals().get("raw", ""))
        return None
    except Exception as e:
        logger.exception("Error inesperado en vision_service: %s", e)
        return None
