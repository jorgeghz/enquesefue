from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.limiter import limiter
from app.models.user import User
from app.schemas.auth import LoginRequest, Token
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.auth_service import (
    authenticate_user,
    create_access_token,
    get_or_create_google_user,
    register_user,
)
from app.utils.tz import is_valid_timezone

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def register(request: Request, data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El email ya está registrado")
    user = await register_user(data, db)
    return user


@router.post("/login", response_model=Token)
@limiter.limit("1/minute")
async def login(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(data.email, data.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
        )
    token = create_access_token(user.id)
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/google")
async def google_login():
    """Devuelve la URL de autenticación de Google para redirigir al usuario."""
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google OAuth no está configurado")
    params = urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": f"{settings.app_base_url}/api/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
    })
    return {"url": f"https://accounts.google.com/o/oauth2/v2/auth?{params}"}


@router.get("/google/callback")
async def google_callback(
    code: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Recibe el código de Google, obtiene info del usuario y redirige al frontend con el JWT."""
    if error or not code:
        return RedirectResponse(f"{settings.frontend_url}/login?error=google_cancelled")

    async with httpx.AsyncClient(timeout=10) as client:
        # Intercambiar código por access_token
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": f"{settings.app_base_url}/api/auth/google/callback",
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code != 200:
            return RedirectResponse(f"{settings.frontend_url}/login?error=google_failed")

        access_token = token_res.json().get("access_token")
        if not access_token:
            return RedirectResponse(f"{settings.frontend_url}/login?error=google_failed")

        # Obtener información del usuario
        user_res = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_res.status_code != 200:
            return RedirectResponse(f"{settings.frontend_url}/login?error=google_failed")

        google_data = user_res.json()

    google_id = google_data.get("sub")
    email = google_data.get("email", "")
    name = google_data.get("name") or email.split("@")[0]

    if not google_id or not email:
        return RedirectResponse(f"{settings.frontend_url}/login?error=google_failed")

    user = await get_or_create_google_user(google_id, email, name, db)
    token = create_access_token(user.id)
    return RedirectResponse(f"{settings.frontend_url}/auth/callback?token={token}")


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.timezone is not None:
        if not is_valid_timezone(body.timezone):
            raise HTTPException(status_code=400, detail="Zona horaria inválida")
        current_user.timezone = body.timezone
    if body.email_summary is not None:
        current_user.email_summary = body.email_summary
    await db.commit()
    await db.refresh(current_user)
    return current_user
