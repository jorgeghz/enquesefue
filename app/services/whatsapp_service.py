"""
Servicio para integración con Twilio WhatsApp.
Maneja: envío de mensajes, descarga de media y validación de firma.
"""
import base64
import hashlib
import hmac
import logging
from datetime import datetime
from urllib.parse import urlencode

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"


# ---------------------------------------------------------------------------
# Seguridad: validación de firma Twilio
# ---------------------------------------------------------------------------

def validate_twilio_signature(url: str, params: dict[str, str], signature: str) -> bool:
    """
    Verifica que el request proviene realmente de Twilio.
    Algoritmo: HMAC-SHA1(auth_token, url + sorted_params_concatenated)
    Ref: https://www.twilio.com/docs/usage/webhooks/webhooks-security
    """
    if not settings.twilio_auth_token:
        return True  # en dev sin credenciales, no bloquear

    # Concatenar URL + parámetros ordenados alfabéticamente
    sorted_params = "".join(f"{k}{v}" for k, v in sorted(params.items()))
    s = url + sorted_params

    expected = base64.b64encode(
        hmac.new(
            settings.twilio_auth_token.encode("utf-8"),
            s.encode("utf-8"),
            hashlib.sha1,
        ).digest()
    ).decode("utf-8")

    return hmac.compare_digest(expected, signature)


# ---------------------------------------------------------------------------
# Descarga de media
# ---------------------------------------------------------------------------

async def download_media(url: str) -> bytes:
    """Descarga un archivo multimedia de Twilio (requiere auth básica)."""
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            url,
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            follow_redirects=True,
        )
        response.raise_for_status()
        return response.content


# ---------------------------------------------------------------------------
# Envío de mensajes
# ---------------------------------------------------------------------------

async def send_message(to: str, body: str) -> None:
    """Envía un mensaje de WhatsApp usando la API REST de Twilio."""
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        logger.warning("Twilio no configurado — mensaje no enviado a %s: %s", to, body[:80])
        return

    url = f"{_TWILIO_API_BASE}/Accounts/{settings.twilio_account_sid}/Messages.json"
    payload = {
        "From": settings.twilio_whatsapp_from,
        "To": to,
        "Body": body,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            response = await client.post(
                url,
                data=payload,
                auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            )
            response.raise_for_status()
            logger.info("Mensaje enviado a %s (%d chars)", to, len(body))
        except httpx.HTTPStatusError as e:
            logger.error("Error Twilio al enviar mensaje: %s — %s", e.response.status_code, e.response.text)
        except Exception as e:
            logger.exception("Error inesperado enviando mensaje Twilio: %s", e)


# ---------------------------------------------------------------------------
# Formateo de respuestas (texto plano + emojis para WhatsApp)
# ---------------------------------------------------------------------------

def format_expense_ok(expense, duplicate=None) -> str:
    """Confirmación de gasto guardado."""
    date_str = expense.date.strftime("%-d %b %Y") if hasattr(expense.date, "strftime") else str(expense.date)
    category = expense.category.name if expense.category else "Sin categoría"
    emoji = expense.category.emoji if expense.category else "💰"

    lines = [
        "✅ *Gasto guardado*",
        f"📝 {expense.description}",
        f"💵 ${expense.amount:,.2f} {expense.currency}",
        f"{emoji} {category}   📅 {date_str}",
    ]
    if duplicate:
        lines.append(f"\n⚠️ _Posible duplicado de un gasto similar del {duplicate.date.strftime('%-d %b')}._")
    return "\n".join(lines)


def format_pdf_ok(created: int, duplicates: int, total: float, currency: str = "MXN") -> str:
    """Resultado de importación de PDF."""
    lines = [
        "📄 *Estado de cuenta procesado*",
        f"✅ {created} transacciones guardadas",
    ]
    if duplicates:
        lines.append(f"⚠️ {duplicates} posibles duplicados")
    lines.append(f"💵 Total: ${total:,.2f} {currency}")
    return "\n".join(lines)


def format_monthly_summary(data: dict) -> str:
    """Resumen mensual de gastos."""
    total = data.get("total", 0)
    by_category = data.get("by_category", [])
    start: datetime = data.get("start")
    month_str = start.strftime("%B %Y") if start else "este mes"

    lines = [f"📊 *Resumen de {month_str}*", f"💵 Total: ${total:,.2f} MXN", ""]
    for item in by_category[:5]:
        pct = (item["total"] / total * 100) if total else 0
        lines.append(f"{item['emoji']} {item['name']}: ${item['total']:,.2f} ({pct:.0f}%)")
    if len(by_category) > 5:
        lines.append(f"  ...y {len(by_category) - 5} categorías más")
    return "\n".join(lines)


def format_weekly_summary(data: dict) -> str:
    """Resumen de los últimos 7 días."""
    total = data.get("total", 0)
    by_category = data.get("by_category", [])

    lines = ["📊 *Últimos 7 días*", f"💵 Total: ${total:,.2f} MXN", ""]
    for item in by_category[:5]:
        pct = (item["total"] / total * 100) if total else 0
        lines.append(f"{item['emoji']} {item['name']}: ${item['total']:,.2f} ({pct:.0f}%)")
    return "\n".join(lines)


def format_last_expenses(expenses: list) -> str:
    """Lista de últimos gastos."""
    if not expenses:
        return "No tienes gastos registrados aún."

    lines = ["📋 *Últimos gastos*"]
    for e in expenses:
        date_str = e.date.strftime("%-d %b") if hasattr(e.date, "strftime") else ""
        emoji = e.category.emoji if e.category else "💰"
        lines.append(f"{emoji} {e.description} — ${e.amount:,.2f}  _{date_str}_")
    return "\n".join(lines)


def format_help() -> str:
    return (
        "🤖 *enquesefue — comandos disponibles*\n\n"
        "💬 Escribe un gasto en texto:\n"
        "  _\"gasté 150 en el super\"_\n\n"
        "🎤 Envía una nota de voz con el gasto\n\n"
        "📷 Envía una foto del ticket o recibo\n\n"
        "📄 Envía un PDF de tu estado de cuenta\n\n"
        "📊 *resumen* — gastos del mes actual\n"
        "📅 *semana* — gastos de los últimos 7 días\n"
        "📋 *últimos* — tus 5 gastos más recientes\n"
        "❓ *ayuda* — este mensaje"
    )


def format_not_linked() -> str:
    return (
        "👋 Hola, no reconozco tu número.\n\n"
        "Para vincular tu cuenta de enquesefue:\n\n"
        "1️⃣ Abre la app web\n"
        "2️⃣ Ve a *Configuración → Vincular WhatsApp*\n"
        "3️⃣ Envíame el PIN de 6 dígitos que aparece ahí\n\n"
        "¿No tienes cuenta? Escribe:\n"
        "_registro tu@email.com contraseña TuNombre_"
    )


def format_expense_error(detail: str = "") -> str:
    msg = "❌ No pude identificar un gasto en tu mensaje."
    if detail:
        msg += f"\n_{detail}_"
    msg += "\n\nIntenta: _\"gasté 200 en gasolina\"_ o envía una foto del ticket."
    return msg


def format_link_ok(name: str) -> str:
    return f"✅ ¡Listo! Tu número quedó vinculado a la cuenta de *{name}*.\nYa puedes registrar gastos aquí."


def format_pin_expired() -> str:
    return "❌ PIN inválido o expirado.\nGenera uno nuevo en la app: *Configuración → Vincular WhatsApp*."
