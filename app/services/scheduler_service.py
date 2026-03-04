"""
Tareas programadas (APScheduler).
- Resumen semanal de WhatsApp: cada lunes a las 9:00 AM hora de México.
- Resumen mensual por email: el día 1 de cada mes a las 8:00 AM hora de México.
"""
import logging
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
_scheduler = AsyncIOScheduler()
_MEXICO = ZoneInfo("America/Mexico_City")


async def _send_weekly_summaries() -> None:
    """Envía resumen de los últimos 7 días a todos los usuarios con WhatsApp vinculado."""
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.user import User
    from app.services.expense_service import get_weekly_summary
    from app.services.whatsapp_service import format_weekly_summary, send_message

    logger.info("Iniciando envío de resúmenes semanales de WhatsApp...")
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.whatsapp_phone.isnot(None)))
        users = result.scalars().all()

    logger.info("Usuarios con WhatsApp vinculado: %d", len(users))
    for user in users:
        try:
            async with AsyncSessionLocal() as db:
                data = await get_weekly_summary(user.id, db)
            if data["total"] == 0:
                continue  # No enviar si no hubo gastos en la semana
            body = format_weekly_summary(data)
            await send_message(f"whatsapp:{user.whatsapp_phone}", body)
            logger.info("Resumen enviado a %s (user %d)", user.whatsapp_phone, user.id)
        except Exception as e:
            logger.error("Error enviando resumen a user %d: %s", user.id, e)


async def _send_monthly_email_summaries() -> None:
    """El 1° de cada mes envía el resumen del mes anterior por email a los usuarios que lo tienen activado."""
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.user import User
    from app.services.email_service import send_monthly_summary_email
    from app.services.expense_service import get_range_summary

    now = datetime.now(ZoneInfo("America/Mexico_City"))
    # Mes anterior: desde el día 1 hasta el último segundo del mes pasado
    first_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_prev_month = first_this_month - timedelta(seconds=1)
    first_prev_month = last_prev_month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_label = first_prev_month.strftime("%B %Y")

    logger.info("Enviando resúmenes mensuales por email (período: %s)...", month_label)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email_summary.is_(True)))
        users = result.scalars().all()

    logger.info("Usuarios con resumen por email activado: %d", len(users))
    for user in users:
        try:
            async with AsyncSessionLocal() as db:
                summary = await get_range_summary(user.id, first_prev_month, last_prev_month, db)
            if summary["total"] == 0:
                continue  # No enviar si no hubo gastos
            await send_monthly_summary_email(user.name, user.email, month_label, summary)
        except Exception as e:
            logger.error("Error enviando resumen mensual a user %d: %s", user.id, e)


def start_scheduler() -> None:
    _scheduler.add_job(
        _send_weekly_summaries,
        CronTrigger(day_of_week="mon", hour=9, minute=0, timezone=_MEXICO),
        id="weekly_whatsapp_summary",
        replace_existing=True,
    )
    _scheduler.add_job(
        _send_monthly_email_summaries,
        CronTrigger(day=1, hour=8, minute=0, timezone=_MEXICO),
        id="monthly_email_summary",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Scheduler iniciado — WhatsApp lunes 9AM | Email día 1 de mes 8AM (México)")


def stop_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler detenido")
