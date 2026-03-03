# SitAlert — Requirements Document

## 1. Project Overview

**SitAlert** is a real-time situational awareness web application that aggregates events from multiple structured and OSINT sources, geolocates them, and displays them on an interactive map. The primary use case is travel risk monitoring and general curiosity about global events.

**Target:** Consumer-first (public-facing), with future B2B expansion.

**Core value proposition:** A modern, accessible alternative to expensive tools like Dataminr or Riskline, powered by LLM-based processing of unstructured OSINT sources.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Language | TypeScript (end-to-end) | Single language across all services |
| Monorepo | Turborepo + pnpm workspaces | Shared types and utils |
| Frontend | Next.js 14+ (App Router) | SSR for SEO, client for map |
| Map | Mapbox GL JS | Clustering, custom styles, performant with thousands of markers |
| Backend API | Next.js API Routes / Route Handlers | REST endpoints for historical queries and filters |
| Collector Service | Standalone Node.js process | Long-running, connects to all sources |
| LLM Processing | Anthropic Claude API (Haiku) | Event classification, entity extraction, geocoding hint |
| Geocoding | Nominatim (OpenStreetMap) | Free, self-hostable, no rate limit concerns |
| Database | PostgreSQL + PostGIS | Geospatial queries, event storage |
| Cache / Pub-Sub | Redis | Real-time event distribution, SSE backing |
| Real-time delivery | SSE (Server-Sent Events) | Unidirectional push to browser |
| ORM | Drizzle ORM | Lightweight, TypeScript-native, PostGIS support via raw SQL |
| Deployment | Docker Compose (dev), Railway or Fly.io (prod) | Two services: web + collector |

---

## 3. Monorepo Structure

```
sitalert/
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── docker-compose.yml
│
├── apps/
│   ├── web/                          # Next.js frontend + API
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx          # Main map view
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── api/
│   │   │   │   │   ├── events/
│   │   │   │   │   │   └── route.ts  # GET events (filtered, paginated, geospatial)
│   │   │   │   │   ├── stream/
│   │   │   │   │   │   └── route.ts  # SSE endpoint for real-time events
│   │   │   │   │   └── stats/
│   │   │   │   │       └── route.ts  # Aggregate stats (event counts by category, etc.)
│   │   │   ├── components/
│   │   │   │   ├── Map/
│   │   │   │   │   ├── MapView.tsx           # Main Mapbox GL wrapper
│   │   │   │   │   ├── EventMarker.tsx       # Single event pin
│   │   │   │   │   ├── ClusterMarker.tsx     # Clustered events pin
│   │   │   │   │   └── EventPopup.tsx        # Popup with event details
│   │   │   │   ├── Sidebar/
│   │   │   │   │   ├── EventList.tsx         # Scrollable event feed
│   │   │   │   │   ├── EventCard.tsx         # Single event in list
│   │   │   │   │   ├── CategoryFilter.tsx    # Toggle categories on/off
│   │   │   │   │   └── SeverityFilter.tsx    # Min severity slider
│   │   │   │   ├── Timeline/
│   │   │   │   │   └── TimelineBar.tsx       # Time-range scrubber
│   │   │   │   └── common/
│   │   │   │       ├── SeverityBadge.tsx
│   │   │   │       ├── SourceBadge.tsx
│   │   │   │       └── ConfidenceIndicator.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useEventStream.ts         # SSE connection hook
│   │   │   │   ├── useMapEvents.ts           # Fetch + filter events for map viewport
│   │   │   │   └── useFilters.ts             # Category/severity/time filter state
│   │   │   └── lib/
│   │   │       ├── mapbox.ts                 # Mapbox config and helpers
│   │   │       └── api.ts                    # API client
│   │   └── next.config.js
│   │
│   └── collector/                    # Standalone Node.js ingestion service
│       ├── src/
│       │   ├── index.ts              # Entry point, starts all adapters
│       │   ├── adapters/
│       │   │   ├── base.ts           # SourceAdapter interface
│       │   │   ├── usgs.ts           # USGS Earthquake feed
│       │   │   ├── gdacs.ts          # GDACS disasters
│       │   │   ├── nasa-firms.ts     # NASA fire data
│       │   │   ├── noaa.ts           # NOAA hurricanes
│       │   │   ├── emsc.ts           # European seismology
│       │   │   ├── reliefweb.ts      # ReliefWeb crises
│       │   │   ├── telegram.ts       # Telegram channel monitor (GramJS)
│       │   │   ├── rss.ts            # Generic RSS/Atom feed adapter
│       │   │   └── travel-advisories.ts  # Farnesina, State Dept, FCDO
│       │   ├── processing/
│       │   │   ├── classifier.ts     # LLM-based event classification
│       │   │   ├── extractor.ts      # Entity extraction (location, category, severity)
│       │   │   ├── geocoder.ts       # Nominatim geocoding
│       │   │   └── deduplicator.ts   # Cross-source deduplication
│       │   ├── pipeline.ts           # Orchestrates: raw → classify → extract → geocode → store
│       │   └── publisher.ts          # Publishes processed events to Redis pub/sub
│       ├── Dockerfile
│       └── tsconfig.json
│
├── packages/
│   ├── shared/
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── event.ts          # NormalizedEvent, RawEvent, etc.
│   │   │   │   ├── category.ts       # EventCategory enum + metadata
│   │   │   │   ├── source.ts         # Source types, platform enum
│   │   │   │   └── filters.ts        # Filter query types
│   │   │   ├── constants/
│   │   │   │   ├── categories.ts     # Category definitions, colors, icons
│   │   │   │   └── severity.ts       # Severity levels 1-5 with labels
│   │   │   └── utils/
│   │   │       ├── geo.ts            # Haversine distance, bounding box helpers
│   │   │       └── time.ts           # Relative time formatting
│   │   └── package.json
│   │
│   └── db/
│       ├── src/
│       │   ├── schema.ts             # Drizzle schema definitions
│       │   ├── client.ts             # DB connection
│       │   ├── queries/
│       │   │   ├── events.ts         # Insert, query, geospatial search
│       │   │   └── stats.ts          # Aggregations
│       │   └── migrations/
│       └── package.json
│
└── config/
    ├── sources.json                  # Source configuration (URLs, polling intervals, channel lists)
    └── categories.json               # Category taxonomy
```

---

## 4. Data Model

### 4.1 NormalizedEvent (core schema)

This is the central data structure. Every source adapter must produce events conforming to this schema.

```typescript
interface NormalizedEvent {
  id: string;                          // Unique ID: "src_platform_hash" (e.g., "usgs_earthquake_abc123")
  title: string;                       // Short title, max 120 chars
  summary: string;                     // Description, max 500 chars
  category: EventCategory;             // Enum (see §4.2)
  severity: 1 | 2 | 3 | 4 | 5;       // 1=minor, 5=catastrophic
  confidence: number;                  // 0.0 to 1.0 — reliability of the event
  lat: number;
  lng: number;
  location_name: string;               // Human-readable location ("Beirut, Lebanon")
  country_code: string | null;         // ISO 3166-1 alpha-2
  timestamp: string;                   // ISO 8601 — when event occurred
  sources: EventSource[];              // One or more sources
  media: string[];                     // URLs to images/video (optional)
  raw_text: string | null;             // Original unprocessed text (for OSINT sources)
  cluster_id: string | null;           // ID of parent cluster if merged
  expires_at: string | null;           // ISO 8601 — when event should auto-hide (e.g., weather)
  created_at: string;                  // When we ingested it
  updated_at: string;                  // Last update
}

interface EventSource {
  name: string;                        // "USGS", "BNO News", "@OSINTdefender"
  platform: "api" | "telegram" | "twitter" | "rss" | "scraper";
  url: string | null;                  // Direct link to source
  fetched_at: string;                  // When we got it from this source
}
```

### 4.2 EventCategory Enum

```typescript
enum EventCategory {
  CONFLICT         = "conflict",          // Armed conflict, military operations
  TERRORISM        = "terrorism",         // Terror attacks, plots
  NATURAL_DISASTER = "natural_disaster",  // Earthquakes, tsunamis, volcanic eruptions
  WEATHER_EXTREME  = "weather_extreme",   // Hurricanes, floods, wildfires, heat waves
  HEALTH_EPIDEMIC  = "health_epidemic",   // Disease outbreaks, pandemics
  CIVIL_UNREST     = "civil_unrest",      // Protests, riots, strikes
  TRANSPORT        = "transport",         // Aviation incidents, road closures, port disruptions
  INFRASTRUCTURE   = "infrastructure",    // Blackouts, cyber attacks, communications down
}
```

Each category has associated:

| Category | Color | Icon (Lucide) | Default severity |
|---|---|---|---|
| conflict | `#DC2626` (red) | `Crosshair` | 4 |
| terrorism | `#991B1B` (dark red) | `AlertTriangle` | 5 |
| natural_disaster | `#EA580C` (orange) | `Mountain` | 4 |
| weather_extreme | `#2563EB` (blue) | `CloudLightning` | 3 |
| health_epidemic | `#16A34A` (green) | `HeartPulse` | 3 |
| civil_unrest | `#CA8A04` (yellow) | `Users` | 2 |
| transport | `#7C3AED` (purple) | `Plane` | 2 |
| infrastructure | `#475569` (gray) | `Zap` | 3 |

### 4.3 Database Schema (PostgreSQL + PostGIS)

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE events (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  summary         TEXT,
  category        TEXT NOT NULL,
  severity        INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  confidence      REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  location        GEOGRAPHY(POINT, 4326) NOT NULL,  -- PostGIS point
  location_name   TEXT,
  country_code    TEXT,
  timestamp       TIMESTAMPTZ NOT NULL,
  sources         JSONB NOT NULL DEFAULT '[]',
  media           JSONB NOT NULL DEFAULT '[]',
  raw_text        TEXT,
  cluster_id      TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Geospatial index for viewport queries
CREATE INDEX idx_events_location ON events USING GIST(location);
-- Time-based queries
CREATE INDEX idx_events_timestamp ON events (timestamp DESC);
-- Category filtering
CREATE INDEX idx_events_category ON events (category);
-- Composite for common query pattern
CREATE INDEX idx_events_cat_sev_time ON events (category, severity, timestamp DESC);
-- Expiry cleanup
CREATE INDEX idx_events_expires ON events (expires_at) WHERE expires_at IS NOT NULL;
```

---

## 5. Collector Service — Detailed Specs

### 5.1 Adapter Interface

Every source must implement this interface:

```typescript
interface SourceAdapter {
  readonly name: string;                    // Unique adapter name
  readonly platform: EventSource["platform"];
  readonly defaultConfidence: number;       // Base confidence for this source type
  readonly pollingInterval?: number;        // ms between polls (if polling-based)

  start(): Promise<void>;                   // Begin collecting
  stop(): Promise<void>;                    // Graceful shutdown
  healthCheck(): Promise<boolean>;          // Is the source reachable?
}

// Every adapter emits events through a shared EventEmitter or callback
type EventCallback = (raw: RawEvent) => void;

interface RawEvent {
  source_adapter: string;
  source_name: string;
  source_url: string | null;
  platform: EventSource["platform"];
  raw_text: string;
  raw_data: Record<string, unknown>;       // Original API response
  lat?: number;                            // Pre-geocoded if available
  lng?: number;
  category?: EventCategory;                // Pre-classified if structured source
  severity?: number;
  timestamp: string;
  media?: string[];
}
```

### 5.2 Structured Source Adapters (Phase 1 — No LLM needed)

These sources provide coordinates and structured data. Implement as simple pollers.

#### USGS Earthquakes

- **URL:** `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson`
- **Polling:** Every 60 seconds
- **Mapping:** `properties.mag` → severity (< 3.0 = 1, 3-4.5 = 2, 4.5-6 = 3, 6-7.5 = 4, > 7.5 = 5)
- **Confidence:** 1.0 (official government source)
- **Coordinates:** Already in GeoJSON

#### GDACS

- **URL:** `https://www.gdacs.org/xml/rss.xml` (RSS feed with GeoRSS)
- **Polling:** Every 5 minutes
- **Mapping:** `gdacs:alertlevel` (Green=1, Orange=3, Red=5)
- **Confidence:** 1.0
- **Coordinates:** In `geo:point` element

#### NASA FIRMS (Active Fires)

- **URL:** `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/world/1`
- **Polling:** Every 15 minutes
- **Notes:** Requires free API key. Returns CSV with lat/lng. Cluster nearby fires (within 10km) into single events.
- **Confidence:** 0.95

#### NOAA NHC (Hurricanes)

- **URL:** `https://www.nhc.noaa.gov/CurrentSurges.json` + active storm feeds
- **Polling:** Every 10 minutes
- **Confidence:** 1.0

#### EMSC Earthquakes (European focus)

- **URL:** `https://www.seismicportal.eu/fdsnws/event/1/query?limit=20&format=json`
- **Polling:** Every 60 seconds
- **Confidence:** 1.0

#### ReliefWeb

- **URL:** `https://api.reliefweb.int/v1/disasters?appname=sitalert&limit=20&sort[]=date:desc`
- **Polling:** Every 15 minutes
- **Confidence:** 0.95
- **Notes:** Good for ongoing crises. Less real-time, more context.

### 5.3 OSINT Source Adapters (Phase 2 — LLM processing required)

#### Telegram Adapter

- **Library:** `telegram` (GramJS) on npm
- **Auth:** User account (not bot) — requires phone number + API ID/hash from my.telegram.org
- **Mode:** Real-time event listener on configured channels
- **Channel list** (initial, configurable via `config/sources.json`):

```json
{
  "telegram_channels": {
    "conflict": [
      "intelslava", "ryaborig", "osaborig",
      "middleeastspectator", "SouthFront_en"
    ],
    "breaking_news": [
      "breaking911", "baborig", "Flash_news_ua",
      "maborig"
    ],
    "disasters": [
      "LastQuake_EMSC", "volcanodiscovery"
    ],
    "weather": [
      "severeweatherEU"
    ]
  }
}
```

- **Processing:** Every message goes through the LLM pipeline (see §5.4)
- **Media:** Download images/videos if present, store URL
- **Rate:** Expect ~50-200 messages/hour across all channels
- **Confidence:** Base 0.4 for single source, increases with cross-source confirmation

#### RSS Adapter

- **Library:** `rss-parser` on npm
- **Sources:** Configurable list of RSS/Atom feeds
- **Initial feeds:**
  - Reuters World: `http://feeds.reuters.com/Reuters/worldNews`
  - BBC World: `http://feeds.bbci.co.uk/news/world/rss.xml`
  - Al Jazeera: `https://www.aljazeera.com/xml/rss/all.xml`
  - ANSA (Italian): `https://www.ansa.it/sito/ansait_rss.xml`
- **Polling:** Every 5 minutes
- **Processing:** Title + description → LLM for classification + geocoding
- **Confidence:** 0.7 (reputable but needs geocoding)

#### Travel Advisories Adapter

- **Sources:**
  - US State Dept: `https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html` (scrape, structured by country)
  - UK FCDO: `https://www.gov.uk/foreign-travel-advice.json`
  - Farnesina: `https://www.viaggiaresicuri.it/` (scrape)
- **Polling:** Every 6 hours (they update infrequently)
- **Mapping:** Country-level events, centroid coordinates
- **Confidence:** 1.0

### 5.4 LLM Processing Pipeline

For unstructured sources (Telegram, RSS, scraped text), every raw message passes through this pipeline:

```
Raw message → Relevance filter → Classification → Entity extraction → Geocoding → Dedup → Store + Publish
```

#### Step 1: Relevance Filter + Classification (single LLM call)

Use Claude Haiku via Anthropic API. System prompt:

```
You are an event classifier for a global situational awareness platform.
Given a message from a news/OSINT source, determine:
1. Is this a reportable real-world event? (not opinion, not old news, not spam)
2. If yes: classify it.

Respond ONLY with JSON, no other text:
{
  "relevant": true/false,
  "category": "conflict|terrorism|natural_disaster|weather_extreme|health_epidemic|civil_unrest|transport|infrastructure",
  "severity": 1-5,
  "title": "Brief event title, max 120 chars",
  "summary": "What happened, max 300 chars",
  "location_mentions": ["Beirut", "southern Lebanon"],
  "timestamp_hint": "ISO string if mentioned, null otherwise"
}

If not relevant, only return: {"relevant": false}
```

- **Model:** `claude-haiku-4-5-20251001`
- **Max tokens:** 300
- **Expected cost:** ~$0.0005 per message
- **Expected latency:** 200-500ms

#### Step 2: Geocoding

For each `location_mention` returned by the LLM:

1. Query Nominatim: `https://nominatim.openstreetmap.org/search?q={location}&format=json&limit=1`
2. Take first result's lat/lng
3. If multiple locations mentioned, use the most specific one
4. Extract country code from Nominatim response
5. Cache results in Redis (location string → coordinates) with 24h TTL

**Rate limit:** Nominatim allows 1 req/sec. Queue geocoding requests with a 1s delay. For higher throughput, self-host Nominatim with Photon.

#### Step 3: Deduplication

Events from different sources about the same incident must be merged.

**Algorithm:**

1. For each new event, query recent events (last 6 hours) within 50km radius and same category
2. Compare title/summary similarity using simple cosine similarity on word vectors (or Jaccard on keywords)
3. If similarity > 0.6, merge: keep highest severity, aggregate sources, update timestamp to latest
4. If no match, insert as new event

**Implementation:** Use PostGIS `ST_DWithin` for geospatial proximity check, pg_trgm for text similarity.

---

## 6. Frontend — Detailed Specs

### 6.1 Main View Layout

```
┌──────────────────────────────────────────────────┐
│  SitAlert logo    [Search]    [About]  [Alerts]  │
├──────────┬───────────────────────────────────────┤
│          │                                       │
│ Sidebar  │              Map                      │
│ (380px)  │         (fills remaining)             │
│          │                                       │
│ Filters  │     Mapbox GL JS                      │
│ ──────── │     - Clustered markers               │
│ Category │     - Color = category                │
│ toggles  │     - Size = severity                 │
│          │     - Opacity = confidence             │
│ Severity │                                       │
│ slider   │                                       │
│ ──────── │                                       │
│          │                                       │
│ Event    │                                       │
│ feed     │                                       │
│ (scroll) │                                       │
│          │                                       │
├──────────┴───────────────────────────────────────┤
│  Timeline scrubber: [|----●---------------------|] │
│  ← 24h ago                                 Now → │
└──────────────────────────────────────────────────┘
```

**Mobile:** Sidebar becomes a bottom sheet (draggable). Map fills screen. Filters in a collapsible top bar.

### 6.2 Map Behavior

- **Library:** Mapbox GL JS via `react-map-gl`
- **Initial view:** World view, centered on user's approximate location if available
- **Markers:** Use Mapbox's built-in clustering (`clusterMaxZoom: 14`, `clusterRadius: 50`)
- **Marker appearance:**
  - Circle marker with category color fill
  - Radius proportional to severity (12px for sev 1, 28px for sev 5)
  - Opacity proportional to confidence (0.4 min, 1.0 max)
  - Pulse animation on events < 30 min old
- **Click marker:** Show popup with EventPopup component (title, summary, severity, sources, time, link to sources)
- **Click cluster:** Zoom in to expand
- **Viewport loading:** Fetch events for current bounding box via API (not all global events at once). Re-fetch on pan/zoom with debounce (300ms).

### 6.3 Real-time Updates (SSE)

- Frontend connects to `/api/stream` on mount
- Receives new/updated events as JSON
- Events within current viewport + filters are added to map immediately with a brief highlight animation
- Event feed in sidebar shows new events at top with "NEW" badge that fades after 60s
- Reconnect with exponential backoff on disconnect

### 6.4 Sidebar — Event Feed

- Sorted by timestamp descending (newest first)
- Each EventCard shows: category icon, title, location_name, relative time ("3m ago"), severity badge, source count
- Click card → map flies to event location and opens popup
- Infinite scroll with pagination (50 events per page)

### 6.5 Filters

- **Category toggles:** 8 toggles, all on by default. Shows count per category.
- **Severity slider:** Range 1-5, default "show all" (1+)
- **Time range:** Via timeline scrubber at bottom. Default: last 24 hours. Options: 1h, 6h, 24h, 7d, 30d.
- **Confidence threshold:** Hidden in "Advanced" dropdown. Default: 0.3 (show most things). Slider 0.0-1.0.
- Filters apply both to map markers and sidebar feed simultaneously.
- URL state: All filters reflected in URL query params for shareable links.

### 6.6 API Endpoints

#### `GET /api/events`

Query events with filters.

```typescript
// Query params
interface EventsQuery {
  bbox?: string;            // "west,south,east,north" — bounding box
  categories?: string;      // Comma-separated: "conflict,terrorism"
  min_severity?: number;    // 1-5
  min_confidence?: number;  // 0.0-1.0
  after?: string;           // ISO datetime
  before?: string;          // ISO datetime
  limit?: number;           // Default 100, max 500
  offset?: number;          // Pagination
}

// Response
interface EventsResponse {
  events: NormalizedEvent[];
  total: number;
  has_more: boolean;
}
```

#### `GET /api/stream`

SSE endpoint. Sends events matching optional filters.

```typescript
// Query params (optional)
interface StreamQuery {
  categories?: string;
  min_severity?: number;
}

// SSE events
// event: new_event
// data: { ...NormalizedEvent }

// event: update_event
// data: { id: string, ...partial NormalizedEvent }

// event: heartbeat
// data: { timestamp: string }   // Every 30 seconds
```

#### `GET /api/stats`

```typescript
// Response
interface StatsResponse {
  total_events_24h: number;
  by_category: Record<EventCategory, number>;
  by_severity: Record<number, number>;
  active_sources: number;
  last_event_at: string;
}
```

---

## 7. Processing Pipeline — Flow Detail

```
┌──────────────────────────────────────────────────────────────────┐
│                        COLLECTOR SERVICE                         │
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐              │
│  │  USGS   │ │  GDACS  │ │  NASA   │ │ Telegram │  ...more     │
│  │ Adapter │ │ Adapter │ │ Adapter │ │ Adapter  │              │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬─────┘              │
│       │           │           │            │                     │
│       └───────────┴─────┬─────┴────────────┘                     │
│                         │                                        │
│                         ▼                                        │
│              ┌─────────────────────┐                             │
│              │   RawEvent Queue    │  (Redis Stream / in-memory) │
│              └──────────┬──────────┘                             │
│                         │                                        │
│                         ▼                                        │
│              ┌─────────────────────┐                             │
│              │   Pipeline Router   │                             │
│              │                     │                             │
│              │  Structured source? ──► Skip LLM, map directly   │
│              │  OSINT source?      ──► LLM classification       │
│              └──────────┬──────────┘                             │
│                         │                                        │
│                         ▼                                        │
│              ┌─────────────────────┐                             │
│              │  LLM Classification │  Claude Haiku API           │
│              │  (if needed)        │                             │
│              └──────────┬──────────┘                             │
│                         │                                        │
│                         ▼                                        │
│              ┌─────────────────────┐                             │
│              │     Geocoder        │  Nominatim (cached)         │
│              │  (if no coords)     │                             │
│              └──────────┬──────────┘                             │
│                         │                                        │
│                         ▼                                        │
│              ┌─────────────────────┐                             │
│              │   Deduplicator      │  PostGIS proximity +        │
│              │                     │  text similarity            │
│              └──────────┬──────────┘                             │
│                         │                                        │
│                         ▼                                        │
│              ┌─────────────────────┐                             │
│              │   Store (Postgres)  │                             │
│              │   Publish (Redis)   │──► SSE to frontend          │
│              └─────────────────────┘                             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Configuration

### `config/sources.json`

All source configuration is externalized. No hardcoded URLs or intervals in adapter code.

```json
{
  "structured": {
    "usgs": {
      "enabled": true,
      "url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
      "polling_interval_ms": 60000,
      "confidence": 1.0
    },
    "gdacs": {
      "enabled": true,
      "url": "https://www.gdacs.org/xml/rss.xml",
      "polling_interval_ms": 300000,
      "confidence": 1.0
    },
    "nasa_firms": {
      "enabled": true,
      "url": "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{API_KEY}/VIIRS_SNPP_NRT/world/1",
      "polling_interval_ms": 900000,
      "confidence": 0.95
    },
    "emsc": {
      "enabled": true,
      "url": "https://www.seismicportal.eu/fdsnws/event/1/query?limit=20&format=json",
      "polling_interval_ms": 60000,
      "confidence": 1.0
    },
    "reliefweb": {
      "enabled": true,
      "url": "https://api.reliefweb.int/v1/disasters?appname=sitalert&limit=20&sort[]=date:desc",
      "polling_interval_ms": 900000,
      "confidence": 0.95
    }
  },
  "telegram": {
    "enabled": true,
    "api_id": "${TELEGRAM_API_ID}",
    "api_hash": "${TELEGRAM_API_HASH}",
    "channels": ["intelslava", "ryaborig", "breaking911", "baborig"],
    "base_confidence": 0.4
  },
  "rss": {
    "enabled": true,
    "feeds": [
      { "name": "Reuters World", "url": "http://feeds.reuters.com/Reuters/worldNews", "polling_interval_ms": 300000 },
      { "name": "BBC World", "url": "http://feeds.bbci.co.uk/news/world/rss.xml", "polling_interval_ms": 300000 }
    ],
    "base_confidence": 0.7
  }
}
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/sitalert

# Redis
REDIS_URL=redis://localhost:6379

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxx

# Anthropic (for LLM processing)
ANTHROPIC_API_KEY=sk-ant-xxx

# Telegram
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=abc123
TELEGRAM_SESSION_STRING=xxx

# NASA FIRMS
NASA_FIRMS_API_KEY=xxx

# Nominatim (if self-hosted, otherwise use public)
NOMINATIM_URL=https://nominatim.openstreetmap.org
```

---

## 9. Development Phases

### Phase 1 — MVP (Target: 2 weeks)

**Goal:** Working map with real-time structured data sources.

- [ ] Monorepo scaffold (Turborepo + pnpm)
- [ ] PostgreSQL + PostGIS schema + Drizzle setup
- [ ] Redis setup
- [ ] Collector service with adapters: USGS, GDACS, EMSC, NASA FIRMS
- [ ] Direct mapping (no LLM) — these sources provide coordinates + structured data
- [ ] Next.js frontend with Mapbox GL JS
- [ ] Basic marker rendering with clustering
- [ ] Category filter toggles
- [ ] Severity filter
- [ ] SSE real-time connection
- [ ] Sidebar event feed
- [ ] Mobile-responsive layout
- [ ] Docker Compose for local dev (postgres + redis + web + collector)

### Phase 2 — OSINT Integration (Target: +2 weeks)

**Goal:** Add unstructured sources with LLM processing.

- [ ] Telegram adapter with GramJS
- [ ] RSS adapter
- [ ] LLM classification pipeline (Claude Haiku)
- [ ] Nominatim geocoding with Redis cache
- [ ] Deduplication engine
- [ ] Confidence scoring system
- [ ] Timeline scrubber component
- [ ] Event popup with full details + source links
- [ ] Advanced filters (confidence threshold)
- [ ] URL-based filter state

### Phase 3 — Polish & Launch (Target: +2 weeks)

**Goal:** Production-ready consumer product.

- [ ] Travel advisories adapter (country-level risk overlay)
- [ ] Clustering improvements (spatio-temporal grouping)
- [ ] Push notifications (service worker)
- [ ] PWA manifest
- [ ] SEO: server-rendered event pages (`/event/[id]`)
- [ ] Basic analytics (Plausible or similar)
- [ ] Rate limiting on API
- [ ] Error monitoring (Sentry)
- [ ] Health check endpoints for all adapters
- [ ] Deploy: web on Vercel, collector on Railway/Fly.io
- [ ] Landing page

---

## 10. Non-Functional Requirements

| Aspect | Target |
|---|---|
| Event ingestion latency | < 5 seconds from source to map (structured), < 15 seconds (OSINT with LLM) |
| Map rendering | 60fps with up to 5,000 visible markers (via clustering) |
| SSE delivery | < 1 second from DB insert to browser |
| API response time | < 200ms for viewport queries |
| Uptime | 99.5% (collector can miss some polls without data loss) |
| LLM cost | < $5/day at expected volume (~2,000-5,000 messages/day) |
| Storage | ~10K events/day, retain 90 days, ~100GB/year |
| Concurrent users | Support 1,000 concurrent SSE connections |
| Mobile performance | First Contentful Paint < 2s, responsive layout |

---

## 11. Important Notes for Implementation

1. **Start with structured sources only.** Get the map working with USGS + GDACS before touching Telegram/LLM. This ensures the full pipeline (ingest → store → display) works before adding complexity.

2. **The Telegram adapter is the most fragile piece.** GramJS requires a user session (not bot). The session string must be generated once interactively and stored. Channels may go private or get banned. Build retry logic and health checks.

3. **Nominatim rate limiting is real.** Public instance allows 1 req/sec. Cache aggressively. For production, self-host with Docker: `mediagis/nominatim-docker`.

4. **Deduplication is an iterative problem.** Start simple (same category + < 50km + < 6h + title similarity > 0.6), refine over time. False merges are worse than duplicates.

5. **LLM prompt tuning will be ongoing.** The classification prompt in §5.4 is a starting point. Track misclassifications and iterate. Consider few-shot examples for edge cases.

6. **PostGIS viewport queries should use `ST_MakeEnvelope`:**
   ```sql
   SELECT * FROM events
   WHERE ST_Intersects(location, ST_MakeEnvelope(west, south, east, north, 4326))
   AND category = ANY($1)
   AND severity >= $2
   AND timestamp > $3
   ORDER BY timestamp DESC
   LIMIT 500;
   ```

7. **Keep the collector service stateless where possible.** Use Redis for any state (last polled timestamp, dedup cache). This makes it easy to restart without losing progress.

8. **Design for source failure.** Any source can go down at any time. Each adapter should handle failures gracefully with exponential backoff, log errors, and not crash the entire collector.
