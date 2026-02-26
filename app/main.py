from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.routers import auth, categories, expenses, stats, upload, whatsapp


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.openai_api_key or not settings.openai_api_key.startswith("sk-"):
        import logging
        logging.getLogger(__name__).warning(
            "OPENAI_API_KEY is missing or invalid (value: %r). AI features will fail.",
            settings.openai_api_key[:8] + "..." if settings.openai_api_key else "(empty)",
        )
    await init_db()
    yield


app = FastAPI(
    title="enquesefue API",
    description="Gestor de gastos personales con IA",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(expenses.router)
app.include_router(categories.router)
app.include_router(stats.router)
app.include_router(upload.router)
app.include_router(whatsapp.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "enquesefue"}


# Servir el frontend React en producción
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

_assets_dir = FRONTEND_DIST / "assets"
if _assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")


@app.get("/", include_in_schema=False)
async def root():
    index = FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return {"status": "backend ok", "frontend": "not built yet"}


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    index = FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return {"status": "backend ok", "frontend": "not built yet", "path": full_path}
