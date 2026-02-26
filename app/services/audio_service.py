"""
Servicio para procesar audio.
Recibe bytes directamente (desde upload web) y transcribe con Whisper.
"""
import io
import logging

from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)
client = AsyncOpenAI(api_key=settings.openai_api_key)


async def transcribe_audio_bytes(audio_bytes: bytes, mime_type: str = "audio/webm") -> str | None:
    """
    Transcribe audio a texto usando Whisper.
    Recibe los bytes directamente del archivo subido por el usuario.
    """
    try:
        extension = _mime_to_extension(mime_type)
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = f"audio.{extension}"

        response = await client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language="es",
        )
        transcription = response.text.strip()
        logger.info("Audio transcrito (%d chars): %s", len(transcription), transcription[:100])
        return transcription

    except Exception as e:
        logger.exception("Error transcribiendo audio: %s", e)
        return None


def _mime_to_extension(mime_type: str) -> str:
    mapping = {
        "audio/webm": "webm",
        "audio/ogg": "ogg",
        "audio/ogg; codecs=opus": "ogg",
        "audio/mpeg": "mp3",
        "audio/mp4": "m4a",
        "audio/wav": "wav",
    }
    return mapping.get(mime_type, "webm")
