"""
Servicio de envío de emails via SMTP.
Usado para el resumen mensual automático.
"""
import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


def _build_monthly_html(user_name: str, month_label: str, summary: dict) -> str:
    """Genera el HTML del email de resumen mensual."""
    total = summary.get("total", 0)
    count = summary.get("count", 0)
    by_category = summary.get("by_category", [])

    rows = ""
    for cat in by_category[:8]:
        pct = (cat["total"] / total * 100) if total else 0
        rows += f"""
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
            {cat['emoji']} {cat['name']}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;">
            ${cat['total']:,.2f}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right;color:#9ca3af;">
            {pct:.0f}%
          </td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
    <!-- Header -->
    <div style="background:#6366f1;padding:28px 32px;">
      <h1 style="margin:0;color:white;font-size:22px;font-weight:700;">💸 enquesefue</h1>
      <p style="margin:4px 0 0;color:#c7d2fe;font-size:14px;">Resumen de {month_label}</p>
    </div>
    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="margin:0 0 20px;color:#374151;font-size:15px;">
        Hola <strong>{user_name}</strong>, aquí está tu resumen de gastos de <strong>{month_label}</strong>:
      </p>
      <!-- KPIs -->
      <div style="display:flex;gap:16px;margin-bottom:24px;">
        <div style="flex:1;background:#f5f3ff;border-radius:12px;padding:16px;">
          <p style="margin:0;color:#7c3aed;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Total gastado</p>
          <p style="margin:6px 0 0;color:#4f46e5;font-size:26px;font-weight:700;">${total:,.2f}</p>
          <p style="margin:4px 0 0;color:#8b5cf6;font-size:12px;">MXN</p>
        </div>
        <div style="flex:1;background:#f0fdf4;border-radius:12px;padding:16px;">
          <p style="margin:0;color:#15803d;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Transacciones</p>
          <p style="margin:6px 0 0;color:#16a34a;font-size:26px;font-weight:700;">{count}</p>
          <p style="margin:4px 0 0;color:#4ade80;font-size:12px;">gastos registrados</p>
        </div>
      </div>
      <!-- Categorías -->
      {'<h3 style="margin:0 0 12px;color:#111827;font-size:15px;">Por categoría</h3><table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">' + rows + '</table>' if rows else '<p style="color:#9ca3af;font-size:14px;">No hubo gastos este mes.</p>'}
    </div>
    <!-- Footer -->
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        Puedes desactivar este correo en <a href="https://enquesefue.com/configuracion" style="color:#6366f1;">Configuración</a>.
      </p>
    </div>
  </div>
</body>
</html>"""


def _send_email_sync(to: str, subject: str, html: str) -> None:
    """Envío síncrono via SMTP (ejecutado en thread pool)."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        smtp.ehlo()
        smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.sendmail(settings.smtp_from, [to], msg.as_string())


async def send_monthly_summary_email(user_name: str, user_email: str, month_label: str, summary: dict) -> bool:
    """Envía el email de resumen mensual. Retorna True si se envió correctamente."""
    if not settings.smtp_host:
        logger.warning("SMTP no configurado — email de resumen no enviado a %s", user_email)
        return False
    try:
        html = _build_monthly_html(user_name, month_label, summary)
        subject = f"💸 Tu resumen de {month_label} — enquesefue"
        await asyncio.to_thread(_send_email_sync, user_email, subject, html)
        logger.info("Resumen mensual enviado a %s", user_email)
        return True
    except Exception as e:
        logger.error("Error enviando email de resumen a %s: %s", user_email, e)
        return False
