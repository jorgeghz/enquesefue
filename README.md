# enquesefue 💸

Gestor de gastos personales con IA. Registra gastos desde una interfaz web o directamente por **WhatsApp** usando texto libre, nota de voz, foto de ticket o PDF de estado de cuenta bancario.

## Cómo funciona

```
Navegador (React) ──────────────────────────────┐
WhatsApp User → Twilio → /api/whatsapp/webhook  │
                                                 ▼
                              FastAPI → PostgreSQL
                                 ↓
                       OpenAI (GPT-4o + Whisper)
```

### Formas de registrar un gasto

| Input | Canal | Procesamiento |
|-------|-------|---------------|
| ✍️ Texto libre | Web / WhatsApp | GPT-4o extrae monto, categoría y fecha |
| 🎤 Nota de voz | Web / WhatsApp | Whisper transcribe → GPT-4o parsea (soporta varios gastos en un audio) |
| 📷 Foto de ticket | Web / WhatsApp | GPT-4o Vision lee el monto, comercio y fecha |
| 📄 PDF de estado de cuenta | Web / WhatsApp | pdfplumber extrae texto → GPT-4o identifica todas las transacciones |

### Funcionalidades

- **Dashboard** — total del mes, gráfica de dona por categoría, gráfica de barras por día, filtro por rango de fechas
- **Lista de gastos** — paginación, filtro por categoría y fechas, edición inline, eliminación, exportar CSV
- **Detección de duplicados** — por hash de archivo (mismo archivo subido dos veces) y por huella semántica (mismo monto ±1 día)
- **Categorías personalizadas** — crea, edita y elimina categorías propias además de las globales
- **WhatsApp** — registra gastos, consulta `resumen`, `semana`, `últimos`, `ayuda` desde tu número vinculado
- **Vinculación WhatsApp** — por PIN de 6 dígitos (generado en Configuración) o registro directo desde WhatsApp
- **Resumen semanal automático** — APScheduler envía un resumen por WhatsApp cada lunes a las 9 AM (hora México)
- **Zona horaria configurable** — por usuario desde Configuración (default: `America/Mexico_City`)
- **Rate limiting** — protección contra abuso con slowapi (IP-based, reads `X-Forwarded-For` para Railway)

---

## Desarrollo local

### Requisitos

- Python 3.11+
- Node.js 18+
- PostgreSQL corriendo localmente (o usa Supabase / Neon gratis)
- API Key de [OpenAI](https://platform.openai.com/)
- (Opcional) Cuenta de [Twilio](https://www.twilio.com/) para WhatsApp

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
| `TWILIO_ACCOUNT_SID` | (Opcional) Para WhatsApp vía Twilio |
| `TWILIO_AUTH_TOKEN` | (Opcional) Para WhatsApp vía Twilio |
| `TWILIO_WHATSAPP_FROM` | (Opcional) Número Twilio, ej: `whatsapp:+14155238886` |
| `APP_TIMEZONE` | Zona horaria IANA default, ej: `America/Mexico_City` |

> `DATABASE_URL` la agrega Railway automáticamente al conectar PostgreSQL.

Para generar un `JWT_SECRET` seguro:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 5. Obtener URL pública

Railway → tu servicio → **Settings** → **Networking** → **Generate Domain**.

### 6. Configurar webhook de Twilio (para WhatsApp)

En la consola de Twilio, configura el webhook del sandbox/número a:
```
https://tu-app.up.railway.app/api/whatsapp/webhook
```

---

## Tests

```bash
pytest --ignore=tests/test_formatters.py
```

---

## Estructura del proyecto

```
enquesefue/
├── app/                          Backend FastAPI
│   ├── main.py                   CORS + routers + sirve frontend en producción
│   ├── config.py                 Variables de entorno (pydantic-settings)
│   ├── database.py               SQLAlchemy async + migraciones idempotentes + seed
│   ├── dependencies.py           get_current_user (JWT)
│   ├── limiter.py                Rate limiting con slowapi (IP-aware para Railway)
│   ├── models/
│   │   ├── user.py               User (email, password_hash, currency, timezone, whatsapp_phone)
│   │   ├── expense.py            Expense (amount, currency, description, category, date, source, file_hash)
│   │   ├── category.py           Category (global o por usuario)
│   │   └── whatsapp.py           WhatsAppLinkToken (PIN de vinculación)
│   ├── schemas/                  expense.py, user.py, auth.py
│   ├── services/
│   │   ├── auth_service.py       bcrypt + JWT tokens
│   │   ├── ai_service.py         GPT-4o → extrae uno o varios gastos de texto
│   │   ├── audio_service.py      Whisper → transcripción de audio
│   │   ├── vision_service.py     GPT-4o Vision → analiza ticket/recibo
│   │   ├── pdf_service.py        pdfplumber + GPT-4o → extrae transacciones
│   │   ├── expense_service.py    CRUD + detección duplicados + resúmenes
│   │   ├── whatsapp_service.py   Twilio REST + formateo de respuestas
│   │   └── scheduler_service.py  APScheduler → resumen WhatsApp cada lunes
│   ├── routers/
│   │   ├── auth.py               POST /api/auth/register|login  GET|PATCH /api/auth/me
│   │   ├── expenses.py           GET/POST/PATCH/DELETE /api/expenses  GET /api/expenses/export
│   │   ├── upload.py             POST /api/upload/image|audio|pdf
│   │   ├── categories.py         GET/POST/PATCH/DELETE /api/categories
│   │   ├── stats.py              GET /api/stats/monthly|weekly|range|daily
│   │   └── whatsapp.py           POST /api/whatsapp/webhook  POST /api/whatsapp/link-pin
│   └── utils/
│       └── tz.py                 Helpers de zona horaria (now_local, normalize_expense_date)
│
├── frontend/                     React + Vite + TypeScript + Tailwind CSS + Recharts
│   └── src/
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── Register.tsx
│       │   ├── Dashboard.tsx     KPIs + PieChart + BarChart + filtro de fechas
│       │   ├── Expenses.tsx      Lista + tabs de entrada + duplicados + edición
│       │   └── Settings.tsx      WhatsApp PIN + zona horaria + categorías personalizadas
│       └── components/
│           ├── Layout.tsx        Sidebar + bottom nav (mobile)
│           ├── DateRangePicker.tsx  Dropdown de presets + fechas personalizadas
│           ├── VoiceRecorder.tsx    MediaRecorder API → POST /api/upload/audio
│           ├── FileUpload.tsx       react-dropzone → imagen o PDF
│           ├── DuplicateWarning.tsx Banner de duplicado con opciones
│           └── EditExpenseModal.tsx PATCH /api/expenses/{id}
│
├── tests/                        pytest + mocks de OpenAI
├── ARCHITECTURE.md               Diagramas Mermaid (flujos, ER, secuencias)
├── Procfile                      Railway: build frontend + start uvicorn
├── requirements.txt
└── .env.example
```

## Variables de entorno

| Variable | Descripción | Requerida en Railway |
|----------|-------------|----------------------|
| `OPENAI_API_KEY` | API Key de OpenAI | ✅ |
| `JWT_SECRET` | Secreto para firmar tokens JWT | ✅ |
| `DATABASE_URL` | URL de PostgreSQL | Automática (plugin Railway) |
| `TWILIO_ACCOUNT_SID` | Account SID de Twilio (WhatsApp) | Solo si usas WhatsApp |
| `TWILIO_AUTH_TOKEN` | Auth Token de Twilio (WhatsApp) | Solo si usas WhatsApp |
| `TWILIO_WHATSAPP_FROM` | Número Twilio WhatsApp (`whatsapp:+1...`) | Solo si usas WhatsApp |
| `APP_TIMEZONE` | Zona horaria IANA default (ej: `America/Mexico_City`) | No (default México) |
| `CORS_ORIGINS` | Orígenes CORS permitidos | No (mismo origen en producción) |
| `ENVIRONMENT` | `development` o `production` | No |
