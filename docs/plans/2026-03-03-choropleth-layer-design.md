# Country Risk Choropleth Layer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a toggleable country-fill choropleth layer to the map that colors countries by aggregate event severity, sitting below the existing circle markers.

**Architecture:** Client-side only — country risk scores are computed from the already-fetched GeoJSON event data by grouping on `countryCode` and summing severity. Natural Earth 110m boundary GeoJSON is bundled as a static file. MapLibre fill+line layers render the choropleth below event layers. A toggle button and legend integration complete the UX.

**Tech Stack:** MapLibre GL JS (via `useMap` hook), Natural Earth GeoJSON, React, Tailwind CSS, lucide-react icons.

---

### Task 1: Download and bundle Natural Earth boundary data

**Files:**
- Create: `apps/web/public/geo/countries-110m.json`

**Step 1: Download Natural Earth 110m countries GeoJSON**

```bash
cd apps/web
mkdir -p public/geo
curl -L "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json" -o /tmp/countries-topo.json
```

This is TopoJSON. We need to convert to GeoJSON and extract just the country features with ISO_A2 codes. Use topojson-client:

```bash
npx -y topojson-client@3 topo2geo countries=/tmp/countries-geo.json < /tmp/countries-topo.json
```

If topojson conversion is unavailable or problematic, use the pre-built GeoJSON from Natural Earth directly:

```bash
curl -L "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson" -o public/geo/countries-110m.json
```

Alternatively, any GeoJSON with country polygons and an `ISO_A2` (or `ISO_A2_EH`) property on features will work. The key requirement is each feature has a 2-letter country code we can match against our `countryCode` field.

**Step 2: Verify the file**

```bash
# Check file size (should be ~500KB-2MB uncompressed, <200KB gzipped)
ls -lh public/geo/countries-110m.json
# Check a feature has the ISO code property
head -c 2000 public/geo/countries-110m.json
```

Look for a property like `ISO_A2`, `ISO_A2_EH`, or `iso_a2` on features. Note the exact property name — you'll need it in Task 3.

**Step 3: Commit**

```bash
git add apps/web/public/geo/countries-110m.json
git commit -m "feat: add Natural Earth country boundaries GeoJSON"
```

---

### Task 2: Create `computeCountryRisk` utility

**Files:**
- Create: `apps/web/src/lib/compute-country-risk.ts`
- Test: `apps/web/src/lib/compute-country-risk.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/web/src/lib/compute-country-risk.test.ts
import { describe, it, expect } from "vitest";
import { computeCountryRisk, riskColor } from "./compute-country-risk";
import type { GeoJSONFeatureCollection } from "@travelrisk/db";

function makeFeature(countryCode: string | null, severity: number) {
  return {
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [0, 0] as [number, number] },
    properties: {
      id: crypto.randomUUID(),
      title: "Test",
      summary: "",
      category: "conflict",
      severity,
      confidence: 1,
      locationName: "Test",
      countryCode,
      timestamp: new Date().toISOString(),
      ageMinutes: 0,
      sourceCount: 1,
      sources: [],
    },
  };
}

describe("computeCountryRisk", () => {
  it("sums severity per country code", () => {
    const data: GeoJSONFeatureCollection = {
      type: "FeatureCollection",
      features: [
        makeFeature("US", 3),
        makeFeature("US", 4),
        makeFeature("GB", 2),
      ],
    };
    const scores = computeCountryRisk(data);
    expect(scores.get("US")).toBe(7);
    expect(scores.get("GB")).toBe(2);
  });

  it("skips features with null countryCode", () => {
    const data: GeoJSONFeatureCollection = {
      type: "FeatureCollection",
      features: [makeFeature(null, 5), makeFeature("FR", 1)],
    };
    const scores = computeCountryRisk(data);
    expect(scores.has("")).toBe(false);
    expect(scores.get("FR")).toBe(1);
  });

  it("returns empty map for no features", () => {
    const data: GeoJSONFeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };
    expect(computeCountryRisk(data).size).toBe(0);
  });
});

describe("riskColor", () => {
  it("returns transparent for score 0", () => {
    expect(riskColor(0)).toBe("transparent");
  });

  it("returns low color for scores 1-5", () => {
    const color = riskColor(3);
    expect(color).not.toBe("transparent");
  });

  it("returns critical color for scores 31+", () => {
    const low = riskColor(1);
    const critical = riskColor(50);
    expect(critical).not.toBe(low);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @travelrisk/web exec vitest run src/lib/compute-country-risk.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
// apps/web/src/lib/compute-country-risk.ts
import type { GeoJSONFeatureCollection } from "@travelrisk/db";

/**
 * Compute per-country risk scores by summing event severity.
 * Returns a Map of uppercase ISO 3166-1 alpha-2 code -> total severity score.
 */
export function computeCountryRisk(
  data: GeoJSONFeatureCollection,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const feature of data.features) {
    const code = feature.properties.countryCode;
    if (!code) continue;
    const key = code.toUpperCase();
    scores.set(key, (scores.get(key) ?? 0) + feature.properties.severity);
  }
  return scores;
}

/** Risk thresholds and colors (oklch for perceptual uniformity) */
const RISK_SCALE = [
  { max: 0, color: "transparent" },
  { max: 5, color: "oklch(0.85 0.12 85)" },   // Low — faint amber
  { max: 15, color: "oklch(0.75 0.15 60)" },   // Moderate — orange
  { max: 30, color: "oklch(0.60 0.18 30)" },   // High — red-orange
  { max: Infinity, color: "oklch(0.45 0.20 25)" }, // Critical — deep red
] as const;

/** Map a numeric risk score to a fill color string. */
export function riskColor(score: number): string {
  for (const level of RISK_SCALE) {
    if (score <= level.max) return level.color;
  }
  return RISK_SCALE[RISK_SCALE.length - 1].color;
}

/** The RISK_SCALE exported for legend rendering. */
export const RISK_LEVELS = [
  { label: "Low", minScore: 1, color: RISK_SCALE[1].color },
  { label: "Moderate", minScore: 6, color: RISK_SCALE[2].color },
  { label: "High", minScore: 16, color: RISK_SCALE[3].color },
  { label: "Critical", minScore: 31, color: RISK_SCALE[4].color },
] as const;
```

**Step 4: Run test to verify it passes**

```bash
pnpm --filter @travelrisk/web exec vitest run src/lib/compute-country-risk.test.ts
```

Expected: PASS — all 5 tests green.

**Step 5: Commit**

```bash
git add apps/web/src/lib/compute-country-risk.ts apps/web/src/lib/compute-country-risk.test.ts
git commit -m "feat: add computeCountryRisk utility with tests"
```

---

### Task 3: Create `ChoroplethLayer` component

**Files:**
- Create: `apps/web/src/components/map/choropleth-layer.tsx`

This follows the exact same pattern as `EventLayer` — uses `useMap()` to get the MapLibre instance, adds source+layers in a `useEffect`, cleans up on unmount.

**Step 1: Create the component**

```typescript
// apps/web/src/components/map/choropleth-layer.tsx
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@/components/ui/map";
import { riskColor } from "@/lib/compute-country-risk";

const SOURCE_ID = "country-boundaries";
const FILL_LAYER = "country-risk-fill";
const LINE_LAYER = "country-risk-outline";

// Adjust this to match the actual property name in your GeoJSON file.
// Common names: "ISO_A2", "ISO_A2_EH", "iso_a2", "ISO3166-1-Alpha-2"
const ISO_PROPERTY = "ISO_A2";

interface ChoroplethLayerProps {
  /** Map of uppercase country code -> total severity score */
  countryScores: Map<string, number>;
  visible: boolean;
}

function buildFillColorExpression(
  scores: Map<string, number>,
): maplibregl.ExpressionSpecification {
  const matchExpr: unknown[] = ["match", ["get", ISO_PROPERTY]];
  for (const [code, score] of scores) {
    matchExpr.push(code, riskColor(score));
  }
  matchExpr.push("transparent"); // default
  return matchExpr as maplibregl.ExpressionSpecification;
}

export function ChoroplethLayer({ countryScores, visible }: ChoroplethLayerProps) {
  const { map, isLoaded } = useMap();
  const layersAddedRef = useRef(false);

  // Add source + layers once
  useEffect(() => {
    if (!map || !isLoaded || layersAddedRef.current) return;

    // Find the first symbol layer to insert choropleth below all labels/markers
    const firstSymbolId = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: "/geo/countries-110m.json",
    });

    map.addLayer(
      {
        id: FILL_LAYER,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": buildFillColorExpression(countryScores),
          "fill-opacity": 0.35,
        },
        layout: {
          visibility: visible ? "visible" : "none",
        },
      },
      firstSymbolId,
    );

    map.addLayer(
      {
        id: LINE_LAYER,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "rgba(255, 255, 255, 0.1)",
          "line-width": 0.5,
        },
        layout: {
          visibility: visible ? "visible" : "none",
        },
      },
      firstSymbolId,
    );

    layersAddedRef.current = true;

    return () => {
      if (layersAddedRef.current) {
        if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
        if (map.getLayer(FILL_LAYER)) map.removeLayer(FILL_LAYER);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        layersAddedRef.current = false;
      }
    };
  }, [map, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update fill color when scores change
  useEffect(() => {
    if (!map || !layersAddedRef.current || !map.getLayer(FILL_LAYER)) return;
    map.setPaintProperty(FILL_LAYER, "fill-color", buildFillColorExpression(countryScores));
  }, [map, countryScores]);

  // Update visibility when toggled
  useEffect(() => {
    if (!map || !layersAddedRef.current) return;
    const vis = visible ? "visible" : "none";
    if (map.getLayer(FILL_LAYER)) map.setLayoutProperty(FILL_LAYER, "visibility", vis);
    if (map.getLayer(LINE_LAYER)) map.setLayoutProperty(LINE_LAYER, "visibility", vis);
  }, [map, visible]);

  return null;
}
```

**Step 2: Verify types**

```bash
pnpm typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/map/choropleth-layer.tsx
git commit -m "feat: add ChoroplethLayer MapLibre component"
```

---

### Task 4: Create `ChoroplethToggle` button

**Files:**
- Create: `apps/web/src/components/map/choropleth-toggle.tsx`

**Step 1: Create the component**

```typescript
// apps/web/src/components/map/choropleth-toggle.tsx
"use client";

import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChoroplethToggleProps {
  active: boolean;
  onToggle: () => void;
}

export function ChoroplethToggle({ active, onToggle }: ChoroplethToggleProps) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? "Hide country risk layer" : "Show country risk layer"}
      className={cn(
        "bg-card/90 backdrop-blur border border-border rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg transition-colors",
        active
          ? "text-foreground border-primary/40"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Layers className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">Risk</span>
    </button>
  );
}
```

**Step 2: Verify types**

```bash
pnpm typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/map/choropleth-toggle.tsx
git commit -m "feat: add ChoroplethToggle button component"
```

---

### Task 5: Wire choropleth into MapView and MainPage

**Files:**
- Modify: `apps/web/src/components/map/map-view.tsx`
- Modify: `apps/web/src/components/main-page.tsx`

**Step 1: Add ChoroplethLayer to MapView**

In `apps/web/src/components/map/map-view.tsx`:

Add import at top:
```typescript
import { ChoroplethLayer } from "./choropleth-layer";
```

Extend `MapViewProps` interface:
```typescript
interface MapViewProps {
  data: GeoJSONFeatureCollection | null;
  onBoundsChange: (bbox: BBox) => void;
  onEventSelect?: (feature: GeoJSONFeature) => void;
  selectedEvent?: GeoJSONFeature | null;
  onDeselectEvent?: () => void;
  choroplethScores?: Map<string, number>;
  choroplethVisible?: boolean;
}
```

Add the two new props to the destructured params of `MapView`:
```typescript
export function MapView({
  data,
  onBoundsChange,
  onEventSelect,
  selectedEvent,
  onDeselectEvent,
  choroplethScores,
  choroplethVisible,
}: MapViewProps) {
```

Add `<ChoroplethLayer>` inside `<Map>`, **before** `<EventLayer>` (so it renders below):
```tsx
<Map ...>
  <MapInitializer onBoundsChange={onBoundsChange} />
  {choroplethScores && (
    <ChoroplethLayer
      countryScores={choroplethScores}
      visible={choroplethVisible ?? false}
    />
  )}
  <EventLayer data={data} onEventClick={handleEventClick} />
  {selectedEvent && onDeselectEvent && (
    <EventPopup feature={selectedEvent} onClose={onDeselectEvent} />
  )}
</Map>
```

**Step 2: Wire state in MainPage**

In `apps/web/src/components/main-page.tsx`:

Add imports:
```typescript
import { computeCountryRisk } from "@/lib/compute-country-risk";
import { ChoroplethToggle } from "@/components/map/choropleth-toggle";
```

Add state and memo inside `MainPage()`:
```typescript
const [choroplethVisible, setChoroplethVisible] = useState(false);

const countryScores = useMemo(() => {
  if (!data) return new Map<string, number>();
  return computeCountryRisk(data);
}, [data]);

const handleChoroplethToggle = useCallback(() => {
  setChoroplethVisible((prev) => !prev);
}, []);
```

Pass to MapView:
```tsx
<MapView
  data={data}
  onBoundsChange={handleBoundsChange}
  onEventSelect={handleEventSelect}
  selectedEvent={selectedEvent}
  onDeselectEvent={handleDeselectEvent}
  choroplethScores={countryScores}
  choroplethVisible={choroplethVisible}
/>
```

Add `<ChoroplethToggle>` in the map controls area, as sibling to `<TimelineBar>` and `<MapLegend>`:
```tsx
<div className="relative flex-1">
  <MapView ... />
  <TimelineBar ... />
  <MapLegend choroplethActive={choroplethVisible} />
  <div className="absolute bottom-16 md:bottom-4 right-4 z-10 flex flex-col items-end gap-2">
    {/* Note: MapLegend is moved into this container — see Task 6 */}
  </div>
  <ChoroplethToggle
    active={choroplethVisible}
    onToggle={handleChoroplethToggle}
  />
</div>
```

Wait — the legend and toggle both need to be bottom-right. To avoid overlap, restructure the bottom-right area. Move both into a flex column. The simplest approach: put `ChoroplethToggle` adjacent to `MapLegend` by positioning it separately with `bottom-28 md:bottom-16 right-4` (above the legend).

Actually, simpler: position the toggle at `absolute bottom-16 md:bottom-4 right-4` and shift MapLegend up by giving it an explicit `bottom-[5.5rem] md:bottom-14 right-4` instead of its current `bottom-16 md:bottom-4 right-4`. This is cleaner handled in Task 6 when we modify MapLegend.

For now in MainPage:
```tsx
<ChoroplethToggle
  active={choroplethVisible}
  onToggle={handleChoroplethToggle}
/>
```

Place it as a direct child of the `relative flex-1` div, with absolute positioning defined in the component. We'll refine positioning in Task 6.

**Step 3: Verify types**

```bash
pnpm typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/map/map-view.tsx apps/web/src/components/main-page.tsx
git commit -m "feat: wire choropleth layer and toggle into map view"
```

---

### Task 6: Update MapLegend + position bottom-right controls

**Files:**
- Modify: `apps/web/src/components/map/map-legend.tsx`
- Modify: `apps/web/src/components/map/choropleth-toggle.tsx`
- Modify: `apps/web/src/components/main-page.tsx`

The bottom-right of the map now has two controls: Legend pill and Risk toggle. To avoid overlap, wrap them in a flex column container in MainPage and remove absolute positioning from the individual components.

**Step 1: Restructure MainPage's map control area**

In `apps/web/src/components/main-page.tsx`, replace the separate `<MapLegend />` and `<ChoroplethToggle>` with:

```tsx
<div className="absolute bottom-16 md:bottom-4 right-4 z-10 flex flex-col items-end gap-2">
  <MapLegend choroplethActive={choroplethVisible} />
  <ChoroplethToggle
    active={choroplethVisible}
    onToggle={handleChoroplethToggle}
  />
</div>
```

**Step 2: Remove absolute positioning from MapLegend**

In `apps/web/src/components/map/map-legend.tsx`:
- Remove the outer `<div className="absolute bottom-16 md:bottom-4 right-4 z-10">` wrapper
- The component now renders its content directly (the expanded card or collapsed pill)
- Add `choroplethActive` prop

Update signature:
```typescript
interface MapLegendProps {
  choroplethActive?: boolean;
}

export function MapLegend({ choroplethActive = false }: MapLegendProps) {
```

When `choroplethActive` is true and the legend is expanded, append a "Country Risk" section after the severity scale:

```tsx
{/* Country risk scale — shown when choropleth is active */}
{choroplethActive && (
  <div className="mt-2.5 pt-2 border-t border-border">
    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
      Country Risk
    </span>
    <div className="flex gap-0.5 mt-1">
      {RISK_LEVELS.map((level) => (
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
  </div>
)}
```

Import `RISK_LEVELS` from `@/lib/compute-country-risk`.

**Step 3: Remove absolute positioning from ChoroplethToggle**

In `apps/web/src/components/map/choropleth-toggle.tsx`, ensure there's no `absolute` class — it's now positioned by the parent flex container.

**Step 4: Verify types and build**

```bash
pnpm typecheck
pnpm build
```

Expected: Both PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/map/map-legend.tsx apps/web/src/components/map/choropleth-toggle.tsx apps/web/src/components/main-page.tsx
git commit -m "feat: add country risk scale to legend, reorganize map controls"
```

---

### Task 7: Verify Natural Earth GeoJSON compatibility

**Files:** None new — manual testing

**Step 1: Start dev server**

```bash
pnpm dev:web
```

**Step 2: Check browser console**

Open http://localhost:3000. Open DevTools console. Toggle the Risk button. Look for:
- MapLibre errors about the GeoJSON source
- Missing `ISO_A2` property warnings
- Any CORS or 404 errors loading `/geo/countries-110m.json`

**Step 3: Verify ISO property name**

If countries aren't colored, the `ISO_PROPERTY` constant in `choropleth-layer.tsx` may not match the actual GeoJSON. Open `/geo/countries-110m.json` in the browser and inspect a feature's properties. Update `ISO_PROPERTY` to match the actual key (common alternatives: `"ISO_A2_EH"`, `"iso_a2"`, `"ISO3166-1-Alpha-2"`, `"ISO_A2"`).

**Step 4: Visual check**

- Toggle choropleth on → countries with events should be tinted amber-to-red
- Toggle off → fill disappears, markers remain
- Change time range → scores recompute, colors update
- Change category filter → scores recompute
- Legend expanded → shows "Country Risk" color scale when toggle is on

**Step 5: Final typecheck + build**

```bash
pnpm typecheck
pnpm build
```

**Step 6: Commit any fixes**

```bash
git add -u
git commit -m "fix: adjust choropleth GeoJSON property compatibility"
```

---

## File Summary

| File | Action | Task |
|---|---|---|
| `apps/web/public/geo/countries-110m.json` | Create | 1 |
| `apps/web/src/lib/compute-country-risk.ts` | Create | 2 |
| `apps/web/src/lib/compute-country-risk.test.ts` | Create | 2 |
| `apps/web/src/components/map/choropleth-layer.tsx` | Create | 3 |
| `apps/web/src/components/map/choropleth-toggle.tsx` | Create | 4, 6 |
| `apps/web/src/components/map/map-view.tsx` | Modify | 5 |
| `apps/web/src/components/main-page.tsx` | Modify | 5, 6 |
| `apps/web/src/components/map/map-legend.tsx` | Modify | 6 |
