# Smart Deduplication + Situations Design

## Problem

1. **Duplicate events**: Same incident appears multiple times because Jaccard title similarity misses semantic duplicates ("M5.2 Earthquake near Istanbul" vs "Strong quake shakes Turkish coast").
2. **No situation tracking**: Related events (daily conflict reports, aftershock sequences, wildfire spread) appear as isolated points instead of a single evolving situation.

## Solution

Replace Jaccard-based dedup with an LLM judgment call that handles both deduplication and situation assignment in a single request per event.

---

## Architecture

### Combined LLM Judgment Call

Every incoming event gets **one LLM call** after classification (OSINT) or immediately (structured). The call answers: "Is this a duplicate? Does it belong to a situation?"

**Input**:
- New event: title, summary, category, location, timestamp
- Candidate duplicates: nearby events (50km, 6h, same category)
- Active situations: same category within 500km

**Structured output** (via `generateObject`):
```typescript
{
  duplicateOf: string | null,     // existing event ID
  situationId: string | null,     // existing situation ID
  newSituation: {                 // only if significant and no match
    title: string,
    summary: string,
  } | null
}
```

**Decision logic**:
- `duplicateOf` set: merge into existing event (max severity, aggregate sources)
- `situationId` set: insert new event, link to existing situation
- `newSituation` set: insert event + create new situation
- All null: insert standalone event (minor one-off)

### Pipeline Flow

```
RawEvent → [classify if OSINT] → findNearbyEvents(50km, 6h)
                                → findActiveSituations(500km)
                                → LLM judgment call
                                → merge / insert+link / insert+createSituation / insert
```

---

## Schema Changes

### New Table: `situations`

```sql
situations:
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
  title          TEXT NOT NULL
  summary        TEXT NOT NULL
  category       TEXT NOT NULL (EventCategory)
  severity       INTEGER NOT NULL (1-5, max across linked events)
  countryCode    TEXT (2-char ISO, nullable)
  location       GEOGRAPHY(Point, 4326) NOT NULL (centroid)
  radiusKm       INTEGER NOT NULL DEFAULT 50
  eventCount     INTEGER NOT NULL DEFAULT 1
  firstSeen      TIMESTAMP WITH TIME ZONE NOT NULL
  lastUpdated    TIMESTAMP WITH TIME ZONE NOT NULL
  status         TEXT NOT NULL DEFAULT 'active' ('active' | 'resolved')
  createdAt      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  updatedAt      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
```

Indexes: `(category, status)`, `(status, lastUpdated)`, spatial on `location`.

### Events Table Changes

- Rename `clusterId` → `situationId` (UUID, nullable, FK to situations)

---

## Windows

| Purpose | Spatial | Temporal | Rationale |
|---------|---------|----------|-----------|
| Dedup candidates | 50km | 6h | Same incident, different sources. Most duplicates arrive within minutes. 50km covers geocoding imprecision. |
| Situation matching | 500km | No limit (active only) | Related events in a region. Wars, wildfire seasons, earthquake sequences span weeks. LLM is the real judge; radius just selects candidates. |

---

## Situation Lifecycle

- **Created**: LLM determines a non-duplicate event warrants a new situation.
- **Updated**: On each new linked event — bump `eventCount`, `lastUpdated`, take max `severity`. Refresh `summary` via LLM every 5th linked event (not every time).
- **Resolved**: Cron/scheduled job marks situations "resolved" after 48h with no new events. Resolved situations stop matching but remain queryable.

---

## LLM Prompt Design

Single system prompt for the judgment call. Receives new event + candidates + situations as structured context. Key instructions:

- **Dedup**: "Are these describing the same real-world incident? Different sources reporting the same event = duplicate. Aftershocks or follow-up events = NOT duplicates."
- **Situation**: "Does this event belong to an ongoing situation? Group by: same conflict/crisis, same natural disaster sequence, same disease outbreak. Do NOT group unrelated events just because they're nearby."
- **New situation threshold**: "Create a new situation only for significant events likely to have follow-ups. A single minor incident doesn't need a situation."

Uses the same Groq/Llama 3.1 8B Instant model as the classifier (`@ai-sdk/groq` + `generateObject`). Cost: free at current volume (Groq free tier). Falls within existing rate limits since it's one call per event, same as classification.

---

## Merge Strategy (Unchanged)

When `duplicateOf` is set:
- Severity: max(existing, new)
- Sources: append, deduplicate by adapter name
- Location: keep existing
- Timestamp: keep existing
- Media: append new media items

---

## DB Queries Needed

1. `findNearbyEvents(lat, lng, category, 50km, 6h)` — already exists
2. `findActiveSituations(lat, lng, category, 500km)` — new query
3. `createSituation(title, summary, category, ...)` — new
4. `linkEventToSituation(eventId, situationId)` — update event's situationId
5. `updateSituation(id, { eventCount, severity, lastUpdated, summary? })` — new
6. `resolveExpiredSituations(olderThan: 48h)` — new, for cron

---

## What's NOT In Scope

- Frontend situation UI (cards, map polygons, drill-down) — future work
- Situation API endpoints — future work
- Retroactive situation assignment for existing events — future work
- Cross-category situations (earthquake triggering tsunami) — keep simple for now

---

## Tech Stack

- **LLM**: Groq Llama 3.1 8B Instant (via `@ai-sdk/groq` + Vercel AI SDK `generateObject`)
- **Same model as classifier** — no new dependencies. The judgment call uses the same `createGroq()` instance.
- **Cost**: Free tier at current volume (~1000 events/day). Groq free tier allows 30 req/min, 14400 req/day.

## Cost Impact

| Current | After |
|---------|-------|
| 1 Groq call per OSINT event (classification) | 1 classification + 1 judgment per OSINT event |
| 0 LLM calls per structured event | 1 judgment per structured event |

All calls use Groq free tier. At 1000 events/day we'd use ~2000 calls/day (well within 14400 limit). The judgment call is lightweight (~500 input tokens, ~100 output).
