from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.schemas.user import UserCreate


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None


async def register_user(data: UserCreate, db: AsyncSession) -> User:
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        name=data.name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(email: str, password: str, db: AsyncSession) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    # Usuarios de Google no tienen password_hash — no pueden iniciar sesión con contraseña
    if not user or not user.password_hash:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


async def get_or_create_google_user(
    google_id: str, email: str, name: str, db: AsyncSession
) -> User:
    """Busca un usuario por google_id; si no existe, lo busca por email (vincula) o lo crea."""
    # 1. Buscar por google_id
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()
    if user:
        return user

    # 2. Buscar por email — vincular cuenta existente
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user:
        user.google_id = google_id
        await db.commit()
        await db.refresh(user)
        return user

    # 3. Crear nuevo usuario
    user = User(email=email, password_hash=None, name=name, google_id=google_id)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_user_by_id(user_id: int, db: AsyncSession) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
