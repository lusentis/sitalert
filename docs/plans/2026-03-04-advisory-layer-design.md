# Advisory Layer Design

**Date**: 2026-03-04
**Status**: Approved

## Problem

Travel advisories (US State Dept Level 3-4 warnings) are ingested as regular events, classified by the LLM, and turned into 1-event situations with generic titles like "Myanmar Conflict". They're static country-level warnings that don't fit the situation model — creating 44 situations that read like a Wikipedia index instead of a live feed.

## Solution

Advisories become a choropleth map layer, not situations.

### Data Model

New `advisories` table:

| Column | Type | Notes |
|--------|------|-------|
| `country_code` | text PK | ISO 3166-1 alpha-2 (uppercase) |
| `level` | integer | 1-4 (US State Dept scale) |
| `title` | text | e.g. "Syria - Level 4: Do Not Travel" |
| `summary` | text | Plain-text advisory summary |
| `source_url` | text | Link to full advisory |
| `source_name` | text | "us-travel-advisories" |
| `updated_at` | timestamp | Last advisory update |

### Collector Changes

**US Travel Advisories adapter** is rewritten to:
- Fetch all advisories (Level 1-4, not just 3+)
- Upsert directly to `advisories` table (bypass event pipeline entirely)
- No LLM classification needed — the level IS the severity

**ViaggiareSicuri** stays as-is — its `ultima_ora` feed produces actual breaking news events worth classifying.

### Web Changes

**New API endpoint** `/api/advisories`:
- Returns `{ advisories: [{ countryCode, level, title, summary, sourceUrl }] }`
- Simple SELECT from advisories table

**ChoroplethLayer** (already exists) fed advisory levels:
- Level 1: no fill (Exercise Normal Precautions)
- Level 2: faint amber (Exercise Increased Caution)
- Level 3: orange (Reconsider Travel)
- Level 4: red (Do Not Travel)

**Click interaction**: Clicking a shaded country shows a MapPopup with advisory title, summary, and source link.

**`compute-country-risk.ts`** replaced with advisory-level lookup instead of severity-sum computation.

### DB Cleanup

- Delete events sourced from `us-travel-advisories`
- Delete orphaned situations (situations with 0 remaining events)

## What Stays the Same

- ViaggiareSicuri adapter (actual events)
- Situation creation logic
- Sidebar situation feed
- Event layer on map
