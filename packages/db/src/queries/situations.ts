import { sql, and, eq, lte, desc } from "drizzle-orm";
import { situations, type Situation } from "../schema";
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
    countryCode?: string | null;
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
