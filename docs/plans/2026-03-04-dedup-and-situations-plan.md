# Smart Dedup + Situations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Jaccard-based dedup with LLM judgment and add a `situations` table for tracking ongoing hotspots.

**Architecture:** A new `situations` table tracks named, ongoing crises. The `Deduplicator` is replaced by a `JudgmentCall` module that sends one LLM request per event to handle both dedup and situation assignment. The pipeline orchestrates: classify (OSINT only) → find candidates → judgment call → merge/insert/link.

**Tech Stack:** Drizzle ORM, PostGIS, Groq Llama 3.1 8B (`@ai-sdk/groq` + `generateObject`), Zod, Vitest

**Design doc:** `docs/plans/2026-03-04-dedup-and-situations-design.md`

---

### Task 1: Add `situations` table to DB schema

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/shared/src/types/event.ts` (update `NormalizedEvent` to use `situationId`)

**Step 1: Add the situations table and rename clusterId → situationId**

In `packages/db/src/schema.ts`, add after the `events` table definition:

```typescript
export const situations = pgTable(
  "situations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    category: text("category").$type<EventCategory>().notNull(),
    severity: integer("severity").notNull(),
    countryCode: text("country_code"),
    location: geographyPoint("location").notNull(),
    radiusKm: integer("radius_km").notNull().default(50),
    eventCount: integer("event_count").notNull().default(1),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
    lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull(),
    status: text("status").$type<"active" | "resolved">().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("situations_category_status_idx").on(table.category, table.status),
    index("situations_status_last_updated_idx").on(table.status, table.lastUpdated),
  ],
);

export type Situation = typeof situations.$inferSelect;
export type NewSituation = typeof situations.$inferInsert;
```

In the `events` table, rename `clusterId` to `situationId`:

```typescript
// Change this line:
clusterId: uuid("cluster_id"),
// To:
situationId: uuid("situation_id"),
```

In `packages/shared/src/types/event.ts`, rename `clusterId` → `situationId` in `NormalizedEventSchema`:

```typescript
// Change:
clusterId: z.string().uuid().optional(),
// To:
situationId: z.string().uuid().optional(),
```

**Step 2: Push schema to Neon**

Run: `pnpm db:push`
Expected: Schema changes applied (new `situations` table, renamed column)

Note: If `db:push` doesn't handle the rename cleanly, you may need to do it in two steps — add `situation_id`, migrate data from `cluster_id` (all NULL anyway), drop `cluster_id`. Since `cluster_id` is always NULL, a simple drop+add is safe.

**Step 3: Export new types from db package**

In `packages/db/src/schema.ts`, ensure exports include:
```typescript
export { situations, type Situation, type NewSituation } from "./schema.js";
```

Update `packages/db/src/index.ts` if needed to re-export the new types.

**Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (may need to fix references to `clusterId` elsewhere — check `apps/collector/src/pipeline.ts` where it builds the normalized event)

**Step 5: Commit**

```bash
git add packages/db packages/shared
git commit -m "feat: add situations table, rename clusterId to situationId"
```

---

### Task 2: Add situation DB queries

**Files:**
- Create: `packages/db/src/queries/situations.ts`
- Create: `packages/db/src/queries/__tests__/situations.test.ts`
- Modify: `packages/db/src/queries/index.ts` (re-export)

**Step 1: Write tests for situation queries**

Create `packages/db/src/queries/__tests__/situations.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
// These are unit tests for query builder logic, not integration tests.
// We test the exported functions exist and have correct signatures.
// Full integration tests require a PostGIS database.

import {
  findActiveSituations,
  createSituation,
  updateSituation,
  resolveExpiredSituations,
} from "../situations.js";

describe("situations queries", () => {
  it("exports findActiveSituations", () => {
    expect(typeof findActiveSituations).toBe("function");
  });

  it("exports createSituation", () => {
    expect(typeof createSituation).toBe("function");
  });

  it("exports updateSituation", () => {
    expect(typeof updateSituation).toBe("function");
  });

  it("exports resolveExpiredSituations", () => {
    expect(typeof resolveExpiredSituations).toBe("function");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @travelrisk/db test`
Expected: FAIL — module not found

**Step 3: Implement situation queries**

Create `packages/db/src/queries/situations.ts`:

```typescript
import { sql, and, eq, gte, lte, desc } from "drizzle-orm";
import { situations, type Situation, type NewSituation } from "../schema.js";
import type { HttpClient, PoolClient } from "../client.js";
import type { EventCategory } from "@travelrisk/shared";

type DbClient = HttpClient | PoolClient;

export interface SituationWithCoords extends Situation {
  lng: number;
  lat: number;
}

/**
 * Find active situations within a radius of a point, filtered by category.
 * Used to find candidate situations for the LLM judgment call.
 */
export async function findActiveSituations(
  db: DbClient,
  lat: number,
  lng: number,
  category: EventCategory,
  withinKm: number = 500,
): Promise<SituationWithCoords[]> {
  const rows = await db
    .select({
      situation: situations,
      lng: sql<number>`ST_X(${situations.location}::geometry)`,
      lat: sql<number>`ST_Y(${situations.location}::geometry)`,
    })
    .from(situations)
    .where(
      and(
        eq(situations.status, "active"),
        eq(situations.category, category),
        sql`ST_DWithin(${situations.location}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${withinKm * 1000})`,
      ),
    )
    .orderBy(desc(situations.lastUpdated));

  return rows.map((row) => ({
    ...row.situation,
    lng: row.lng,
    lat: row.lat,
  }));
}

/**
 * Create a new situation. Called when the LLM decides an event starts a new hotspot.
 */
export async function createSituation(
  db: DbClient,
  data: {
    title: string;
    summary: string;
    category: EventCategory;
    severity: number;
    countryCode: string | null;
    lat: number;
    lng: number;
  },
): Promise<Situation> {
  const now = new Date();
  const [inserted] = await db
    .insert(situations)
    .values({
      title: data.title,
      summary: data.summary,
      category: data.category,
      severity: data.severity,
      countryCode: data.countryCode,
      location: sql`ST_SetSRID(ST_MakePoint(${data.lng}, ${data.lat}), 4326)::geography`,
      eventCount: 1,
      firstSeen: now,
      lastUpdated: now,
    })
    .returning();

  return inserted;
}

/**
 * Update a situation when a new event is linked to it.
 * Bumps eventCount, takes max severity, refreshes lastUpdated.
 */
export async function updateSituation(
  db: DbClient,
  id: string,
  data: {
    severity: number;
    summary?: string;
  },
): Promise<Situation> {
  const now = new Date();
  const [updated] = await db
    .update(situations)
    .set({
      eventCount: sql`${situations.eventCount} + 1`,
      severity: sql`GREATEST(${situations.severity}, ${data.severity})`,
      lastUpdated: now,
      updatedAt: now,
      ...(data.summary ? { summary: data.summary } : {}),
    })
    .where(eq(situations.id, id))
    .returning();

  return updated;
}

/**
 * Mark situations as resolved if they haven't had new events in `hoursIdle` hours.
 * Intended to be called by a cron job / scheduled task.
 */
export async function resolveExpiredSituations(
  db: DbClient,
  hoursIdle: number = 48,
): Promise<number> {
  const cutoff = new Date(Date.now() - hoursIdle * 60 * 60 * 1000);

  const result = await db
    .update(situations)
    .set({ status: "resolved", updatedAt: new Date() })
    .where(
      and(
        eq(situations.status, "active"),
        lte(situations.lastUpdated, cutoff),
      ),
    )
    .returning({ id: situations.id });

  return result.length;
}
```

**Step 4: Export from queries index**

In `packages/db/src/queries/index.ts`, add:
```typescript
export * from "./situations.js";
```

**Step 5: Run tests to verify they pass**

Run: `pnpm --filter @travelrisk/db test`
Expected: PASS

**Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/db
git commit -m "feat: add situation DB queries (find, create, update, resolve)"
```

---

### Task 3: Create the LLM judgment module

**Files:**
- Create: `apps/collector/src/processing/judgment.ts`
- Create: `apps/collector/src/processing/__tests__/judgment.test.ts`

**Step 1: Write tests for the judgment module**

Create `apps/collector/src/processing/__tests__/judgment.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { judgmentSchema } from "../judgment.js";

describe("judgment", () => {
  it("schema accepts duplicate result", () => {
    const result = judgmentSchema.parse({
      duplicateOf: "abc-123",
      situationId: null,
      newSituation: null,
    });
    expect(result.duplicateOf).toBe("abc-123");
  });

  it("schema accepts existing situation result", () => {
    const result = judgmentSchema.parse({
      duplicateOf: null,
      situationId: "sit-456",
      newSituation: null,
    });
    expect(result.situationId).toBe("sit-456");
  });

  it("schema accepts new situation result", () => {
    const result = judgmentSchema.parse({
      duplicateOf: null,
      situationId: null,
      newSituation: {
        title: "Amazon Wildfire Season 2026",
        summary: "Widespread fires across the Amazon basin",
      },
    });
    expect(result.newSituation?.title).toBe("Amazon Wildfire Season 2026");
  });

  it("schema accepts standalone result (all null)", () => {
    const result = judgmentSchema.parse({
      duplicateOf: null,
      situationId: null,
      newSituation: null,
    });
    expect(result.duplicateOf).toBeNull();
    expect(result.situationId).toBeNull();
    expect(result.newSituation).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @travelrisk/collector test`
Expected: FAIL — module not found

**Step 3: Implement the judgment module**

Create `apps/collector/src/processing/judgment.ts`:

```typescript
import { generateObject } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";
import type { EventWithCoords } from "@travelrisk/db";
import type { SituationWithCoords } from "@travelrisk/db";

export const judgmentSchema = z.object({
  duplicateOf: z
    .string()
    .nullable()
    .describe("ID of existing event this is a duplicate of, or null"),
  situationId: z
    .string()
    .nullable()
    .describe("ID of existing situation this belongs to, or null"),
  newSituation: z
    .object({
      title: z.string().max(120).describe("Short name for the ongoing situation"),
      summary: z.string().max(500).describe("Brief description of the situation"),
    })
    .nullable()
    .describe("If this event starts a new situation, provide title and summary. Otherwise null."),
});

export type JudgmentResult = z.infer<typeof judgmentSchema>;

const SYSTEM_PROMPT = `You are a deduplication and situation-tracking engine for a global event monitoring system.

You receive a NEW EVENT and two lists of candidates:
1. CANDIDATE DUPLICATES — recent nearby events that might be the same incident
2. ACTIVE SITUATIONS — ongoing crises/hotspots in the region

Your job is to decide THREE things:

## Duplicate Detection
- If the new event describes the SAME real-world incident as a candidate (same earthquake, same attack, same fire), set duplicateOf to that candidate's ID.
- Different sources reporting the same incident = DUPLICATE.
- Aftershocks, follow-up attacks, new fire spots in a different location = NOT duplicates (they are separate events that may belong to a situation).
- When in doubt, it is NOT a duplicate.

## Situation Assignment
- If the new event belongs to an ongoing situation (same conflict, same disaster sequence, same outbreak), set situationId to that situation's ID.
- Examples of situations: "Russia-Ukraine Conflict", "Turkey Earthquake Sequence", "Amazon Wildfire Season".
- Do NOT group unrelated events just because they are nearby.

## New Situation Creation
- If the event is significant and likely to have follow-up events but doesn't match any existing situation, create a new one.
- Minor one-off incidents (a single small fire, a minor traffic accident) do NOT need a situation.
- Set newSituation with a short, descriptive title and summary.

## Rules
- duplicateOf and situationId are mutually exclusive with each other (a duplicate doesn't need a situation link).
- If it's a duplicate, set duplicateOf only. Leave situationId and newSituation as null.
- If it's not a duplicate but belongs to a situation, set situationId only.
- If it starts a new situation, set newSituation only.
- If it's a standalone minor event, set all three to null.`;

const groq = createGroq();

function formatCandidates(events: EventWithCoords[]): string {
  if (events.length === 0) return "None";
  return events
    .map(
      (e) =>
        `- ID: ${e.id} | "${e.title}" | ${e.locationName} | ${new Date(e.timestamp).toISOString()}`,
    )
    .join("\n");
}

function formatSituations(situations: SituationWithCoords[]): string {
  if (situations.length === 0) return "None";
  return situations
    .map(
      (s) =>
        `- ID: ${s.id} | "${s.title}" | ${s.eventCount} events | last updated ${new Date(s.lastUpdated).toISOString()}`,
    )
    .join("\n");
}

export class Judgment {
  private model: string;

  constructor(model = "llama-3.1-8b-instant") {
    this.model = model;
  }

  async call(
    newEvent: {
      title: string;
      summary: string;
      category: string;
      locationName: string;
      timestamp: string;
    },
    candidateDuplicates: EventWithCoords[],
    activeSituations: SituationWithCoords[],
  ): Promise<JudgmentResult> {
    // If no candidates and no situations, skip the LLM call entirely
    if (candidateDuplicates.length === 0 && activeSituations.length === 0) {
      return { duplicateOf: null, situationId: null, newSituation: null };
    }

    try {
      const { object } = await generateObject({
        model: groq(this.model),
        schema: judgmentSchema,
        system: SYSTEM_PROMPT,
        prompt: `NEW EVENT:
Title: "${newEvent.title}"
Summary: "${newEvent.summary}"
Category: ${newEvent.category}
Location: ${newEvent.locationName}
Time: ${newEvent.timestamp}

CANDIDATE DUPLICATES (nearby events, same category, last 6h):
${formatCandidates(candidateDuplicates)}

ACTIVE SITUATIONS (ongoing, same category, within 500km):
${formatSituations(activeSituations)}`,
      });

      return object;
    } catch (err: unknown) {
      console.error(
        "[judgment] LLM judgment error:",
        err instanceof Error ? err.message : err,
      );
      // On error, fall through — treat as standalone event
      return { duplicateOf: null, situationId: null, newSituation: null };
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @travelrisk/collector test`
Expected: PASS (schema validation tests pass; LLM call tests are not run — they'd need mocking)

**Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/collector/src/processing/judgment.ts apps/collector/src/processing/__tests__/judgment.test.ts
git commit -m "feat: add LLM judgment module for dedup + situation assignment"
```

---

### Task 4: Update pipeline to use judgment instead of Jaccard dedup

**Files:**
- Modify: `apps/collector/src/pipeline.ts`
- Modify: `apps/collector/src/processing/deduplicator.ts` (can be deleted or kept for `merge()` only)

**Step 1: Read the full pipeline.ts to understand the current flow**

Read `apps/collector/src/pipeline.ts` carefully. The two methods to modify are `processStructured()` and `processOsint()`. Both currently:
1. Call `deduplicator.findDuplicate()`
2. If duplicate: call `deduplicator.merge()` + `upsertEvent()`
3. If not: `insertEvent()`

**Step 2: Update pipeline constructor and imports**

Add imports at the top of `pipeline.ts`:

```typescript
import { Judgment } from "./processing/judgment.js";
import { findActiveSituations, createSituation, updateSituation } from "@travelrisk/db";
```

In the `Pipeline` constructor, add:
```typescript
private judgment: Judgment;
```

Initialize it alongside existing services:
```typescript
this.judgment = new Judgment();
```

**Step 3: Create a shared judgment+action helper**

Add a private method to Pipeline that replaces the duplicated dedup logic in both `processStructured` and `processOsint`:

```typescript
private async judgeAndAct(params: {
  title: string;
  summary: string;
  category: EventCategory;
  severity: number;
  confidence: number;
  lat: number;
  lng: number;
  locationName: string;
  countryCode: string | null;
  timestamp: string;
  sources: EventSource[];
  media: MediaItem[];
  rawText: string | null;
  expiresAt?: string;
}): Promise<Event> {
  const { lat, lng, category, title, summary, locationName, timestamp } = params;

  // Find candidates for LLM judgment
  const candidateDuplicates = await findNearbyEvents(this.db, lat, lng, category, 50, 6);
  const activeSituations = await findActiveSituations(this.db, lat, lng, category, 500);

  // Ask the LLM
  const judgment = await this.judgment.call(
    { title, summary, category, locationName, timestamp },
    candidateDuplicates,
    activeSituations,
  );

  // Handle duplicate
  if (judgment.duplicateOf) {
    const existing = candidateDuplicates.find((e) => e.id === judgment.duplicateOf);
    if (existing) {
      const merged = this.deduplicator.merge(existing, params.severity, params.sources);
      return upsertEvent(this.db, {
        ...params,
        existingId: merged.existingId,
        severity: merged.severity,
        sources: merged.sources as EventSource[],
        situationId: existing.situationId,
      });
    }
  }

  // Handle existing situation
  if (judgment.situationId) {
    const event = await insertEvent(this.db, {
      ...params,
      situationId: judgment.situationId,
    });
    await updateSituation(this.db, judgment.situationId, {
      severity: params.severity,
    });
    return event;
  }

  // Handle new situation
  if (judgment.newSituation) {
    const situation = await createSituation(this.db, {
      title: judgment.newSituation.title,
      summary: judgment.newSituation.summary,
      category,
      severity: params.severity,
      countryCode: params.countryCode,
      lat,
      lng,
    });
    return insertEvent(this.db, {
      ...params,
      situationId: situation.id,
    });
  }

  // Standalone event
  return insertEvent(this.db, params);
}
```

**Step 4: Replace dedup calls in processStructured and processOsint**

In both methods, replace the `findDuplicate` → `merge`/`insert` logic with a single call to `this.judgeAndAct(...)`. The event params are already assembled at this point — just pass them through.

Keep `this.deduplicator` instantiated because `merge()` is still used for source aggregation when a duplicate is found.

**Step 5: Typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/collector
git commit -m "feat: replace Jaccard dedup with LLM judgment in pipeline"
```

---

### Task 5: Update deduplicator — keep merge(), remove findDuplicate()

**Files:**
- Modify: `apps/collector/src/processing/deduplicator.ts`
- Modify: `apps/collector/src/processing/__tests__/deduplicator.test.ts`

**Step 1: Simplify deduplicator**

The `Deduplicator` class no longer needs `findDuplicate()` or `jaccardSimilarity()`. Keep only `merge()` since the pipeline still uses it for source aggregation.

Remove `jaccardSimilarity()`, `findDuplicate()`, `DeduplicationResult` interface, and the `similarityThreshold` constructor parameter.

Update the class to:

```typescript
export class Deduplicator {
  /**
   * Merge a new event with an existing duplicate:
   * - Keep the higher severity
   * - Aggregate sources, deduplicate by adapter name
   */
  merge(
    existing: EventWithCoords,
    newSeverity: number,
    newSources: unknown[],
  ): MergeResult {
    // ... keep existing merge logic unchanged ...
  }
}
```

The constructor no longer needs a `db` parameter — it's just a stateless merge utility now.

**Step 2: Update tests**

Remove tests for `jaccardSimilarity` and `findDuplicate`. Keep the merge/source-dedup tests.

**Step 3: Update pipeline constructor**

The `Deduplicator` no longer needs `db` in its constructor:

```typescript
// Before:
this.deduplicator = new Deduplicator(this.db);
// After:
this.deduplicator = new Deduplicator();
```

**Step 4: Typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/collector
git commit -m "refactor: simplify deduplicator to merge-only utility"
```

---

### Task 6: Add situation expiry (resolve stale situations)

**Files:**
- Modify: `apps/collector/src/pipeline.ts` (or a new scheduled job file)

**Step 1: Add a periodic resolution check**

The simplest approach: run `resolveExpiredSituations()` on a timer inside the collector process (it's already a long-running Node.js process).

In the collector's main entry point (likely `apps/collector/src/index.ts`), add a periodic call:

```typescript
import { resolveExpiredSituations } from "@travelrisk/db";

// Run every hour — resolve situations with no events in 48h
setInterval(async () => {
  try {
    const count = await resolveExpiredSituations(db, 48);
    if (count > 0) {
      console.log(`[situations] Resolved ${count} expired situations`);
    }
  } catch (err) {
    console.error("[situations] Error resolving expired:", err);
  }
}, 60 * 60 * 1000);
```

**Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/collector
git commit -m "feat: add hourly situation expiry check (48h idle → resolved)"
```

---

### Task 7: Build verification and integration test

**Files:**
- No new files

**Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: All 4 packages pass

**Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Build all packages**

Run: `pnpm build`
Expected: Clean build

**Step 4: Verify schema can be pushed**

Run: `pnpm db:push --dry-run` (if supported) or review the schema diff manually.

**Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final cleanup for smart dedup + situations"
```

---

## Task Dependency Graph

```
Task 1 (schema) ──→ Task 2 (queries) ──→ Task 3 (judgment module)
                                                    │
                                                    ▼
                                          Task 4 (pipeline update)
                                                    │
                                                    ▼
                                          Task 5 (simplify deduplicator)
                                                    │
                                                    ▼
                                          Task 6 (situation expiry)
                                                    │
                                                    ▼
                                          Task 7 (verification)
```

Tasks are sequential — each depends on the previous.
