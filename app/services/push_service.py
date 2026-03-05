"""
Expo Push Notification Service.
No se necesitan credenciales FCM/APNs — Expo maneja la capa de credenciales.
Docs: https://docs.expo.dev/push-notifications/sending-notifications/
"""
import logging

import httpx

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push_notification(
    token: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> None:
    """Envía una push notification vía Expo Push Service."""
    if not token or not token.startswith("ExponentPushToken["):
        logger.warning("Token de push inválido, omitiendo notificación: %r", token)
        return

    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "data": data or {},
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(EXPO_PUSH_URL, json=payload)
            result = response.json()
            # Check for errors in the Expo response
            if isinstance(result, dict) and result.get("data"):
                item = result["data"][0] if isinstance(result["data"], list) else result["data"]
                if item.get("status") == "error":
                    logger.error(
                        "Expo push error para token %r: %s — %s",
                        token, item.get("message"), item.get("details"),
                    )
            elif not response.is_success:
                logger.error("Expo push HTTP error %d: %s", response.status_code, response.text)
    except Exception as e:
        logger.error("Error enviando push notification: %s", e)
