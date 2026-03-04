import { sql, and, eq, lte, gte, inArray, desc } from "drizzle-orm";
import { situations, events, type Situation } from "../schema";
import type { HttpClient, PoolClient } from "../client";
import type { EventCategory } from "@travelrisk/shared";

type DbClient = HttpClient | PoolClient;

export interface SituationWithCoords extends Situation {
  lng: number;
  lat: number;
}

export async function findActiveSituations(
  db: DbClient,
  _lat: number,
  _lng: number,
  category: EventCategory,
  _withinKm: number = 500,
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
        sql`${situations.category} = ${category}`,
      ),
    )
    .orderBy(desc(situations.lastUpdated));

  return rows.map((row) => ({
    ...row.situation,
    lng: row.lng,
    lat: row.lat,
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
  data: { severity: number; summary?: string },
): Promise<Situation> {
  const now = new Date();

  const set: Record<string, unknown> = {
    eventCount: sql`${situations.eventCount} + 1`,
    severity: sql`GREATEST(${situations.severity}, ${data.severity})`,
    lastUpdated: now,
    updatedAt: now,
  };

  if (data.summary !== undefined) {
    set.summary = data.summary;
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
        lastUpdated: now,
        updatedAt: now,
        status: "active" as const,
      },
    })
    .returning();

  return result;
}

export async function resolveExpiredSituations(
  db: DbClient,
  hoursIdle: number = 48,
): Promise<number> {
  const cutoff = new Date(Date.now() - hoursIdle * 60 * 60 * 1000);

  const result = await db
    .update(situations)
    .set({ status: "resolved" as const, updatedAt: new Date() })
    .where(
      and(
        eq(situations.status, "active"),
        lte(situations.lastUpdated, cutoff),
      ),
    )
    .returning();

  return result.length;
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
    })
    .from(situations)
    .where(and(...conditions))
    .orderBy(desc(situations.lastUpdated));

  return rows.map((row) => ({
    ...row.situation,
    lng: row.lng,
    lat: row.lat,
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
