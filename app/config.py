from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # OpenAI
    openai_api_key: str = ""

    # Base de datos
    # Railway inyecta DATABASE_URL como "postgresql://..." — usar async_database_url en el código
    database_url: str = "postgresql+asyncpg://enquesefue:enquesefue@localhost:5432/enquesefue"

    # Auth JWT
    jwt_secret: str = "dev_jwt_secret_change_in_production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 días

    # Twilio WhatsApp
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = "whatsapp:+14155238886"  # número sandbox por defecto

    # App
    environment: str = "development"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    # Timezone default (IANA name). Overridden per-user in the DB.
    app_timezone: str = "America/Mexico_City"

    # Email (SMTP) — resumen mensual automático
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "enquesefue <noreply@enquesefue.com>"

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    # URL pública del backend (para el redirect_uri que se envía a Google)
    # Dev: http://localhost:8000  |  Railway: https://tu-dominio.com
    app_base_url: str = "http://localhost:8000"
    # URL del frontend (para redirigir después de autenticación exitosa)
    # Dev: http://localhost:5173  |  Railway: https://tu-dominio.com
    frontend_url: str = "http://localhost:5173"

    @property
    def async_database_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and "+asyncpg" not in url:
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


settings = Settings()
