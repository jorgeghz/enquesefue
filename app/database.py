import ssl

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

_db_url = settings.async_database_url
_is_local = "localhost" in _db_url or "127.0.0.1" in _db_url

if _is_local:
    _connect_args: dict = {}
else:
    # Railway PostgreSQL requiere SSL — asyncpg necesita un SSLContext real, no un string
    _ssl_ctx = ssl.create_default_context()
    _connect_args = {"ssl": _ssl_ctx}

engine = create_async_engine(_db_url, echo=False, connect_args=_connect_args)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    """Crear tablas y hacer seed de categorías globales."""
    from app.models import category, expense, user  # noqa: F401 — registra los modelos

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await _seed_global_categories()


async def _seed_global_categories() -> None:
    from sqlalchemy import select

    from app.models.category import Category

    default_categories = [
        ("Alimentación", "🍔"),
        ("Transporte", "🚗"),
        ("Hogar", "🏠"),
        ("Entretenimiento", "🎬"),
        ("Ropa", "👕"),
        ("Salud", "💊"),
        ("Tecnología", "📱"),
        ("Educación", "📚"),
        ("Trabajo", "💼"),
        ("Servicios", "🔧"),
        ("Regalos", "🎁"),
        ("Otros", "💰"),
    ]

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Category).where(Category.user_id.is_(None)))
        existing = result.scalars().all()
        existing_names = {c.name for c in existing}

        for name, emoji in default_categories:
            if name not in existing_names:
                session.add(Category(name=name, emoji=emoji, user_id=None))

        await session.commit()
