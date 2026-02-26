"""
Router para integración WhatsApp via Twilio.

Endpoints:
  POST /api/whatsapp/webhook   — recibe mensajes de Twilio
  POST /api/whatsapp/link-pin  — genera PIN para vincular número (requiere JWT)
"""
import logging
import random
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.whatsapp import WhatsAppLinkToken
from app.services.ai_service import parse_expense_from_text
from app.services.audio_service import transcribe_audio_bytes
from app.services.auth_service import register_user
from app.services.expense_service import (
    get_monthly_summary,
    get_weekly_summary,
    list_expenses,
    save_expense,
)
from app.services.pdf_service import parse_bank_statement
from app.services.vision_service import analyze_receipt_bytes
from app.services.whatsapp_service import (
    download_media,
    format_expense_error,
    format_expense_ok,
    format_help,
    format_last_expenses,
    format_link_ok,
    format_monthly_summary,
    format_not_linked,
    format_pdf_ok,
    format_pin_expired,
    format_weekly_summary,
    send_message,
    validate_twilio_signature,
)
from app.schemas.user import UserCreate

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])
logger = logging.getLogger(__name__)

# Comandos de texto reconocidos
_COMMANDS = {"resumen", "semana", "últimos", "ultimos", "ayuda", "help"}


# ---------------------------------------------------------------------------
# POST /api/whatsapp/webhook
# ---------------------------------------------------------------------------

@router.post("/webhook", status_code=200)
async def whatsapp_webhook(
    request: Request,
    From: str = Form(...),
    Body: str = Form(default=""),
    NumMedia: int = Form(default=0),
    MediaUrl0: str | None = Form(default=None),
    MediaContentType0: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
):
    # ── 1. Validar firma Twilio (solo en producción) ──────────────────────
    from app.config import settings
    if settings.environment == "production":
        signature = request.headers.get("X-Twilio-Signature", "")
        form_data = dict(await request.form())
        url = str(request.url)
        if not validate_twilio_signature(url, {k: str(v) for k, v in form_data.items()}, signature):
            logger.warning("Firma Twilio inválida — request rechazado")
            raise HTTPException(status_code=403, detail="Firma inválida")

    # ── 2. Parsear número de teléfono ─────────────────────────────────────
    phone = From.replace("whatsapp:", "").strip()
    body_clean = Body.strip()

    # ── 3. Buscar usuario por número de WhatsApp ──────────────────────────
    result = await db.execute(select(User).where(User.whatsapp_phone == phone))
    user = result.scalar_one_or_none()

    # ── 4. Usuario NO vinculado ───────────────────────────────────────────
    if user is None:
        reply = await _handle_unlinked(phone, body_clean, db)
        await send_message(From, reply)
        return {"status": "ok"}

    # ── 5. Usuario vinculado — procesar mensaje ───────────────────────────
    try:
        reply = await _handle_linked(user, From, body_clean, NumMedia, MediaUrl0, MediaContentType0, db)
    except Exception as e:
        logger.exception("Error procesando mensaje de %s: %s", phone, e)
        reply = "❌ Ocurrió un error procesando tu mensaje. Intenta de nuevo."

    await send_message(From, reply)
    return {"status": "ok"}


async def _handle_unlinked(phone: str, body: str, db: AsyncSession) -> str:
    """Gestiona usuarios cuyo número aún no está vinculado."""

    # ── Opción A: body es un PIN de 6 dígitos ─────────────────────────────
    if body.isdigit() and len(body) == 6:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(WhatsAppLinkToken)
            .where(
                WhatsAppLinkToken.token == body,
                WhatsAppLinkToken.used.is_(False),
                WhatsAppLinkToken.expires_at > now,
            )
            .options(selectinload(WhatsAppLinkToken.user))
        )
        link_token = result.scalar_one_or_none()

        if not link_token:
            return format_pin_expired()

        # Vincular
        link_token.user.whatsapp_phone = phone
        link_token.used = True
        await db.commit()
        return format_link_ok(link_token.user.name)

    # ── Opción B: registro directo "registro email pass nombre" ───────────
    lower = body.lower()
    if lower.startswith("registro "):
        parts = body.split(maxsplit=3)  # ["registro", "email", "pass", "nombre"]
        if len(parts) < 4:
            return (
                "⚠️ Formato incorrecto. Usa:\n"
                "_registro tu@email.com contraseña TuNombre_"
            )
        _, email, password, name = parts[0], parts[1], parts[2], parts[3]

        # Verificar que el email no exista ya
        existing = await db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            return (
                "❌ Ese email ya tiene cuenta.\n"
                "Vincula tu número desde la app: *Configuración → Vincular WhatsApp*."
            )

        # Crear usuario con número vinculado
        user_data = UserCreate(email=email, password=password, name=name)
        new_user = await register_user(user_data, db)
        new_user.whatsapp_phone = phone
        await db.commit()
        return (
            f"✅ ¡Cuenta creada y número vinculado! Bienvenido, *{name}*.\n"
            "⚠️ _Nota: evita enviar contraseñas por WhatsApp en el futuro._\n\n"
            "Ya puedes registrar gastos aquí. Escribe *ayuda* para ver los comandos."
        )

    # ── Sin coincidencia ──────────────────────────────────────────────────
    return format_not_linked()


async def _handle_linked(
    user: User,
    from_wa: str,
    body: str,
    num_media: int,
    media_url: str | None,
    media_content_type: str | None,
    db: AsyncSession,
) -> str:
    """Procesa el mensaje de un usuario ya vinculado."""
    cmd = body.lower().strip()

    # ── Comandos de consulta ──────────────────────────────────────────────
    if cmd == "resumen":
        data = await get_monthly_summary(user.id, db)
        return format_monthly_summary(data)

    if cmd == "semana":
        data = await get_weekly_summary(user.id, db)
        return format_weekly_summary(data)

    if cmd in ("últimos", "ultimos"):
        expenses, _ = await list_expenses(user.id, db, page=1, limit=5)
        return format_last_expenses(expenses)

    if cmd in ("ayuda", "help"):
        return format_help()

    # ── Media ─────────────────────────────────────────────────────────────
    if num_media > 0 and media_url and media_content_type:
        return await _handle_media(user, media_url, media_content_type, body, db)

    # ── Texto libre → parsear como gasto ─────────────────────────────────
    if not body:
        return format_help()

    parsed = await parse_expense_from_text(body)
    if not parsed:
        return format_expense_error()

    from app.models.expense import Expense as ExpenseModel
    from sqlalchemy.orm import selectinload as _si

    expense, dup = await save_expense(parsed, user, source="text", raw_input=body, db=db)
    exp_result = await db.execute(
        select(ExpenseModel).where(ExpenseModel.id == expense.id).options(_si(ExpenseModel.category))
    )
    expense = exp_result.scalar_one()
    return format_expense_ok(expense, dup)


async def _handle_media(
    user: User,
    media_url: str,
    content_type: str,
    caption: str,
    db: AsyncSession,
) -> str:
    """Descarga y procesa un archivo multimedia."""
    from app.models.expense import Expense as ExpenseModel
    from sqlalchemy.orm import selectinload as _si
    from app.services.expense_service import compute_file_hash

    media_bytes = await download_media(media_url)

    # ── Imagen ────────────────────────────────────────────────────────────
    if content_type.startswith("image/"):
        parsed = await analyze_receipt_bytes(media_bytes, mime_type=content_type, caption=caption)
        if not parsed:
            return "❌ No pude leer el ticket. Asegúrate de que la imagen sea clara y muestre el monto total."
        file_hash = compute_file_hash(media_bytes)
        expense, dup = await save_expense(parsed, user, source="image", raw_input="imagen", db=db, file_hash=file_hash)
        exp_result = await db.execute(
            select(ExpenseModel).where(ExpenseModel.id == expense.id).options(_si(ExpenseModel.category))
        )
        expense = exp_result.scalar_one()
        return format_expense_ok(expense, dup)

    # ── Audio ─────────────────────────────────────────────────────────────
    if content_type.startswith("audio/"):
        transcription = await transcribe_audio_bytes(media_bytes, mime_type=content_type)
        if not transcription:
            return "❌ No pude transcribir el audio. Intenta de nuevo con más claridad."
        parsed = await parse_expense_from_text(transcription)
        if not parsed:
            return format_expense_error(f"Transcribí: \"{transcription}\"")
        expense, dup = await save_expense(parsed, user, source="audio", raw_input=transcription, db=db)
        exp_result = await db.execute(
            select(ExpenseModel).where(ExpenseModel.id == expense.id).options(_si(ExpenseModel.category))
        )
        expense = exp_result.scalar_one()
        return f"🎤 _{transcription}_\n\n{format_expense_ok(expense, dup)}"

    # ── PDF ───────────────────────────────────────────────────────────────
    if content_type == "application/pdf":
        transactions = await parse_bank_statement(media_bytes)
        if not transactions:
            return "❌ No encontré transacciones en el PDF. ¿Es un estado de cuenta bancario?"

        total = 0.0
        dup_count = 0
        currency = "MXN"
        for parsed in transactions:
            expense, dup = await save_expense(parsed, user, source="pdf", raw_input="pdf", db=db)
            total += float(expense.amount)
            currency = expense.currency
            if dup:
                dup_count += 1

        return format_pdf_ok(len(transactions), dup_count, total, currency)

    return "❌ Tipo de archivo no soportado. Puedo procesar imágenes, notas de voz y PDFs."


# ---------------------------------------------------------------------------
# POST /api/whatsapp/link-pin — genera PIN para vincular desde la app web
# ---------------------------------------------------------------------------

class LinkPinResponse(BaseModel):
    pin: str
    expires_in_minutes: int = 10


@router.post("/link-pin", response_model=LinkPinResponse)
async def generate_link_pin(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Genera un PIN de 6 dígitos para vincular el número de WhatsApp del usuario."""
    pin = "".join(random.choices(string.digits, k=6))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    # Invalidar tokens anteriores no usados del mismo usuario
    prev = await db.execute(
        select(WhatsAppLinkToken).where(
            WhatsAppLinkToken.user_id == current_user.id,
            WhatsAppLinkToken.used.is_(False),
        )
    )
    for old_token in prev.scalars().all():
        old_token.used = True

    token = WhatsAppLinkToken(user_id=current_user.id, token=pin, expires_at=expires_at)
    db.add(token)
    await db.commit()

    return LinkPinResponse(pin=pin, expires_in_minutes=10)
