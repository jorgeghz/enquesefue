from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # Nullable para usuarios que se registraron con Google (no tienen contraseña)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Google OAuth — sub del id_token de Google
    google_id: Mapped[str | None] = mapped_column(String(100), unique=True, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="MXN", nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="America/Mexico_City", server_default="America/Mexico_City", nullable=False)
    whatsapp_phone: Mapped[str | None] = mapped_column(String(20), unique=True, index=True, nullable=True)
    # Resumen mensual por email: True = habilitado (opt-out)
    email_summary: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    expenses: Mapped[list["Expense"]] = relationship(back_populates="user", lazy="select")  # noqa: F821
    categories: Mapped[list["Category"]] = relationship(back_populates="user", lazy="select")  # noqa: F821
