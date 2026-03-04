from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="MXN", nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Fuente del gasto: "text", "audio", "image"
    source: Mapped[str] = mapped_column(String(10), default="text", nullable=False)
    # Texto original recibido (transcripción de audio, texto parseado del ticket, etc.)
    raw_input: Mapped[str | None] = mapped_column(Text, nullable=True)
    # SHA-256 del archivo subido (imagen o PDF); None para fuentes texto/audio
    file_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Nombre del comercio extraído por IA (opcional)
    merchant: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Dirección del establecimiento extraída por IA (opcional)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # True si hay un archivo adjunto en expense_files
    has_file: Mapped[bool] = mapped_column(default=False, server_default="false", nullable=False)
    # Nota libre escrita por el usuario (opcional)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ID del template recurrente que generó este gasto (None si fue creado manualmente)
    recurring_expense_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="expenses")  # noqa: F821
    category: Mapped["Category | None"] = relationship(back_populates="expenses")  # noqa: F821
