# AGENTS.md — Guide for AI Agents Contributing to OrchestraAI

This document helps AI coding agents (Claude Code, Cursor, GitHub Copilot Workspace, etc.) understand the codebase and contribute effectively.

## Repository Overview

OrchestraAI is a monorepo with 4 workspaces:

```
apps/api/          → NestJS backend (TypeScript)
apps/web/          → Next.js 14 frontend (TypeScript)
packages/shared/   → Shared types & utilities (TypeScript)
sdks/python/       → Python SDK (Pydantic + httpx)
sdks/typescript/   → TypeScript SDK (native fetch)
```

## Getting Oriented

### To understand the data model
Read `packages/shared/src/index.ts` — all enums, interfaces, and constants.

### To understand the API
Read `apps/api/src/main.ts` → `apps/api/src/app.module.ts` → then the module you need in `apps/api/src/modules/`.

### To understand the SDK contract
Read `apps/api/src/modules/ingest/dto/ingest.dto.ts` — this is THE canonical interface between SDKs and API.

### To understand policy evaluation
Read `apps/api/src/modules/policies/policies.service.ts` (evaluate method) and `apps/api/src/modules/ingest/ingest.service.ts` (evaluatePolicies method).

## Common Tasks

### Adding a new API module
1. Create module in `apps/api/src/modules/<name>/`
2. Add entity in `entities/`, DTO in `dto/`, service, controller
3. Register in `apps/api/src/app.module.ts`
4. Create a migration in `apps/api/src/migrations/`
5. If the entity has nullable string fields, use `@Column({ type: 'varchar', nullable: true })`

### Adding a new trace type
1. Add to `TraceType` enum in `packages/shared/src/index.ts`
2. Add to `IngestEventDto.type` union in `apps/api/src/modules/ingest/dto/ingest.dto.ts`
3. Add mapping in `ingest.service.ts` → `mapEventType()`
4. Add to Python SDK `TraceType` in `sdks/python/orchestra_ai/types.py`
5. Add to TS SDK `TraceType` in `sdks/typescript/src/types.ts`
6. Create a migration adding the enum value
7. Build all: `npm run build`

### Adding a new Python SDK integration
1. Create `sdks/python/orchestra_ai/integrations/<framework>_tracer.py`
2. Follow the pattern in `langchain_tracer.py` or `langgraph_tracer.py`
3. Export from `sdks/python/orchestra_ai/integrations/__init__.py`
4. Add to `init_helper.py` frameworks list

### Adding a new model to pricing
Add to `MODEL_PRICING` in `packages/shared/src/index.ts`. Prices are per 1K tokens.

## Important Constraints

1. **Never use `synchronize: true`** in TypeORM — always create migrations
2. **Never commit `.env` files** — only `.env.example` with placeholder values
3. **Never hardcode secrets** — use environment variables
4. **Enums must be in sync** across: shared package, API entities, Python SDK types, TS SDK types
5. **API keys are bcrypt-hashed** — never store or log raw API keys
6. **Policy evaluation is on the hot path** — keep it fast (1 DB query for recent counts)
7. **SDKs must not break the host app** — all SDK errors are caught and logged, never thrown

## Build & Verify

```bash
npm run build    # Must pass — builds shared → api + sdk + web
```

If you change entity files, check that `nest start` works against a real PostgreSQL (TypeORM validates metadata at startup).

## Style Guide

- NestJS: standard module/service/controller pattern
- Python SDK: Pydantic v2 models, `with` context managers, type hints everywhere
- TypeScript: strict mode, no `any` in public APIs
- Commits: conventional commits preferred (`feat:`, `fix:`, `refactor:`)
