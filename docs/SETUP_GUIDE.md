# SitAlert Setup Guide

## 1. Neon PostgreSQL

Set up via Neon MCP tools or Neon Console:

1. Create a project: `mcp__Neon__create_project` with name "sitalert"
2. Enable extensions:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```
3. Get connection string: `mcp__Neon__get_connection_string`
4. Set `DATABASE_URL` in `.env.local` (web) and collector environment

**Dev branches**: Use `mcp__Neon__create_branch` for isolated testing.

## 2. Upstash Redis

1. Add via Vercel: `vercel integration add upstash`
2. This auto-sets `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for the web app
3. For the collector, find the TCP URL in Upstash Console → Database → Details → Connection
4. Set `REDIS_URL` (format: `rediss://default:TOKEN@HOST:6379`) in collector environment

## 3. Groq API Key

1. Get key from https://console.groq.com/keys
2. Model used: `llama-3.1-8b-instant` (free tier, fast inference)
3. Set `GROQ_API_KEY` in collector environment

## 4. Telegram Credentials (Phase 2)

1. Go to https://my.telegram.org → API Development Tools
2. Create an application to get `API_ID` and `API_HASH`
3. Generate session string using GramJS auth flow
4. Set `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION_STRING`

## 5. NASA FIRMS API Key

1. Register at https://earthdata.nasa.gov/
2. Request FIRMS API key from https://firms.modaps.eosdis.nasa.gov/api/area/
3. Set `NASA_FIRMS_API_KEY` in collector environment

## 6. Nominatim Geocoding

- Default: Uses public OpenStreetMap instance (no setup needed)
- Rate limit: 1 request/second (enforced by collector)
- Production: Self-host via Docker for higher throughput
- Set `NOMINATIM_URL` to override (default: `https://nominatim.openstreetmap.org`)

## 7. Railway (Collector Deployment)

1. Install Railway CLI: `npm i -g @railway/cli`
2. `railway login && railway init`
3. Point to `apps/collector/Dockerfile`
4. Set all collector env vars in Railway dashboard
5. Deploy: `railway up`

## Verification Steps

| Service | How to verify |
|---|---|
| Neon | `pnpm db:studio` opens and shows events table |
| Upstash | `curl $UPSTASH_REDIS_REST_URL/ping -H "Authorization: Bearer $TOKEN"` returns PONG |
| Groq | Start collector, check logs for successful classification |
| Collector | `pnpm dev:collector` — events appear in Neon within 60s |
| Web | `pnpm dev:web` — map loads, events appear after collector runs |
