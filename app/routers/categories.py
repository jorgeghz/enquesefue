from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.category import Category
from app.models.expense import Expense
from app.models.user import User
from app.services.expense_service import get_all_categories

router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryOut(BaseModel):
    id: int
    name: str
    emoji: str
    user_id: int | None = None

    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    name: str
    emoji: str = "💰"


class CategoryUpdate(BaseModel):
    name: str | None = None
    emoji: str | None = None


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    categories = await get_all_categories(current_user.id, db)
    return [CategoryOut.model_validate(c) for c in categories]


@router.post("", response_model=CategoryOut, status_code=201)
async def create_category(
    body: CategoryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check for name collision with existing categories (global or user's own)
    result = await db.execute(
        select(Category).where(
            Category.name == body.name,
            (Category.user_id.is_(None)) | (Category.user_id == current_user.id),
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ya existe una categoría con ese nombre")

    category = Category(name=body.name, emoji=body.emoji, user_id=current_user.id)
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return CategoryOut.model_validate(category)


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int,
    body: CategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == current_user.id)
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada o no tienes permiso para editarla")

    if body.name is not None:
        category.name = body.name
    if body.emoji is not None:
        category.emoji = body.emoji
    await db.commit()
    await db.refresh(category)
    return CategoryOut.model_validate(category)


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == current_user.id)
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada o no tienes permiso para eliminarla")

    # Set category_id = NULL on expenses that use this category before deleting
    await db.execute(
        update(Expense)
        .where(Expense.user_id == current_user.id, Expense.category_id == category_id)
        .values(category_id=None)
    )
    await db.delete(category)
    await db.commit()
