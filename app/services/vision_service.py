"""
Servicio para analizar imágenes de tickets/recibos con GPT-4o Vision.
Recibe bytes directamente (desde upload web).
"""
import base64
import json
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation

from app.schemas.expense import ExpenseParsed
from app.services.ai_service import CATEGORIES, client

logger = logging.getLogger(__name__)

VISION_SYSTEM_PROMPT = f"""Eres un asistente experto en analizar tickets y recibos de compra.
Analiza la imagen y extrae la información del gasto. Devuelve un JSON con:
- amount: monto total del ticket/recibo (número decimal, sin símbolo de moneda)
- currency: código ISO 4217 (por defecto "MXN")
- description: descripción concisa del gasto (máximo 100 caracteres, ej: "Supermercado Walmart")
- category_name: una de las siguientes categorías: {", ".join(CATEGORIES)}
- date: fecha del ticket en formato ISO 8601 si está visible, si no usa null
- merchant: nombre del comercio si está visible, si no usa null

Si la imagen NO es un ticket o recibo, devuelve {{"error": "not_a_receipt"}}.
Si no puedes leer el monto total, devuelve {{"error": "no_amount"}}.
Responde ÚNICAMENTE con el JSON, sin texto adicional.
"""


async def analyze_receipt_bytes(image_bytes: bytes, mime_type: str = "image/jpeg", caption: str = "", today: datetime | None = None) -> ExpenseParsed | None:
    """
    Analiza una imagen de ticket/recibo y extrae los datos del gasto.
    Recibe los bytes directamente del archivo subido.
    Retorna None si la imagen no es un ticket válido.
    """
    today = today or datetime.now()

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

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": VISION_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0,
            max_tokens=400,
        )

        raw = response.choices[0].message.content.strip()
        data = json.loads(raw)

        if "error" in data:
            logger.info("Vision API indicó error: %s", data["error"])
            return None

        date = today
        if data.get("date"):
            try:
                date = datetime.fromisoformat(data["date"])
            except ValueError:
                pass

        description = data.get("description", "Ticket")
        merchant = data.get("merchant")
        if merchant and merchant not in description:
            description = f"{merchant} — {description}"

        return ExpenseParsed(
            amount=Decimal(str(data["amount"])),
            currency=data.get("currency", "MXN"),
            description=description[:255],
            category_name=data.get("category_name", "Otros"),
            date=date,
        )

    except (json.JSONDecodeError, KeyError, InvalidOperation) as e:
        logger.error("Error parseando respuesta de vision: %s", e)
        return None
    except Exception as e:
        logger.exception("Error inesperado en vision_service: %s", e)
        return None
