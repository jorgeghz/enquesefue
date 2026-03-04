from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class ExpenseParsed(BaseModel):
    """Resultado que devuelve la IA al parsear un mensaje/audio/imagen/pdf."""
    amount: Decimal
    currency: str = "MXN"
    description: str
    category_name: str
    date: datetime | None = None
    merchant: str | None = None
    address: str | None = None


class ExpenseOut(BaseModel):
    id: int
    amount: float
    currency: str
    description: str
    merchant: str | None
    address: str | None
    has_file: bool
    notes: str | None
    category_id: int | None
    category_name: str | None
    category_emoji: str | None
    date: datetime
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_expense(cls, expense) -> "ExpenseOut":
        return cls(
            id=expense.id,
            amount=float(expense.amount),
            currency=expense.currency,
            description=expense.description,
            merchant=expense.merchant,
            address=expense.address,
            has_file=expense.has_file,
            notes=expense.notes,
            category_id=expense.category_id,
            category_name=expense.category.name if expense.category else None,
            category_emoji=expense.category.emoji if expense.category else None,
            date=expense.date,
            source=expense.source,
            created_at=expense.created_at,
        )


class ExpenseListResponse(BaseModel):
    items: list[ExpenseOut]
    total: int
    page: int
    limit: int
    pages: int


class CreateExpenseRequest(BaseModel):
    text: str


class EditExpenseRequest(BaseModel):
    description: str | None = None
    amount: float | None = None
    currency: str | None = None
    category_id: int | None = None
    date: datetime | None = None
    notes: str | None = None


class DuplicateInfo(BaseModel):
    id: int
    amount: float
    currency: str
    description: str
    date: datetime
    source: str


class ExpenseOutWithDuplicate(ExpenseOut):
    possible_duplicate: DuplicateInfo | None = None


class PDFExpenseOut(ExpenseOut):
    is_possible_duplicate: bool = False


class PDFImportResult(BaseModel):
    created: int
    duplicates_count: int
    expenses: list[PDFExpenseOut]
