"""
Tareas programadas (APScheduler).
- Gastos recurrentes: diario a las 7:00 AM hora de México.
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


async def _create_recurring_expenses() -> None:
    """Crea los gastos recurrentes cuyo day_of_month coincide con el día de hoy."""
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo

    from sqlalchemy import and_, extract, or_, select

    from app.database import AsyncSessionLocal
    from app.models.expense import Expense
    from app.models.recurring_expense import RecurringExpense
    from app.models.user import User

    now = datetime.now(ZoneInfo("America/Mexico_City"))
    today_day = now.day

    logger.info("Verificando gastos recurrentes para el día %d...", today_day)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(RecurringExpense).where(
                RecurringExpense.active.is_(True),
                RecurringExpense.day_of_month == today_day,
            )
        )
        templates = result.scalars().all()

    created = 0
    for template in templates:
        try:
            async with AsyncSessionLocal() as db:
                # Verificación 1: ya creado desde este mismo template este mes
                dup_template = await db.execute(
                    select(Expense).where(
                        Expense.user_id == template.user_id,
                        Expense.recurring_expense_id == template.id,
                        extract("year", Expense.date) == now.year,
                        extract("month", Expense.date) == now.month,
                    ).limit(1)
                )
                if dup_template.scalar_one_or_none():
                    continue  # ya creado este mes desde el template

                # Verificación 2: ya existe gasto con mismo monto+moneda+descripción/merchant
                # este mes (ej. el usuario lo registró manualmente antes del scheduler)
                content_filters = [Expense.description.ilike(template.description)]
                if template.merchant:
                    content_filters.append(Expense.merchant.ilike(template.merchant))

                dup_content = await db.execute(
                    select(Expense).where(
                        and_(
                            Expense.user_id == template.user_id,
                            Expense.amount == template.amount,
                            Expense.currency == template.currency,
                            extract("year", Expense.date) == now.year,
                            extract("month", Expense.date) == now.month,
                            or_(*content_filters),
                        )
                    ).limit(1)
                )
                if dup_content.scalar_one_or_none():
                    logger.info(
                        "Recurrente '%s' ya existe este mes (registrado manualmente), omitiendo.",
                        template.description,
                    )
                    continue

                expense = Expense(
                    user_id=template.user_id,
                    amount=template.amount,
                    currency=template.currency,
                    description=template.description,
                    merchant=template.merchant,
                    category_id=template.category_id,
                    date=now.astimezone(timezone.utc),
                    source="recurring",
                    raw_input=f"Gasto recurrente automático: {template.description}",
                    recurring_expense_id=template.id,
                )
                db.add(expense)
                await db.commit()
                created += 1
                logger.info(
                    "Gasto recurrente creado: '%s' (user %d)", template.description, template.user_id
                )

                # Enviar push notification si el usuario tiene token registrado
                user_result = await db.execute(
                    select(User).where(User.id == template.user_id).limit(1)
                )
                user_obj = user_result.scalar_one_or_none()
                if user_obj and user_obj.push_token:
                    from app.services.push_service import send_push_notification
                    display_amount = f"${template.amount:,.2f} {template.currency}"
                    await send_push_notification(
                        token=user_obj.push_token,
                        title="Gasto recurrente registrado 🔁",
                        body=f"{template.description} — {display_amount}",
                        data={"type": "recurring", "expense_id": expense.id},
                    )
        except Exception as e:
            logger.error("Error creando gasto recurrente %d: %s", template.id, e)

    logger.info("Gastos recurrentes creados hoy: %d", created)


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
        _create_recurring_expenses,
        CronTrigger(hour=7, minute=0, timezone=_MEXICO),
        id="daily_recurring_expenses",
        replace_existing=True,
    )
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
    logger.info("Scheduler iniciado — Recurrentes 7AM | WhatsApp lunes 9AM | Email día 1 8AM (México)")


def stop_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler detenido")
