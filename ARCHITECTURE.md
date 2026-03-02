# ¿En qué se me fue? — Architecture

---

## 1. System Overview

```mermaid
graph TB
    subgraph Users
        Browser["🌐 Web Browser"]
        WA["📱 WhatsApp User"]
    end

    subgraph "Twilio Cloud"
        TW["Twilio WhatsApp\nProxy / Gateway"]
    end

    subgraph "Railway — Single Service"
        LB["Railway Proxy\nHTTPS termination"]

        subgraph "enquesefue"
            UV["Uvicorn\nasync ASGI server"]
            MW["Middlewares\nCORS · Rate Limiter (slowapi)"]
            RT["Routers\nauth · expenses · upload\ncategories · stats · whatsapp"]
            STATIC["Static Files\n/assets → frontend/dist/assets\n* → index.html (SPA fallback)"]
            SC["APScheduler\nMonday 9 AM MX\nWeekly WhatsApp summaries"]
        end

        DB[("PostgreSQL\nRailway plugin\nDATABASE_URL auto-injected")]
    end

    subgraph "OpenAI Cloud"
        GPT["GPT-4o\nText parsing · Vision"]
        WSP["Whisper\nAudio transcription"]
    end

    Browser -- HTTPS --> LB
    WA -- message/media --> TW
    TW -- "POST /api/whatsapp/webhook" --> LB
    LB --> UV --> MW --> RT
    RT -- "asyncpg SQL" --> DB
    RT -- "API calls" --> GPT & WSP
    RT -- "REST (send message)" --> TW
    SC -- "REST" --> TW
    SC -- SQL --> DB
```

---

## 2. Backend Layer Structure

```mermaid
graph LR
    subgraph "HTTP Layer — Routers"
        R1["auth.py\n/api/auth"]
        R2["expenses.py\n/api/expenses"]
        R3["upload.py\n/api/upload"]
        R4["categories.py\n/api/categories"]
        R5["stats.py\n/api/stats"]
        R6["whatsapp.py\n/api/whatsapp"]
    end

    subgraph "Business Logic — Services"
        S1["auth_service\nbcrypt · JWT"]
        S2["ai_service\nGPT-4o text parsing"]
        S3["vision_service\nGPT-4o vision"]
        S4["audio_service\nWhisper"]
        S5["pdf_service\npdfplumber + GPT-4o"]
        S6["expense_service\nCRUD · duplicates · summaries"]
        S7["whatsapp_service\nTwilio REST · formatters"]
        S8["scheduler_service\nAPScheduler weekly job"]
    end

    subgraph "Data Layer — Models"
        M1["User\nemail · password_hash\ncurrency · whatsapp_phone"]
        M2["Expense\namount · currency · description\ncategory_id · date · source\nfile_hash · raw_input"]
        M3["Category\nname · emoji · user_id\n(null = global)"]
        M4["WhatsAppLinkToken\ntoken · expires_at · used"]
    end

    R1 --> S1
    R2 --> S2 & S6
    R3 --> S2 & S3 & S4 & S5 & S6
    R4 --> S6
    R5 --> S6
    R6 --> S2 & S3 & S4 & S5 & S6 & S7 & S1
    S8 --> S6 & S7

    S1 & S6 --> M1
    S6 --> M2 & M3
    R6 --> M4
```

---

## 3. Data Model (ER Diagram)

```mermaid
erDiagram
    User {
        int     id           PK
        string  email        UK
        string  password_hash
        string  name
        string  currency     "default MXN"
        string  whatsapp_phone UK "nullable"
        datetime created_at
    }

    Expense {
        int     id           PK
        int     user_id      FK
        decimal amount       "10,2"
        string  currency
        string  description
        int     category_id  FK "nullable"
        datetime date
        string  source       "text|audio|image|pdf"
        string  raw_input    "nullable"
        string  file_hash    "SHA-256, nullable"
        datetime created_at
    }

    Category {
        int     id      PK
        string  name
        string  emoji
        int     user_id FK "null = global category"
        datetime created_at
    }

    WhatsAppLinkToken {
        int     id         PK
        int     user_id    FK
        string  token      "6-digit PIN"
        datetime expires_at
        bool    used       "default false"
        datetime created_at
    }

    User      ||--o{ Expense           : "owns"
    User      ||--o{ Category          : "creates (custom)"
    User      ||--o{ WhatsAppLinkToken : "generates"
    Category  ||--o{ Expense           : "classifies"
```

---

## 4. Authentication Flow

```mermaid
sequenceDiagram
    actor U as User
    participant F as React Frontend
    participant A as /api/auth
    participant DB as PostgreSQL

    U->>F: email + password
    F->>A: POST /api/auth/login
    A->>DB: SELECT User WHERE email = ?
    DB-->>A: User row

    alt Credentials valid
        A->>A: bcrypt.verify(password, hash)
        A->>A: create_access_token(user_id)\nHS256 · 7-day expiry
        A-->>F: { access_token: "eyJ..." }
        F->>F: localStorage.setItem('token')
        F-->>U: Redirect → Dashboard
    else Invalid
        A-->>F: 401 Unauthorized
        F-->>U: Error message
    end

    Note over F,A: Every subsequent request
    F->>A: Any /api/* request\nAuthorization: Bearer {token}
    A->>A: decode_token() → user_id
    A->>DB: SELECT User WHERE id = ?
    DB-->>A: User
    A-->>F: Response data

    Note over F: On 401 response
    F->>F: removeItem('token')
    F-->>U: Redirect → /login
```

---

## 5. Expense Ingestion Flow

```mermaid
flowchart TD
    Start([User logs an expense]) --> Channel{Input channel}

    Channel -- "type text" --> TXT["POST /api/expenses\n{text: '...'}"]
    Channel -- "voice note" --> AUD["POST /api/upload/audio\naudio/webm blob"]
    Channel -- "photo / ticket" --> IMG["POST /api/upload/image\nJPEG · PNG"]
    Channel -- "bank PDF" --> PDF["POST /api/upload/pdf\napplication/pdf"]

    TXT --> AI1["GPT-4o\nparse_expense_from_text()"]
    AUD --> W["Whisper\ntranscribe_audio_bytes()"] --> AI1
    IMG --> H["compute_file_hash\nSHA-256"] --> AI2["GPT-4o Vision\nanalyze_receipt_bytes()"]
    PDF --> PL["pdfplumber\nextract_text()"] --> AI3["GPT-4o\nparse_bank_statement()\nreturns N transactions"]

    AI1 --> P1["ExpenseParsed\namount · currency · description\ncategory · date"]
    AI2 --> P1
    AI3 --> P2["ExpenseParsed[]\none per transaction"]

    P1 --> DUP
    P2 -- "for each" --> DUP

    subgraph DUP["save_expense() — Duplicate Guard"]
        DA{file_hash\nalready saved?} -- yes --> FOUND[Duplicate found]
        DA -- no --> DB2{"same amount + currency\nwithin ±1 day?"}
        DB2 -- yes --> FOUND
        DB2 -- no --> CLEAN[No duplicate]
    end

    DUP --> CAT["get_or_create_category()\nglobal or user-specific"]
    CAT --> SAVE["INSERT Expense\n(amount, currency, description\ncategory_id, date, source\nraw_input, file_hash)"]
    SAVE --> PG[(PostgreSQL)]

    PG --> RESP["ExpenseOutWithDuplicate\n+ possible_duplicate field"]
    RESP --> UI["UI shows expense\n+ DuplicateWarning banner\n  if duplicate found"]
```

---

## 6. WhatsApp Message Flow

```mermaid
sequenceDiagram
    actor U as WhatsApp User
    participant T as Twilio
    participant W as /api/whatsapp/webhook
    participant DB as PostgreSQL
    participant AI as OpenAI

    U->>T: Message (text / audio / image / PDF)
    T->>W: POST /api/whatsapp/webhook\nFrom, Body, NumMedia, MediaUrl0...

    W->>W: Validate X-Twilio-Signature\n(HMAC-SHA1, production only)
    W->>DB: SELECT User WHERE whatsapp_phone = From

    alt User NOT linked
        DB-->>W: null

        alt Body == 6-digit PIN
            W->>DB: SELECT WhatsAppLinkToken\nWHERE token=PIN, used=false, not expired
            DB-->>W: Token + User
            W->>DB: user.whatsapp_phone = From\ntoken.used = true
            W->>T: send "✅ Número vinculado a {name}"
        else Body starts with "registro"
            note over W: Parse: registro email pass name
            W->>DB: INSERT User (whatsapp_phone pre-set)
            W->>T: send "✅ Cuenta creada y vinculada"
        else Other message
            W->>T: send format_not_linked() instructions
        end

    else User linked
        DB-->>W: User

        alt Command ("resumen" / "semana" / "últimos" / "ayuda")
            W->>DB: Query summaries / last expenses
            DB-->>W: Data
            W->>T: send formatted summary

        else Media (NumMedia > 0)
            W->>T: download_media() with Basic Auth
            T-->>W: File bytes
            alt image/*
                W->>AI: analyze_receipt_bytes() GPT-4o Vision
            else audio/*
                W->>AI: transcribe_audio_bytes() Whisper
                AI-->>W: transcription text
                W->>AI: parse_expense_from_text() GPT-4o
            else application/pdf
                W->>AI: parse_bank_statement() GPT-4o
            end
            AI-->>W: ExpenseParsed
            W->>DB: INSERT Expense(s)
            W->>T: send format_expense_ok() / format_pdf_ok()

        else Free text
            W->>AI: parse_expense_from_text() GPT-4o
            AI-->>W: ExpenseParsed
            W->>DB: INSERT Expense
            W->>T: send format_expense_ok()
        end
    end

    T->>U: Reply via WhatsApp
```

---

## 7. WhatsApp Account Linking (PIN Flow)

```mermaid
sequenceDiagram
    actor U as User (web)
    actor WU as Same User (WhatsApp)
    participant F as Settings Page
    participant API as /api/whatsapp/link-pin
    participant WH as /api/whatsapp/webhook
    participant DB as PostgreSQL

    U->>F: Click "Generar PIN"
    F->>API: POST /api/whatsapp/link-pin\nAuthorization: Bearer {jwt}
    API->>DB: Invalidate previous unused tokens
    API->>DB: INSERT WhatsAppLinkToken\n(pin=6 digits, expires_at=now+10min)
    DB-->>API: ok
    API-->>F: { pin: "483921", expires_in_minutes: 10 }
    F-->>U: Show PIN with 10-min countdown

    U->>WU: Share PIN out-of-band
    WU->>WH: Send "483921" to bot
    WH->>DB: SELECT WhatsAppLinkToken\nWHERE token="483921", used=false\nAND expires_at > now
    DB-->>WH: Token + User
    WH->>DB: UPDATE user.whatsapp_phone = From\nUPDATE token.used = true
    WH-->>WU: "✅ Número vinculado a tu cuenta de {name}"
```

---

## 8. Frontend Structure

```mermaid
graph TD
    App["App.tsx\nBrowserRouter"]

    App --> PUB["Public Routes"]
    App --> PRIV["PrivateRoute\n(JWT in localStorage required)"]

    PUB --> LOGIN["/login\nLogin.tsx\nPOST /api/auth/login"]
    PUB --> REG["/register\nRegister.tsx\nPOST /api/auth/register"]

    PRIV --> LAY["Layout.tsx\nSidebar + Bottom nav\n(mobile responsive)"]

    LAY --> DASH["/ Dashboard.tsx"]
    LAY --> EXP["/gastos Expenses.tsx"]
    LAY --> SET["/configuracion Settings.tsx"]

    DASH --> DRP1["DateRangePicker.tsx\nPresets: this_week · last_week\nlast_15 · this_month · last_month · custom"]
    DASH --> CHARTS["Recharts\nPieChart (by category)\nBarChart (daily trend)"]

    EXP --> TABS["Input Tabs"]
    TABS --> TXT2["Text form\nPOST /api/expenses"]
    TABS --> VR["VoiceRecorder.tsx\nMediaRecorder API\nPOST /api/upload/audio"]
    TABS --> FU["FileUpload.tsx\nreact-dropzone\nimage → /api/upload/image\npdf → /api/upload/pdf"]

    EXP --> DRP2["DateRangePicker.tsx"]
    EXP --> DW["DuplicateWarning.tsx\nDelete new · Keep both"]
    EXP --> EEM["EditExpenseModal.tsx\nPATCH /api/expenses/{id}"]

    SET --> WA2["WhatsApp card\nGenerate PIN · Show linked number"]
    SET --> CATS["Custom Categories\nCRUD via /api/categories"]

    LAY --> AUTH["useAuth hook\nlogin · logout · user state"]
    AUTH --> CLI["api/client.ts\naxios instance\nJWT interceptor\n401 → /login"]
```

---

## 9. API Rate Limits

| Endpoint | Limit | Reason |
|---|---|---|
| `POST /api/auth/register` | 30/min | Account creation |
| `POST /api/auth/login` | 1/min | Brute-force protection |
| `POST /api/expenses` | 1/min | GPT-4o text call |
| `POST /api/upload/image` | 1/min | GPT-4o Vision call |
| `POST /api/upload/audio` | 1/min | Whisper + GPT-4o |
| `POST /api/upload/pdf` | 1/min | pdfplumber + GPT-4o |
| `POST /api/whatsapp/webhook` | 1/min | Twilio calls |
| `POST /api/whatsapp/link-pin` | 1/min | PIN generation |
| All `GET` endpoints | unlimited | Cheap DB reads, JWT-protected |

Rate limits are IP-based (reads `X-Forwarded-For` for correct IP behind Railway's proxy).

---

## 10. Expense Source Types

| Source | Input | AI Model | Route |
|---|---|---|---|
| `text` | Free text ("gasté 150 en el súper") | GPT-4o | `POST /api/expenses` |
| `audio` | Voice note (webm/ogg/mp3) | Whisper → GPT-4o | `POST /api/upload/audio` |
| `image` | Ticket photo (JPEG/PNG) | GPT-4o Vision | `POST /api/upload/image` |
| `pdf` | Bank statement PDF | pdfplumber → GPT-4o | `POST /api/upload/pdf` |
| `text` | WhatsApp text message | GPT-4o | `POST /api/whatsapp/webhook` |
| `audio` | WhatsApp voice note (ogg) | Whisper → GPT-4o | `POST /api/whatsapp/webhook` |
| `image` | WhatsApp photo | GPT-4o Vision | `POST /api/whatsapp/webhook` |
| `pdf` | WhatsApp PDF | pdfplumber → GPT-4o | `POST /api/whatsapp/webhook` |
