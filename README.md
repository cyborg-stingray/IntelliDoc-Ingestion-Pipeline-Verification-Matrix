# IntelliDoc Ingestion Pipeline & Verification Matrix

A human-in-the-loop document ingestion prototype. Submit clinical or operational text through a Next.js UI, parse it with a local **Ollama** model (`llama3`), and persist results to **PostgreSQL** via **Prisma** in a single ACID transaction.

## Features

- Web UI for submitting document text and document type
- Local AI classification (auto-approve vs. flag for review, priority, confidence score)
- Transactional writes across four related tables
- Structured API errors with `stage` and `details` for easier debugging
- Tailwind CSS dark UI

## Architecture

```mermaid
flowchart LR
  UI[Next.js UI] --> API["/api/process-document"]
  API --> Ollama[Ollama llama3]
  Ollama --> API
  API --> Prisma[Prisma Client]
  Prisma --> PG[(PostgreSQL intellidoc)]
```

**Ingestion flow**

1. User submits `documentText` and optional `documentType` from the home page.
2. API sends a constrained prompt to Ollama at `http://localhost:11434`.
3. Model response is parsed and validated (status, priority, confidence).
4. Prisma writes, in one transaction:
   - `documents` — raw source text
   - `pipeline_telemetry` — confidence, word count, processing time
   - `verification_matrix` — workflow status and priority
   - `audit_logs` — ingestion audit entry

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) |
| UI | React 19, Tailwind CSS 3 |
| Database | PostgreSQL |
| ORM | Prisma 7 (`@prisma/adapter-pg`) |
| AI | [Ollama](https://ollama.com/) (`llama3`) |

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- **PostgreSQL** running locally or remotely
- **Ollama** installed with the `llama3` model pulled:

  ```bash
  ollama pull llama3
  ```

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/cyborg-stingray/IntelliDoc-Ingestion-Pipeline-Verification-Matrix.git
cd IntelliDoc-Ingestion-Pipeline-Verification-Matrix
npm install
```

### 2. Environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/intellidoc?schema=public"
```

`DATABASE_URL` is the single source of truth for Prisma, `db.js`, and any manual SQL client (pgAdmin, `psql`, etc.). All application data is stored in the database named in that URL (default: **`intellidoc`**).

> **Note:** `.env` is gitignored. Never commit credentials.

### 3. Database setup

Create the database (if it does not exist), then apply migrations:

```bash
# Example: create DB in psql
# CREATE DATABASE intellidoc;

npx prisma migrate dev
npx prisma generate
```

### 4. Start Ollama

Ensure Ollama is running and listening on port `11434`:

```bash
ollama serve
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run lint` | ESLint (Next.js) |
| `npx prisma migrate dev` | Apply migrations in development |
| `npx prisma studio` | Open Prisma Studio DB browser |

## API

### `POST /api/process-document`

Processes a document through Ollama and saves results to PostgreSQL.

**Request body**

```json
{
  "documentText": "Patient follow-up. No urgent complications noted.",
  "documentType": "Clinical Summary Log"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `documentText` | Yes | Raw document content to analyze |
| `documentType` | No | Defaults to `"Clinical Summary Log"` |

**Success response** `200`

```json
{
  "id": "uuid",
  "timestamp": "2026-05-17T12:00:00.000Z",
  "type": "Clinical Summary Log",
  "status": "AUTO_APPROVED",
  "priority": "NORMAL",
  "confidenceScore": 0.92,
  "wordCount": 8,
  "processingMs": 8500
}
```

**Error response**

```json
{
  "error": "Could not reach Ollama at http://localhost:11434.",
  "stage": "ollama",
  "details": "fetch failed"
}
```

| `stage` | Meaning |
|---------|---------|
| `validation` | Missing or invalid request body |
| `ollama` | Ollama unreachable, HTTP error, or empty response |
| `ai_parse` | Model output was not valid JSON or failed enum validation |
| `database` | Prisma/PostgreSQL write failed |
| `unknown` | Unexpected server error |

**Classification rules (prompt)**

- If the text contains `bleed`, `complication`, `urgent`, or `critical` → `FLAGGED_FOR_REVIEW` + `HIGH` priority
- Otherwise → `AUTO_APPROVED` + `NORMAL` priority
- Confidence score expected between `0.75` and `0.99`

## Database schema

| Table | Purpose |
|-------|---------|
| `documents` | Raw ingested text and metadata |
| `pipeline_telemetry` | AI confidence, word count, latency |
| `verification_matrix` | Workflow status and review priority |
| `audit_logs` | Action history per document |

**Enums**

- `PipelineStatus`: `AWAITING_INGESTION`, `AUTO_APPROVED`, `FLAGGED_FOR_REVIEW`, `COMMITTED`, `ARCHIVED`
- `ValidationPriority`: `LOW`, `NORMAL`, `HIGH`, `CRITICAL`

**Verify saved data**

```sql
-- Connect to the database in DATABASE_URL (e.g. intellidoc)
SELECT d.id, d.doc_type, d.created_at, v.system_status, v.priority_level
FROM documents d
JOIN verification_matrix v ON v.document_id = d.id
ORDER BY d.created_at DESC;
```

## Project structure

```
├── app/
│   ├── api/process-document/route.js   # Ingestion API
│   ├── layout.js                       # Root layout
│   ├── page.js                         # Home / submission UI
│   └── globals.css                     # Tailwind styles
├── lib/
│   └── prisma.js                       # Prisma client (pg adapter)
├── prisma/
│   ├── schema.prisma                   # Data model
│   └── migrations/                     # SQL migrations
├── prisma.config.ts                    # Prisma 7 config (DATABASE_URL)
├── db.js                               # pg Pool (uses DATABASE_URL)
├── next.config.mjs
└── .env                                # Local secrets (not committed)
```

## Troubleshooting

### UI shows success but no rows in the database

Confirm you are querying the same database as `DATABASE_URL` (e.g. **`intellidoc`**, not the default `postgres` database).

### `Could not reach Ollama` / `[ollama]`

- Start Ollama: `ollama serve`
- Confirm the model exists: `ollama list` (should include `llama3`)
- Pull if missing: `ollama pull llama3`

### `[ai_parse]` errors

The model returned text that was not valid JSON or used invalid enum values. Retry the request or adjust the prompt in `app/api/process-document/route.js`.

### `[database]` errors

- PostgreSQL is running
- `DATABASE_URL` credentials are correct
- Migrations are applied: `npx prisma migrate dev`

### Prisma client errors after schema changes

```bash
npx prisma generate
```

Restart the dev server after changing `.env` or the schema.

## License

ISC
