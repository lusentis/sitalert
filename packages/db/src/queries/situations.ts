import { sql, and, eq, lte, gte, inArray, isNull, desc } from "drizzle-orm";
import { situations, events, type Situation } from "../schema";
import type { HttpClient, PoolClient } from "../client";
import type { EventCategory } from "@travelrisk/shared";

type DbClient = HttpClient | PoolClient;

export interface SituationWithCoords extends Situation {
  lng: number;
  lat: number;
  lastEventAt: Date | null;
}

export async function findActiveSituations(
  db: DbClient,
  _lat: number,
  _lng: number,
  category: EventCategory,
  _withinKm: number = 500,
): Promise<SituationWithCoords[]> {
  const recentCutoff = new Date(Date.now() - 7 * 24 * 3600_000);

  const rows = await db
    .select({
      situation: situations,
      lng: sql<number>`ST_X(${situations.location}::geometry)`,
      lat: sql<number>`ST_Y(${situations.location}::geometry)`,
      lastEventAt: sql<Date | null>`(
        SELECT MAX(${events.timestamp})
        FROM ${events}
        WHERE ${events.situationId} = ${situations.id}
      )`,
    })
    .from(situations)
    .where(
      and(
        sql`${situations.category} = ${category}`,
        sql`(${situations.status} = 'active' OR (${situations.status} = 'resolved' AND ${situations.lastUpdated} >= ${recentCutoff}))`,
      ),
    )
    .orderBy(desc(situations.lastUpdated));

  return rows.map((row) => ({
    ...row.situation,
    lng: row.lng,
    lat: row.lat,
    lastEventAt: row.lastEventAt,
  }));
}

export async function createSituation(
  db: DbClient,
  data: {
    title: string;
    summary: string;
    category: EventCategory;
    severity: number;
    countryCodes?: string[] | null;
    lat: number;
    lng: number;
  },
): Promise<Situation> {
  const { lat, lng, ...rest } = data;
  const now = new Date();

  const [inserted] = await db
    .insert(situations)
    .values({
      ...rest,
      location: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`,
      eventCount: 1,
      firstSeen: now,
      lastUpdated: now,
    })
    .returning();

  return inserted;
}

export async function updateSituation(
  db: DbClient,
  id: string,
  data: { severity: number; summary?: string; countryCodes?: string[] },
): Promise<Situation> {
  const now = new Date();

  const set: Record<string, unknown> = {
    eventCount: sql`${situations.eventCount} + 1`,
    severity: sql`GREATEST(${situations.severity}, ${data.severity})`,
    status: "active" as const,
    lastUpdated: now,
    updatedAt: now,
  };

  if (data.summary !== undefined) {
    set.summary = data.summary;
  }

  if (data.countryCodes && data.countryCodes.length > 0) {
    set.countryCodes = sql`(
      SELECT array_agg(DISTINCT code) FROM unnest(
        COALESCE(${situations.countryCodes}, ARRAY[]::text[]) || ${data.countryCodes}::text[]
      ) AS code
    )`;
  }

  const [updated] = await db
    .update(situations)
    .set(set)
    .where(eq(situations.id, id))
    .returning();

  return updated;
}

export async function upsertSituation(
  db: DbClient,
  data: {
    externalId: string;
    title: string;
    summary: string;
    category: EventCategory;
    severity: number;
    countryCodes?: string[] | null;
    lat: number;
    lng: number;
  },
): Promise<Situation> {
  const { lat, lng, externalId, ...rest } = data;
  const now = new Date();

  const [result] = await db
    .insert(situations)
    .values({
      ...rest,
      externalId,
      location: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`,
      eventCount: 0,
      firstSeen: now,
      lastUpdated: now,
    })
    .onConflictDoUpdate({
      target: situations.externalId,
      set: {
        severity: sql`GREATEST(${situations.severity}, ${data.severity})`,
        summary: data.summary,
        updatedAt: now,
        status: "active" as const,
      },
    })
    .returning();

  return result;
}

const SEVERITY_TTL_HOURS: Record<number, number> = {
  1: 24,
  2: 24,
  3: 48,
  4: 168, // 7 days
  5: 336, // 14 days
};

export async function resolveExpiredSituations(
  db: DbClient,
): Promise<number> {
  const now = Date.now();
  const result = await db
    .update(situations)
    .set({ status: "resolved" as const, updatedAt: new Date() })
    .where(
      and(
        eq(situations.status, "active"),
        sql`${situations.externalId} IS NULL`,
        sql`${situations.lastUpdated} < CASE ${situations.severity}
          WHEN 1 THEN ${new Date(now - SEVERITY_TTL_HOURS[1] * 3600_000)}::timestamptz
          WHEN 2 THEN ${new Date(now - SEVERITY_TTL_HOURS[2] * 3600_000)}::timestamptz
          WHEN 3 THEN ${new Date(now - SEVERITY_TTL_HOURS[3] * 3600_000)}::timestamptz
          WHEN 4 THEN ${new Date(now - SEVERITY_TTL_HOURS[4] * 3600_000)}::timestamptz
          ELSE ${new Date(now - SEVERITY_TTL_HOURS[5] * 3600_000)}::timestamptz
        END`,
      ),
    )
    .returning();

  return result.length;
}

const SEVERITY_DECAY_HOURS: Record<number, number> = {
  3: 24,
  4: 72, // 3 days
  5: 168, // 7 days
};

export async function decaySeverity(db: DbClient): Promise<number> {
  const now = Date.now();
  let totalDecayed = 0;

  for (const [sevStr, hours] of Object.entries(SEVERITY_DECAY_HOURS)) {
    const sev = Number(sevStr);
    const cutoff = new Date(now - hours * 3600_000);

    const result = await db
      .update(situations)
      .set({
        severity: sql`${situations.severity} - 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(situations.status, "active"),
          sql`${situations.externalId} IS NULL`,
          sql`${situations.severity} = ${sev}`,
          lte(situations.lastUpdated, cutoff),
        ),
      )
      .returning();

    totalDecayed += result.length;
  }

  return totalDecayed;
}

export async function mergeSituations(
  db: DbClient,
  keepId: string,
  mergeId: string,
): Promise<void> {
  const now = new Date();

  // Reassign all events from mergeId to keepId
  await db
    .update(events)
    .set({ situationId: keepId, updatedAt: now })
    .where(eq(events.situationId, mergeId));

  // Get both situations
  const [keep] = await db
    .select()
    .from(situations)
    .where(eq(situations.id, keepId));
  const [merge] = await db
    .select()
    .from(situations)
    .where(eq(situations.id, mergeId));

  if (!keep || !merge) return;

  // Merge countryCodes, take max severity, earliest firstSeen, latest lastUpdated
  const mergedCodes = [
    ...new Set([
      ...(keep.countryCodes ?? []),
      ...(merge.countryCodes ?? []),
    ]),
  ];

  // Recount events from actual event rows
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(events)
    .where(eq(events.situationId, keepId));

  await db
    .update(situations)
    .set({
      countryCodes: mergedCodes,
      severity: Math.max(keep.severity, merge.severity),
      firstSeen: keep.firstSeen < merge.firstSeen ? keep.firstSeen : merge.firstSeen,
      lastUpdated: keep.lastUpdated > merge.lastUpdated ? keep.lastUpdated : merge.lastUpdated,
      eventCount: countRow?.count ?? keep.eventCount,
      updatedAt: now,
    })
    .where(eq(situations.id, keepId));

  // Soft-delete the merged situation
  await db
    .update(situations)
    .set({ status: "resolved" as const, updatedAt: now })
    .where(eq(situations.id, mergeId));

  console.log(`[situations] Merged situation ${mergeId} into ${keepId}`);
}

export interface SituationFeedQuery {
  categories?: EventCategory[];
  minSeverity?: number;
  after?: Date;
}

export async function querySituationsForFeed(
  db: DbClient,
  query: SituationFeedQuery = {},
): Promise<SituationWithCoords[]> {
  const conditions = [eq(situations.status, "active")];

  if (query.categories && query.categories.length > 0) {
    conditions.push(inArray(situations.category, query.categories));
  }

  if (query.minSeverity && query.minSeverity > 1) {
    conditions.push(gte(situations.severity, query.minSeverity));
  }

  if (query.after) {
    conditions.push(gte(situations.lastUpdated, query.after));
  }

  const rows = await db
    .select({
      situation: situations,
      lng: sql<number>`ST_X(${situations.location}::geometry)`,
      lat: sql<number>`ST_Y(${situations.location}::geometry)`,
      lastEventAt: sql<Date | null>`(
        SELECT MAX(${events.timestamp})
        FROM ${events}
        WHERE ${events.situationId} = ${situations.id}
      )`,
    })
    .from(situations)
    .where(and(...conditions))
    .orderBy(
      sql`COALESCE((
        SELECT MAX(${events.timestamp})
        FROM ${events}
        WHERE ${events.situationId} = ${situations.id}
      ), ${situations.firstSeen}) DESC`,
    );

  return rows.map((row) => ({
    ...row.situation,
    lng: row.lng,
    lat: row.lat,
    lastEventAt: row.lastEventAt,
  }));
}

export async function queryEventsBySituation(
  db: DbClient,
  situationId: string,
): Promise<Array<{
  id: string;
  title: string;
  summary: string;
  category: string;
  severity: number;
  locationName: string;
  countryCodes: string[] | null;
  timestamp: Date;
  sources: unknown;
  lng: number;
  lat: number;
}>> {
  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      summary: events.summary,
      category: events.category,
      severity: events.severity,
      locationName: events.locationName,
      countryCodes: events.countryCodes,
      timestamp: events.timestamp,
      sources: events.sources,
      lng: sql<number>`ST_X(${events.location}::geometry)`,
      lat: sql<number>`ST_Y(${events.location}::geometry)`,
    })
    .from(events)
    .where(eq(events.situationId, situationId))
    .orderBy(desc(events.timestamp));

  return rows;
}

// Audit helper: cluster orphaned events by country+category
export interface OrphanCluster {
  category: EventCategory;
  countryCode: string;
  eventIds: string[];
  maxSeverity: number;
}

export async function clusterOrphanedEvents(
  db: DbClient,
): Promise<OrphanCluster[]> {
  const cutoff = new Date(Date.now() - 24 * 3600_000);

  // Find orphaned events with country codes from last 24h
  const orphans = await db
    .select({
      id: events.id,
      category: events.category,
      severity: events.severity,
      countryCodes: events.countryCodes,
    })
    .from(events)
    .where(
      and(
        isNull(events.situationId),
        gte(events.timestamp, cutoff),
      ),
    );

  // Group by country+category in code (unnest in JS, not SQL, to avoid subquery issues)
  const groups = new Map<string, { ids: string[]; maxSev: number; category: EventCategory; countryCode: string }>();

  for (const orphan of orphans) {
    for (const cc of orphan.countryCodes ?? []) {
      const key = `${cc}:${orphan.category}`;
      const group = groups.get(key);
      if (group) {
        group.ids.push(orphan.id);
        group.maxSev = Math.max(group.maxSev, orphan.severity);
      } else {
        groups.set(key, {
          ids: [orphan.id],
          maxSev: orphan.severity,
          category: orphan.category as EventCategory,
          countryCode: cc,
        });
      }
    }
  }

  // Only return clusters with 3+ events
  return Array.from(groups.values())
    .filter((g) => g.ids.length >= 3)
    .map((g) => ({
      category: g.category,
      countryCode: g.countryCode,
      eventIds: g.ids,
      maxSeverity: g.maxSev,
    }));
}

// Audit helper: assign events to a situation
export async function assignEventsToSituation(
  db: DbClient,
  eventIds: string[],
  situationId: string,
): Promise<void> {
  if (eventIds.length === 0) return;

  await db
    .update(events)
    .set({ situationId, updatedAt: new Date() })
    .where(inArray(events.id, eventIds));
}

// Audit helper: get all active situations as flat array (no geo)
export async function queryActiveSituationsFlat(
  db: DbClient,
): Promise<Situation[]> {
  return db
    .select()
    .from(situations)
    .where(eq(situations.status, "active"))
    .orderBy(desc(situations.lastUpdated));
}

// Audit helper: find high-severity external situations with no recent events
export async function queryCoverageGaps(
  db: DbClient,
): Promise<Array<{ id: string; title: string; severity: number; externalId: string | null }>> {
  const cutoff = new Date(Date.now() - 48 * 3600_000);

  const gaps = await db
    .select({
      id: situations.id,
      title: situations.title,
      severity: situations.severity,
      externalId: situations.externalId,
    })
    .from(situations)
    .where(
      and(
        eq(situations.status, "active"),
        sql`${situations.externalId} IS NOT NULL`,
        gte(situations.severity, 4),
      ),
    );

  const result: Array<{ id: string; title: string; severity: number; externalId: string | null }> = [];

  for (const gap of gaps) {
    const [recent] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(events)
      .where(
        and(
          eq(events.situationId, gap.id),
          gte(events.timestamp, cutoff),
        ),
      );

    if ((recent?.count ?? 0) === 0) {
      result.push(gap);
    }
  }

  return result;
}
