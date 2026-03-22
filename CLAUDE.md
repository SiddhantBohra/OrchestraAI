# CLAUDE.md — Instructions for Claude Code

This file provides context for Claude Code (and other AI coding assistants) working on the OrchestraAI codebase.

## What is this project?

OrchestraAI is an observability and control plane for autonomous AI agents. It consists of:

- **API** (`apps/api/`) — NestJS backend with PostgreSQL, TypeORM, JWT auth
- **Web** (`apps/web/`) — Next.js 14 dashboard
- **Shared** (`packages/shared/`) — Shared TypeScript types, enums, pricing constants
- **Python SDK** (`sdks/python/`) — Python SDK with Pydantic models, httpx client
- **TypeScript SDK** (`sdks/typescript/`) — TS SDK with tsup build

## Build & Run

```bash
npm install              # Install all workspace deps
npm run build            # Build all packages (Turbo)
npm run dev:api          # Start API on :3001 (hot reload)
npm run dev:web          # Start web on :3000 (hot reload)
docker compose up -d postgres redis  # Start infrastructure
```

## Key Architecture Decisions

- **Monorepo** managed by npm workspaces + Turborepo
- **Enums are defined once** in `packages/shared/src/index.ts` and imported everywhere (API entities re-export them)
- **API keys are bcrypt-hashed** — raw key shown only once on creation. Lookup uses a 12-char prefix index.
- **Migrations, not synchronize** — TypeORM `synchronize: false`, migrations in `apps/api/src/migrations/`
- **Policy evaluation** happens during ingest — rate limits and runaway detection query recent trace counts
- **Cost calculation** priority: SDK-provided cost > project custom pricing > built-in MODEL_PRICING > null
- **SSE** for real-time events via `EventsModule` (global, EventEmitter-based)

## Module Layout (apps/api/src/modules/)

| Module | Purpose |
|--------|---------|
| `auth/` | JWT auth, user registration, bcrypt passwords |
| `projects/` | Project CRUD, API key hashing (bcrypt), budget checks |
| `agents/` | Agent registry, metrics (runs, tokens, cost) |
| `traces/` | Trace storage, tree builder, analytics queries |
| `policies/` | Policy engine (budget, rate limit, tool permission, runaway), alerts |
| `ingest/` | SDK + OTLP ingestion, PII redaction, policy evaluation |
| `dashboard/` | Aggregation queries for the web dashboard |
| `events/` | SSE real-time events (global module) |
| `prompts/` | Prompt template versioning |

## TypeORM Notes

- Nullable string columns must use `@Column({ type: 'varchar', nullable: true })` — TypeScript `string | null` emits `Object` in reflect-metadata, causing TypeORM errors
- All enum columns use `@Column({ type: 'enum', enum: EnumName })`
- Migrations are in `apps/api/src/migrations/` — run with `migrationsRun: true` on startup

## SDK Field Mapping

Python SDK uses snake_case internally, camelCase aliases for the API:
```python
IngestEvent(traceId=..., spanId=..., promptTokens=...)  # camelCase aliases
event.model_dump(by_alias=True)  # Serializes to camelCase for API
```

TypeScript SDK uses camelCase matching the API DTO directly.

## Testing

No unit test suite yet. E2E tests in `tests/` require:
- Running API + Postgres
- Environment variables: `ORCHESTRA_API_KEY`, `ORCHESTRA_PROJECT_ID`, `ORCHESTRA_JWT_TOKEN`

## Coding Conventions

- NestJS modules use barrel imports from entities
- Services never throw raw errors — use NestJS exceptions (`NotFoundException`, etc.)
- Policy evaluation returns `{ allowed, policyId, action, reason, warnings }`
- Ingest service handles both SDK format (`IngestEventDto`) and OTLP format (`IngestTracesDto`)
- Python SDK: Pydantic v2, httpx, `with` context managers for traces
- TypeScript SDK: No external deps (uses native `fetch`)
