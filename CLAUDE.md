# TravelRisk

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
| LLM | OpenAI GPT-5 Nano via Vercel AI SDK (`generateObject`) |
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
apps/web       → @travelrisk/shared, @travelrisk/db
apps/collector → @travelrisk/shared, @travelrisk/db
packages/db    → @travelrisk/shared
```

## Design Context

### Users
General public and travelers checking global safety conditions. They arrive wanting a quick, scannable overview of what's happening worldwide — not a professional intelligence tool, but a reliable, accessible dashboard anyone can read at a glance. Context ranges from pre-trip safety checks to casual situational awareness.

### Brand Personality
**Minimal, focused, reliable.** Like a weather radar — a simple interface backed by serious data. The app should feel trustworthy and calm even when displaying alarming events. No sensationalism, no visual noise.

### Aesthetic Direction
- **Theme**: Dark mode by default (hardcoded). OKLch color space for perceptually uniform colors.
- **References**: Liveuamap, GDACS — real-time crisis map dashboards with layers and filters. Dense but navigable.
- **Anti-references**: Flashy news sites, cluttered dashboards, anything that prioritizes spectacle over clarity.
- **Component system**: shadcn/ui (New York style) + Radix primitives + Lucide icons. CVA for variants, `cn()` for class merging.
- **Typography**: IBM Plex Sans (body) + IBM Plex Mono (brand/display accents). Industrial, technical feel.
- **Color system**: Category colors (red=conflict, orange=disaster, blue=weather, green=health, purple=transport, etc.) and severity gradient (gray→amber→orange→red→dark red). Colors encode meaning — never decorative.

### Design Principles
1. **Data density over decoration** — Every pixel should convey information. Prefer compact layouts, small text, and dense lists over whitespace-heavy designs.
2. **Color is semantic** — Colors always mean something (severity, category, platform). Never use color purely for aesthetics. Ensure category/severity colors are distinguishable.
3. **Calm urgency** — Present critical information without creating panic. Use restraint in animation (pulse for new events only), muted backgrounds, and let the data speak.
4. **Progressive disclosure** — Show the map and counts first, details on click. Sidebar filters narrow focus. Don't overwhelm on first load.
5. **Accessible by default** — WCAG AA compliance: 4.5:1 contrast ratios, visible focus indicators, keyboard navigation, screen reader support, reduced motion respect.
