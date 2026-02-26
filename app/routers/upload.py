from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.expense import Expense as ExpenseModel
from app.models.user import User
from app.schemas.expense import (
    ExpenseOut,
    ExpenseOutWithDuplicate,
    PDFExpenseOut,
    PDFImportResult,
)
from app.services.ai_service import parse_expense_from_text
from app.services.audio_service import transcribe_audio_bytes
from app.services.expense_service import compute_file_hash, make_duplicate_info, save_expense
from app.services.pdf_service import parse_bank_statement
from app.services.vision_service import analyze_receipt_bytes

router = APIRouter(prefix="/api/upload", tags=["upload"])

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


async def _reload_with_category(expense_id: int, db: AsyncSession) -> ExpenseModel:
    result = await db.execute(
        select(ExpenseModel).where(ExpenseModel.id == expense_id).options(selectinload(ExpenseModel.category))
    )
    return result.scalar_one()


@router.post("/image", response_model=ExpenseOutWithDuplicate, status_code=201)
async def upload_image(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen (JPEG, PNG, etc.)")

    image_bytes = await file.read()
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Imagen demasiado grande (máximo 20 MB)")

    parsed = await analyze_receipt_bytes(image_bytes, mime_type=file.content_type)
    if not parsed:
        raise HTTPException(
            status_code=422,
            detail="No pude leer el ticket. Asegúrate de que la imagen sea clara y muestre el monto total.",
        )

    file_hash = compute_file_hash(image_bytes)
    expense, dup = await save_expense(
        parsed, current_user, source="image", raw_input=file.filename or "imagen", db=db, file_hash=file_hash
    )
    expense = await _reload_with_category(expense.id, db)
    return ExpenseOutWithDuplicate(
        **ExpenseOut.from_expense(expense).model_dump(),
        possible_duplicate=make_duplicate_info(dup),
    )


@router.post("/audio", response_model=ExpenseOutWithDuplicate, status_code=201)
async def upload_audio(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    audio_bytes = await file.read()
    if len(audio_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Audio demasiado grande (máximo 20 MB)")

    transcription = await transcribe_audio_bytes(audio_bytes, mime_type=file.content_type or "audio/webm")
    if not transcription:
        raise HTTPException(status_code=422, detail="No pude transcribir el audio. Intenta de nuevo.")

    parsed = await parse_expense_from_text(transcription)
    if not parsed:
        raise HTTPException(
            status_code=422,
            detail=f"Transcribí: '{transcription}' pero no encontré un gasto. Menciona el monto claramente.",
        )

    expense, dup = await save_expense(
        parsed, current_user, source="audio", raw_input=transcription, db=db
    )
    expense = await _reload_with_category(expense.id, db)
    return ExpenseOutWithDuplicate(
        **ExpenseOut.from_expense(expense).model_dump(),
        possible_duplicate=make_duplicate_info(dup),
    )


@router.post("/pdf", response_model=PDFImportResult)
async def upload_pdf(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF demasiado grande (máximo 20 MB)")

    transactions = await parse_bank_statement(pdf_bytes)
    if not transactions:
        raise HTTPException(
            status_code=422,
            detail="No pude identificar transacciones en el PDF. ¿Es un estado de cuenta bancario?",
        )

    saved: list[PDFExpenseOut] = []
    dup_count = 0
    for parsed in transactions:
        expense, dup = await save_expense(
            parsed, current_user, source="pdf", raw_input=file.filename or "pdf", db=db
        )
        expense = await _reload_with_category(expense.id, db)
        is_dup = dup is not None
        if is_dup:
            dup_count += 1
        saved.append(PDFExpenseOut(
            **ExpenseOut.from_expense(expense).model_dump(),
            is_possible_duplicate=is_dup,
        ))

    return PDFImportResult(created=len(saved), duplicates_count=dup_count, expenses=saved)
