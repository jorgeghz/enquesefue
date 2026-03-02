"""
Tareas programadas (APScheduler).
- Resumen semanal de WhatsApp: cada lunes a las 9:00 AM hora de México.
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


def start_scheduler() -> None:
    _scheduler.add_job(
        _send_weekly_summaries,
        CronTrigger(day_of_week="mon", hour=9, minute=0, timezone=_MEXICO),
        id="weekly_whatsapp_summary",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Scheduler iniciado — resúmenes semanales cada lunes 9:00 AM (México)")


def stop_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler detenido")
