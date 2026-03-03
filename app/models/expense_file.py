from sqlalchemy import ForeignKey, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ExpenseFile(Base):
    __tablename__ = "expense_files"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    expense_id: Mapped[int] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
