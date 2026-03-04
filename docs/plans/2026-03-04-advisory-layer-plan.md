# Advisory Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate travel advisories from live events — advisories become a choropleth map overlay, not situations.

**Architecture:** New `advisories` table stores country-level risk data. The US Travel Advisories adapter writes directly to it (bypassing the event pipeline). The web app fetches advisories via a new API endpoint and feeds them to the existing `ChoroplethLayer`. Old advisory-sourced events/situations are cleaned up.

**Tech Stack:** Drizzle ORM, Next.js API routes, MapLibre GL JS (existing ChoroplethLayer), Neon PostgreSQL

---

### Task 1: Add advisories table to DB schema

**Files:**
- Modify: `packages/db/src/schema.ts`

**Step 1: Add the advisories table definition**

Add after the `situations` table definition (after line 94):

```typescript
export const advisories = pgTable("advisories", {
  countryCode: text("country_code").primaryKey(),
  level: integer("level").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceName: text("source_name").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Advisory = typeof advisories.$inferSelect;
export type NewAdvisory = typeof advisories.$inferInsert;
```

**Step 2: Push schema to Neon**

Run: `cd /Users/simone/Repos/personal/sitalert && pnpm db:push`
Expected: Table `advisories` created successfully

**Step 3: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat: add advisories table schema"
```

---

### Task 2: Add advisory DB queries

**Files:**
- Create: `packages/db/src/queries/advisories.ts`
- Modify: `packages/db/src/queries/index.ts`

**Step 1: Create the advisory queries module**

Create `packages/db/src/queries/advisories.ts`:

```typescript
import { advisories, type Advisory } from "../schema";
import type { HttpClient, PoolClient } from "../client";

type DbClient = HttpClient | PoolClient;

export async function upsertAdvisory(
  db: DbClient,
  data: {
    countryCode: string;
    level: number;
    title: string;
    summary: string;
    sourceUrl: string;
    sourceName: string;
    updatedAt: Date;
  },
): Promise<void> {
  await db
    .insert(advisories)
    .values(data)
    .onConflictDoUpdate({
      target: advisories.countryCode,
      set: {
        level: data.level,
        title: data.title,
        summary: data.summary,
        sourceUrl: data.sourceUrl,
        sourceName: data.sourceName,
        updatedAt: data.updatedAt,
      },
    });
}

export async function queryAllAdvisories(
  db: DbClient,
): Promise<Advisory[]> {
  return db.select().from(advisories);
}
```

**Step 2: Export from queries index**

Add to `packages/db/src/queries/index.ts`:

```typescript
export {
  upsertAdvisory,
  queryAllAdvisories,
  type Advisory,
} from "./advisories";
```

Note: `Advisory` type is already exported from schema, but re-exporting from queries keeps the public API consistent.

**Step 3: Commit**

```bash
git add packages/db/src/queries/advisories.ts packages/db/src/queries/index.ts
git commit -m "feat: add advisory upsert and query functions"
```

---

### Task 3: Rewrite US Travel Advisories adapter

**Files:**
- Modify: `apps/collector/src/adapters/us-travel-advisories.ts`

**Step 1: Rewrite the adapter to upsert advisories directly**

Replace the entire file with:

```typescript
import { z } from "zod";
import { upsertAdvisory } from "@travelrisk/db/queries";
import type { PoolClient } from "@travelrisk/db/client";

const AdvisorySchema = z.object({
  Title: z.string(),
  Category: z.array(z.string()),
  Summary: z.string(),
  Published: z.string(),
  Updated: z.string(),
  Link: z.string().url(),
  id: z.string(),
});

const ApiResponseSchema = z.array(AdvisorySchema);

function parseAdvisoryLevel(title: string): number {
  const match = title.match(/Level\s+(\d)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const API_URL = "https://cadataapi.state.gov/api/TravelAdvisories";
const SOURCE_NAME = "us-travel-advisories";

export async function syncTravelAdvisories(db: PoolClient): Promise<number> {
  const res = await fetch(API_URL);
  if (!res.ok) {
    throw new Error(
      `US Travel Advisories API returned ${res.status}: ${res.statusText}`,
    );
  }

  const data: unknown = await res.json();
  const advisories = ApiResponseSchema.parse(data);
  let count = 0;

  for (const advisory of advisories) {
    const level = parseAdvisoryLevel(advisory.Title);
    if (level === 0) continue;

    const countryCode = advisory.Category[0]?.trim().toUpperCase() ?? "";
    if (!countryCode) continue;

    const plainSummary = stripHtml(advisory.Summary);

    await upsertAdvisory(db, {
      countryCode,
      level,
      title: advisory.Title,
      summary: plainSummary.slice(0, 1000),
      sourceUrl: advisory.Link,
      sourceName: SOURCE_NAME,
      updatedAt: new Date(advisory.Updated),
    });
    count++;
  }

  console.log(`[${SOURCE_NAME}] Synced ${count} advisories`);
  return count;
}
```

Key changes:
- No longer extends `BaseAdapter` — it's a standalone async function
- Upserts directly to advisories table, no event pipeline
- Fetches ALL levels (1-4), not just 3+
- No longer needs `seenKeys` dedup — upsert handles it

**Step 2: Commit**

```bash
git add apps/collector/src/adapters/us-travel-advisories.ts
git commit -m "feat: rewrite US advisory adapter to upsert directly"
```

---

### Task 4: Update collector to run advisory sync

**Files:**
- Modify: `apps/collector/src/index.ts`

**Step 1: Replace the adapter registration with a periodic sync**

Remove the old adapter import and registration. Replace with a direct call.

Remove from imports (line 25):
```typescript
import { UsTravelAdvisoriesAdapter } from "./adapters/us-travel-advisories";
```

Add import:
```typescript
import { syncTravelAdvisories } from "./adapters/us-travel-advisories";
```

Replace the travel advisories section (lines 188-196). The old code:
```typescript
  // Travel advisories
  const travelConfig = osintConfig["travel_advisories"];
  if (travelConfig && typeof travelConfig === "object" && "enabled" in travelConfig && travelConfig.enabled) {
    const usAdapter = new UsTravelAdvisoriesAdapter();
    adapters.push(usAdapter);

    const vsAdapter = new ViaggiareSicuriAdapter();
    adapters.push(vsAdapter);
  }
```

New code:
```typescript
  // Travel advisories
  const travelConfig = osintConfig["travel_advisories"];
  if (travelConfig && typeof travelConfig === "object" && "enabled" in travelConfig && travelConfig.enabled) {
    // US advisories — sync directly to advisories table (not event pipeline)
    syncTravelAdvisories(db).catch((err: unknown) => {
      console.error("[collector] US advisory sync failed:", err instanceof Error ? err.message : err);
    });

    // ViaggiareSicuri — actual breaking news events, keep in event pipeline
    const vsAdapter = new ViaggiareSicuriAdapter();
    adapters.push(vsAdapter);
  }
```

Add a periodic re-sync (add after the situation expiry interval, around line 267):

```typescript
  // Re-sync travel advisories every 12 hours
  if (travelConfig && typeof travelConfig === "object" && "enabled" in travelConfig && travelConfig.enabled) {
    setInterval(() => {
      syncTravelAdvisories(db).catch((err: unknown) => {
        console.error("[collector] US advisory sync failed:", err instanceof Error ? err.message : err);
      });
    }, 12 * 60 * 60 * 1000);
  }
```

**Step 2: Verify build**

Run: `cd /Users/simone/Repos/personal/sitalert && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/collector/src/index.ts
git commit -m "feat: run US advisory sync outside event pipeline"
```

---

### Task 5: Add /api/advisories endpoint

**Files:**
- Create: `apps/web/src/app/api/advisories/route.ts`

**Step 1: Create the endpoint**

Create `apps/web/src/app/api/advisories/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createHttpClient } from "@travelrisk/db/client";
import { queryAllAdvisories } from "@travelrisk/db/queries";

export async function GET() {
  try {
    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const db = createHttpClient(databaseUrl);
    const advisories = await queryAllAdvisories(db);

    return NextResponse.json({ data: advisories });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("Advisories API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: Add client fetch function**

Add to `apps/web/src/lib/api-client.ts`:

```typescript
export interface AdvisoryData {
  countryCode: string;
  level: number;
  title: string;
  summary: string;
  sourceUrl: string;
  sourceName: string;
  updatedAt: string;
}

export async function fetchAdvisories(
  signal?: AbortSignal,
): Promise<AdvisoryData[]> {
  const response = await fetch("/api/advisories", { signal });

  if (!response.ok) {
    throw new Error(`Failed to fetch advisories: ${response.status}`);
  }

  const json = await response.json();
  return json.data as AdvisoryData[];
}
```

**Step 3: Commit**

```bash
git add apps/web/src/app/api/advisories/route.ts apps/web/src/lib/api-client.ts
git commit -m "feat: add /api/advisories endpoint and client"
```

---

### Task 6: Replace compute-country-risk with advisory levels

**Files:**
- Modify: `apps/web/src/lib/compute-country-risk.ts`
- Modify: `apps/web/src/lib/compute-country-risk.test.ts`

**Step 1: Replace the module**

Replace the entire content of `apps/web/src/lib/compute-country-risk.ts`:

```typescript
import type { AdvisoryData } from "./api-client";

/**
 * Build a Map of country code -> advisory level from advisory data.
 * Used by ChoroplethLayer to color countries.
 */
export function buildAdvisoryScores(
  advisories: AdvisoryData[],
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const a of advisories) {
    scores.set(a.countryCode.toUpperCase(), a.level);
  }
  return scores;
}

/** Advisory level colors (hex for MapLibre GL compatibility) */
const ADVISORY_COLORS: Record<number, string> = {
  1: "transparent",       // Exercise Normal Precautions — no fill
  2: "#E2B553",           // Exercise Increased Caution — faint amber
  3: "#D48A2E",           // Reconsider Travel — orange
  4: "#8B2D15",           // Do Not Travel — deep red
};

/** Map an advisory level (1-4) to a fill color string. */
export function advisoryColor(level: number): string {
  return ADVISORY_COLORS[level] ?? "transparent";
}

/** Exported for legend rendering. */
export const ADVISORY_LEVELS = [
  { label: "Caution", level: 2, color: ADVISORY_COLORS[2] },
  { label: "Reconsider", level: 3, color: ADVISORY_COLORS[3] },
  { label: "Do Not Travel", level: 4, color: ADVISORY_COLORS[4] },
] as const;
```

**Step 2: Update the test file**

Replace `apps/web/src/lib/compute-country-risk.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildAdvisoryScores, advisoryColor, ADVISORY_LEVELS } from "./compute-country-risk";

describe("buildAdvisoryScores", () => {
  it("builds map from advisory data", () => {
    const advisories = [
      { countryCode: "SY", level: 4, title: "", summary: "", sourceUrl: "", sourceName: "", updatedAt: "" },
      { countryCode: "FR", level: 1, title: "", summary: "", sourceUrl: "", sourceName: "", updatedAt: "" },
    ];
    const scores = buildAdvisoryScores(advisories);
    expect(scores.get("SY")).toBe(4);
    expect(scores.get("FR")).toBe(1);
    expect(scores.size).toBe(2);
  });

  it("uppercases country codes", () => {
    const advisories = [
      { countryCode: "sy", level: 4, title: "", summary: "", sourceUrl: "", sourceName: "", updatedAt: "" },
    ];
    const scores = buildAdvisoryScores(advisories);
    expect(scores.get("SY")).toBe(4);
  });
});

describe("advisoryColor", () => {
  it("returns transparent for level 1", () => {
    expect(advisoryColor(1)).toBe("transparent");
  });

  it("returns amber for level 2", () => {
    expect(advisoryColor(2)).toBe("#E2B553");
  });

  it("returns orange for level 3", () => {
    expect(advisoryColor(3)).toBe("#D48A2E");
  });

  it("returns deep red for level 4", () => {
    expect(advisoryColor(4)).toBe("#8B2D15");
  });

  it("returns transparent for unknown levels", () => {
    expect(advisoryColor(0)).toBe("transparent");
    expect(advisoryColor(5)).toBe("transparent");
  });
});

describe("ADVISORY_LEVELS", () => {
  it("has 3 visible levels for legend (excludes level 1)", () => {
    expect(ADVISORY_LEVELS).toHaveLength(3);
    expect(ADVISORY_LEVELS[0].level).toBe(2);
  });
});
```

**Step 3: Run tests**

Run: `cd /Users/simone/Repos/personal/sitalert && pnpm test -- apps/web/src/lib/compute-country-risk.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add apps/web/src/lib/compute-country-risk.ts apps/web/src/lib/compute-country-risk.test.ts
git commit -m "feat: replace severity-sum risk with advisory levels"
```

---

### Task 7: Update ChoroplethLayer to use advisory colors

**Files:**
- Modify: `apps/web/src/components/map/choropleth-layer.tsx`

**Step 1: Switch from riskColor to advisoryColor**

In `apps/web/src/components/map/choropleth-layer.tsx`:

Change the import (line 3):
```typescript
// Old:
import { riskColor } from "@/lib/compute-country-risk";
// New:
import { advisoryColor } from "@/lib/compute-country-risk";
```

Update `buildFillColorExpression` (line 29): change `riskColor(score)` to `advisoryColor(score)`.

**Step 2: Commit**

```bash
git add apps/web/src/components/map/choropleth-layer.tsx
git commit -m "refactor: use advisory colors in choropleth layer"
```

---

### Task 8: Wire advisories into MainPage

**Files:**
- Modify: `apps/web/src/components/main-page.tsx`
- Modify: `apps/web/src/components/map/map-legend.tsx`

**Step 1: Fetch advisories and feed to choropleth**

In `apps/web/src/components/main-page.tsx`:

Replace the import:
```typescript
// Old:
import { computeCountryRisk } from "@/lib/compute-country-risk";
// New:
import { buildAdvisoryScores } from "@/lib/compute-country-risk";
import { fetchAdvisories, type AdvisoryData } from "@/lib/api-client";
```

Add advisory state and fetch (after the `useEventStream` line, around line 35):

```typescript
  const [advisories, setAdvisories] = useState<AdvisoryData[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetchAdvisories(controller.signal)
      .then(setAdvisories)
      .catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Failed to fetch advisories:", err.message);
        }
      });
    return () => controller.abort();
  }, []);
```

Replace the `countryScores` useMemo (lines 47-50):
```typescript
  // Old:
  const countryScores = useMemo(() => {
    if (!data) return new Map<string, number>();
    return computeCountryRisk(data);
  }, [data]);

  // New:
  const countryScores = useMemo(
    () => buildAdvisoryScores(advisories),
    [advisories],
  );
```

**Step 2: Update the legend labels**

In `apps/web/src/components/map/map-legend.tsx`:

Change the import (line 12):
```typescript
// Old:
import { RISK_LEVELS } from "@/lib/compute-country-risk";
// New:
import { ADVISORY_LEVELS } from "@/lib/compute-country-risk";
```

Replace the legend section title (line 90):
```typescript
// Old:
              Country Risk
// New:
              Travel Advisory
```

Replace the RISK_LEVELS map (lines 93-103):
```typescript
            <div className="flex gap-0.5 mt-1">
              {ADVISORY_LEVELS.map((level) => (
                <div key={level.label} className="flex-1 text-center">
                  <div
                    className="h-1.5 rounded-full"
                    style={{ backgroundColor: level.color }}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    {level.label}
                  </span>
                </div>
              ))}
            </div>
```

**Step 3: Verify build**

Run: `cd /Users/simone/Repos/personal/sitalert && pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/web/src/components/main-page.tsx apps/web/src/components/map/map-legend.tsx
git commit -m "feat: wire advisory data into choropleth and legend"
```

---

### Task 9: Add advisory popup on country click

**Files:**
- Modify: `apps/web/src/components/map/choropleth-layer.tsx`
- Modify: `apps/web/src/components/map/map-view.tsx`

**Step 1: Add click handler to ChoroplethLayer**

Update `ChoroplethLayerProps` in `choropleth-layer.tsx`:

```typescript
interface ChoroplethLayerProps {
  countryScores: Map<string, number>;
  visible: boolean;
  onCountryClick?: (countryCode: string, lngLat: { lng: number; lat: number }) => void;
}
```

Update function signature:
```typescript
export function ChoroplethLayer({ countryScores, visible, onCountryClick }: ChoroplethLayerProps) {
```

Add click handler inside the first useEffect (after `layersAddedRef.current = true;`):

```typescript
    const handleClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!onCountryClick || !e.features?.[0]) return;
      const code = e.features[0].properties?.[ISO_PROPERTY];
      if (code && countryScores.has(code)) {
        onCountryClick(code, e.lngLat);
      }
    };

    map.on("click", FILL_LAYER, handleClick);
    map.on("mouseenter", FILL_LAYER, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", FILL_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });
```

Add cleanup for the click handler inside the cleanup function (before removing layers):
```typescript
    map.off("click", FILL_LAYER, handleClick);
```

Note: Store `handleClick` in a ref so it can be cleaned up properly. Use `useRef` for this.

**Step 2: Pass advisory data through MapView**

In `map-view.tsx`, add props:

```typescript
interface MapViewProps {
  data: GeoJSONFeatureCollection | null;
  onBoundsChange: (bbox: BBox) => void;
  onEventSelect?: (feature: GeoJSONFeature) => void;
  selectedEvent?: GeoJSONFeature | null;
  onDeselectEvent?: () => void;
  choroplethScores?: Map<string, number>;
  choroplethVisible?: boolean;
  onCountryClick?: (countryCode: string, lngLat: { lng: number; lat: number }) => void;
}
```

Pass `onCountryClick` to `ChoroplethLayer`:
```typescript
        {choroplethScores && (
          <ChoroplethLayer
            countryScores={choroplethScores}
            visible={choroplethVisible ?? false}
            onCountryClick={onCountryClick}
          />
        )}
```

**Step 3: Handle country click in MainPage**

In `main-page.tsx`, add state and handler for the advisory popup. When a country is clicked, show a simple popup with advisory details using the existing `MapPopup` component. Create a small `AdvisoryPopup` component inline or as a separate file — keep it simple.

Add to MainPage:
```typescript
  const [selectedAdvisory, setSelectedAdvisory] = useState<{
    advisory: AdvisoryData;
    lngLat: { lng: number; lat: number };
  } | null>(null);

  const handleCountryClick = useCallback(
    (countryCode: string, lngLat: { lng: number; lat: number }) => {
      const advisory = advisories.find(
        (a) => a.countryCode.toUpperCase() === countryCode,
      );
      if (advisory) {
        setSelectedAdvisory({ advisory, lngLat });
      }
    },
    [advisories],
  );
```

Pass to MapView:
```typescript
            onCountryClick={choroplethVisible ? handleCountryClick : undefined}
```

**Step 4: Create AdvisoryPopup component**

Create `apps/web/src/components/map/advisory-popup.tsx`:

```typescript
"use client";

import { MapPopup } from "@/components/ui/map";
import { X, ExternalLink, ShieldAlert } from "lucide-react";
import type { AdvisoryData } from "@/lib/api-client";

interface AdvisoryPopupProps {
  advisory: AdvisoryData;
  lngLat: { lng: number; lat: number };
  onClose: () => void;
}

const LEVEL_LABELS: Record<number, string> = {
  1: "Exercise Normal Precautions",
  2: "Exercise Increased Caution",
  3: "Reconsider Travel",
  4: "Do Not Travel",
};

export function AdvisoryPopup({ advisory, lngLat, onClose }: AdvisoryPopupProps) {
  return (
    <MapPopup longitude={lngLat.lng} latitude={lngLat.lat} onClose={onClose}>
      <div className="bg-card text-card-foreground border border-border rounded-lg shadow-lg p-3 max-w-[320px] min-w-[240px]">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Travel Advisory
            </span>
          </div>
          <button
            type="button"
            aria-label="Close popup"
            onClick={onClose}
            className="-m-1 p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h3 className="font-semibold text-sm leading-tight mb-1">
          {advisory.title}
        </h3>

        <div className="text-xs font-medium text-amber-500 mb-2">
          Level {advisory.level}: {LEVEL_LABELS[advisory.level] ?? "Unknown"}
        </div>

        <p className="text-xs text-muted-foreground line-clamp-4 mb-2">
          {advisory.summary}
        </p>

        <a
          href={advisory.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Full advisory
        </a>
      </div>
    </MapPopup>
  );
}
```

Render in MainPage inside the MapView's Map children (pass as prop or render alongside):

Since `AdvisoryPopup` needs to be inside the `<Map>` component (for `MapPopup` context), and `MapView` already wraps `<Map>`, add it as a child of MapView or pass as a render prop. Simpler approach: render the popup inside MapView directly.

Add to MapView props:
```typescript
  advisoryPopup?: React.ReactNode;
```

Render inside the `<Map>` component after EventPopup:
```typescript
        {advisoryPopup}
```

In MainPage, pass:
```typescript
            advisoryPopup={
              selectedAdvisory && choroplethVisible ? (
                <AdvisoryPopup
                  advisory={selectedAdvisory.advisory}
                  lngLat={selectedAdvisory.lngLat}
                  onClose={() => setSelectedAdvisory(null)}
                />
              ) : null
            }
```

Import `AdvisoryPopup` in main-page.tsx.

**Step 5: Verify build**

Run: `cd /Users/simone/Repos/personal/sitalert && pnpm build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add apps/web/src/components/map/choropleth-layer.tsx apps/web/src/components/map/map-view.tsx apps/web/src/components/main-page.tsx apps/web/src/components/map/advisory-popup.tsx
git commit -m "feat: add advisory popup on country click"
```

---

### Task 10: Clean up old advisory data from DB

**Step 1: Delete old advisory-sourced events and orphan situations**

Run these SQL queries against the Neon database (use the Neon MCP tool):

```sql
-- Delete events sourced from us-travel-advisories
DELETE FROM events
WHERE sources::text LIKE '%us-travel-advisories%';
```

```sql
-- Delete orphaned situations (no remaining events)
DELETE FROM situations
WHERE id NOT IN (
  SELECT DISTINCT situation_id FROM events WHERE situation_id IS NOT NULL
);
```

**Step 2: Verify the cleanup**

```sql
SELECT count(*) FROM events WHERE sources::text LIKE '%us-travel-advisories%';
-- Expected: 0

SELECT count(*) FROM situations WHERE status = 'active';
-- Expected: fewer situations than before (orphaned ones removed)
```

No commit needed — this is a data migration.

---

### Task 11: Verify full integration

**Step 1: Run typecheck**

Run: `cd /Users/simone/Repos/personal/sitalert && pnpm typecheck`
Expected: No errors

**Step 2: Run tests**

Run: `cd /Users/simone/Repos/personal/sitalert && pnpm test`
Expected: All tests pass

**Step 3: Build**

Run: `cd /Users/simone/Repos/personal/sitalert && pnpm build`
Expected: Build succeeds

**Step 4: Manual test (if running locally)**

1. Start the collector: `pnpm dev:collector` — verify it logs advisory sync
2. Start the web app: `pnpm dev:web`
3. Open the map, toggle the Risk layer on
4. Verify countries are shaded by advisory level
5. Click a shaded country — verify popup shows advisory details
6. Check the sidebar — verify no more generic "Myanmar Conflict" situations
