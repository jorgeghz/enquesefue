"""
Servicio para extraer transacciones de estados de cuenta bancarios en PDF.
Usa pdfplumber para extraer texto y GPT-4o para identificar las transacciones.
"""
import io
import json
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation

import pdfplumber
from app.schemas.expense import ExpenseParsed
from app.services.ai_service import CATEGORIES, client

logger = logging.getLogger(__name__)

PDF_SYSTEM_PROMPT = f"""Eres un asistente experto en analizar estados de cuenta bancarios.
Se te proporcionará el texto extraído de un PDF de estado de cuenta.
Tu tarea es identificar TODOS los gastos/cargos/compras (no depósitos ni ingresos).

Devuelve un array JSON con los gastos encontrados. Cada elemento debe tener:
- amount: monto del gasto (número decimal positivo)
- currency: código ISO 4217 (por defecto "MXN")
- description: descripción del comercio o concepto (máximo 100 caracteres)
- category_name: una de: {", ".join(CATEGORIES)}
- date: fecha en formato YYYY-MM-DD si está disponible, si no usa null

Ejemplo de respuesta:
[
  {{"amount": 250.00, "currency": "MXN", "description": "OXXO SUCURSAL 123", "category_name": "Alimentación", "date": "2026-02-15"}},
  {{"amount": 800.00, "currency": "MXN", "description": "CFE PAGO", "category_name": "Servicios", "date": "2026-02-10"}}
]

Si el PDF no parece ser un estado de cuenta o no hay gastos identificables, devuelve [].
Responde ÚNICAMENTE con el JSON array, sin texto adicional.
"""


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extrae todo el texto visible de un PDF."""
    text_parts = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
    return "\n".join(text_parts)


async def parse_bank_statement(pdf_bytes: bytes, today: datetime | None = None) -> list[ExpenseParsed]:
    """
    Extrae una lista de gastos de un estado de cuenta PDF.
    Retorna lista vacía si no se encuentran transacciones.
    """
    today = today or datetime.now()

    try:
        pdf_text = extract_text_from_pdf(pdf_bytes)
        if not pdf_text.strip():
            logger.warning("PDF sin texto extraíble")
            return []

        # GPT-4o tiene límite de tokens — truncar si es muy largo
        if len(pdf_text) > 12000:
            pdf_text = pdf_text[:12000] + "\n[...texto truncado...]"

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": PDF_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"Fecha actual: {today.isoformat()}\n\nContenido del estado de cuenta:\n{pdf_text}",
                },
            ],
            temperature=0,
            max_tokens=2000,
        )

        raw = response.choices[0].message.content.strip()
        transactions = json.loads(raw)

        if not isinstance(transactions, list):
            return []

        result = []
        for t in transactions:
            try:
                date = today
                if t.get("date"):
                    try:
                        date = datetime.fromisoformat(t["date"])
                    except ValueError:
                        pass

                result.append(ExpenseParsed(
                    amount=Decimal(str(t["amount"])),
                    currency=t.get("currency", "MXN"),
                    description=str(t.get("description", "Transacción"))[:255],
                    category_name=t.get("category_name", "Otros"),
                    date=date,
                ))
            except (KeyError, InvalidOperation):
                continue

        logger.info("PDF: %d transacciones extraídas", len(result))
        return result

    except (json.JSONDecodeError, Exception) as e:
        logger.exception("Error procesando PDF: %s", e)
        return []
