# SitAlert

Real-time situational awareness web app that aggregates events from structured APIs and OSINT sources, geolocates them, and displays them on an interactive map.

## Architecture

```
apps/web         → Next.js 15 (App Router) on Vercel — frontend + API routes
apps/collector   → Standalone Node.js on Railway — event ingestion + LLM pipeline
packages/shared  → Types, constants, utils (Zod schemas, category metadata)
packages/db      → Drizzle ORM schema, PostGIS queries, Neon client factories
```

## Tech Stack

| Layer | Choice |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Frontend | Next.js 15 (App Router), Tailwind CSS, shadcn/ui |
| Map | MapCN (MapLibre GL JS) — free, no API key |
| LLM | OpenAI gpt-4o-mini via Vercel AI SDK (`generateObject`) |
| Database | Neon PostgreSQL + PostGIS + pg_trgm |
| Cache/PubSub | Upstash Redis (REST for web, TCP/ioredis for collector) |
| ORM | Drizzle ORM (`neon-http` for web, `neon-serverless` for collector) |
| Real-time | SSE via Edge Runtime + Upstash Redis pub/sub |

## Key Conventions

- **NEVER use `any`** — use proper types, `unknown` + type guards, or Zod parsing
- **Zod for runtime validation** of all external data (API responses, LLM output, query params)
- **Vitest** for all tests across all packages
- Internal packages export source `.ts` files (JIT compiled by consumer bundler)
- PostGIS spatial queries via Drizzle `sql` template tag

## Common Commands

```bash
pnpm dev              # Start all services
pnpm dev:web          # Start web app only
pnpm dev:collector    # Start collector only
pnpm build            # Build all packages
pnpm typecheck        # TypeScript check all packages
pnpm test             # Run all tests
pnpm db:push          # Push schema to Neon
pnpm db:studio        # Open Drizzle Studio
```

## Environment Variables

See `.env.example` for all variables. Key services:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis (web)
- `REDIS_URL` — Upstash Redis TCP (collector pub/sub)
- `OPENAI_API_KEY` — OpenAI for LLM classification (collector)

## Package Relationships

```
apps/web       → @sitalert/shared, @sitalert/db
apps/collector → @sitalert/shared, @sitalert/db
packages/db    → @sitalert/shared
```
