# enquesefue 💸

Gestor de gastos personales con IA. Registra gastos desde una interfaz web usando texto libre, nota de voz, foto de ticket o PDF de estado de cuenta bancario.

## Cómo funciona

```
Navegador (React) → FastAPI → PostgreSQL
                       ↓
               OpenAI (GPT-4o + Whisper)
```

### Formas de registrar un gasto

| Input | Procesamiento |
|-------|--------------|
| ✍️ Texto libre | GPT-4o extrae monto, categoría y descripción |
| 🎤 Nota de voz | MediaRecorder → Whisper transcribe → GPT-4o parsea |
| 📷 Foto de ticket | GPT-4o Vision lee el monto y comercio |
| 📄 PDF de estado de cuenta | pdfplumber extrae texto → GPT-4o identifica todas las transacciones |

### Dashboard

- Total del mes + categoría con más gasto
- Gráfica de dona por categoría (Recharts)
- Últimos gastos registrados

---

## Desarrollo local

### Requisitos

- Python 3.11+
- Node.js 18+
- PostgreSQL corriendo localmente (o usa Supabase / Neon gratis)
- API Key de [OpenAI](https://platform.openai.com/)

### 1. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales
```

### 2. Backend

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
# Disponible en http://localhost:8000
# Docs en http://localhost:8000/docs
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# Disponible en http://localhost:5173
```

El frontend hace proxy automático de `/api` → `http://localhost:8000` (configurado en `vite.config.ts`).

---

## Deploy en Railway

### Requisitos

- Cuenta en [Railway](https://railway.app/)
- API Key de [OpenAI](https://platform.openai.com/)

### 1. Subir código a GitHub

```bash
git add .
git commit -m "Initial commit"
git push
```

### 2. Crear proyecto en Railway

1. Entra a [railway.app](https://railway.app/) → **New Project**
2. Selecciona **Deploy from GitHub repo** → elige este repositorio
3. Railway usa el `Procfile` para construir el frontend y arrancar FastAPI

### 3. Agregar PostgreSQL

En tu proyecto de Railway:
1. Click en **+ New** → **Database** → **Add PostgreSQL**
2. Railway crea la base de datos e inyecta `DATABASE_URL` automáticamente

### 4. Configurar variables de entorno

En Railway → tu servicio → **Variables**, agrega:

| Variable | Valor |
|----------|-------|
| `OPENAI_API_KEY` | Tu API Key de OpenAI |
| `JWT_SECRET` | Texto secreto aleatorio (ver abajo) |

> `DATABASE_URL` la agrega Railway automáticamente al conectar PostgreSQL.

Para generar un `JWT_SECRET` seguro:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 5. Obtener URL pública

Railway → tu servicio → **Settings** → **Networking** → **Generate Domain**.
Obtendrás algo como `https://enquesefue-production.up.railway.app`.

---

## Tests

```bash
pytest
```

---

## Estructura del proyecto

```
enquesefue/
├── app/                        Backend FastAPI
│   ├── main.py                 CORS + routers + sirve frontend en producción
│   ├── config.py               Variables de entorno (pydantic-settings)
│   ├── database.py             SQLAlchemy async + seed de categorías globales
│   ├── dependencies.py         get_current_user (JWT)
│   ├── models/                 User, Expense, Category
│   ├── schemas/                expense.py, user.py, auth.py
│   ├── services/
│   │   ├── auth_service.py     bcrypt + JWT tokens
│   │   ├── ai_service.py       GPT-4o → extrae gasto de texto
│   │   ├── audio_service.py    Whisper → transcripción
│   │   ├── vision_service.py   GPT-4o Vision → analiza ticket
│   │   ├── pdf_service.py      pdfplumber + GPT-4o → extrae transacciones
│   │   └── expense_service.py  CRUD + resúmenes
│   └── routers/
│       ├── auth.py             POST /api/auth/register|login  GET /api/auth/me
│       ├── expenses.py         GET/POST/DELETE /api/expenses
│       ├── upload.py           POST /api/upload/image|audio|pdf
│       ├── categories.py       GET /api/categories
│       └── stats.py            GET /api/stats/monthly|weekly
│
├── frontend/                   React + Vite + TypeScript + Tailwind
│   └── src/
│       ├── pages/              Login, Register, Dashboard, Expenses
│       └── components/         Layout, VoiceRecorder, FileUpload
│
├── Procfile                    Railway: build frontend + start uvicorn
├── requirements.txt
└── .env.example
```

## Variables de entorno

| Variable | Descripción | Requerida en Railway |
|----------|-------------|----------------------|
| `OPENAI_API_KEY` | API Key de OpenAI | ✅ |
| `JWT_SECRET` | Secreto para firmar tokens JWT | ✅ |
| `DATABASE_URL` | URL de PostgreSQL | Automática (plugin Railway) |
| `CORS_ORIGINS` | Orígenes CORS permitidos | No (mismo origen en producción) |
| `ENVIRONMENT` | `development` o `production` | No |
