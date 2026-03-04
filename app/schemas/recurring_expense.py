from datetime import datetime

from pydantic import BaseModel, Field


class RecurringExpenseCreate(BaseModel):
    description: str
    amount: float
    currency: str = "MXN"
    category_id: int | None = None
    merchant: str | None = None
    day_of_month: int = Field(1, ge=1, le=28)


class RecurringExpenseUpdate(BaseModel):
    description: str | None = None
    amount: float | None = None
    currency: str | None = None
    category_id: int | None = None
    merchant: str | None = None
    day_of_month: int | None = Field(None, ge=1, le=28)
    active: bool | None = None


class RecurringExpenseOut(BaseModel):
    id: int
    description: str
    amount: float
    currency: str
    category_id: int | None
    category_name: str | None
    category_emoji: str | None
    merchant: str | None
    day_of_month: int
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, rec) -> "RecurringExpenseOut":
        return cls(
            id=rec.id,
            description=rec.description,
            amount=float(rec.amount),
            currency=rec.currency,
            category_id=rec.category_id,
            category_name=rec.category.name if rec.category else None,
            category_emoji=rec.category.emoji if rec.category else None,
            merchant=rec.merchant,
            day_of_month=rec.day_of_month,
            active=rec.active,
            created_at=rec.created_at,
        )
