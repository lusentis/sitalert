import { sql, desc, and, gte, lte, inArray, isNull, or } from "drizzle-orm";
import { events, type Event, type NewEvent } from "../schema.js";
import type { HttpClient, PoolClient } from "../client.js";
import type { EventCategory } from "@sitalert/shared";

type DbClient = HttpClient | PoolClient;

export interface ViewportQuery {
  west: number;
  south: number;
  east: number;
  north: number;
  categories?: EventCategory[];
  minSeverity?: number;
  minConfidence?: number;
  after?: Date;
  limit?: number;
  offset?: number;
}

export interface EventWithCoords extends Event {
  lng: number;
  lat: number;
}

export async function queryEventsInViewport(
  db: DbClient,
  query: ViewportQuery,
): Promise<EventWithCoords[]> {
  const {
    west,
    south,
    east,
    north,
    categories,
    minSeverity = 1,
    minConfidence = 0,
    after,
    limit = 100,
    offset = 0,
  } = query;

  const conditions = [
    sql`ST_Intersects(${events.location}, ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)::geography)`,
    gte(events.severity, minSeverity),
    gte(events.confidence, minConfidence),
    or(isNull(events.expiresAt), gte(events.expiresAt, new Date())),
  ];

  if (categories && categories.length > 0) {
    conditions.push(inArray(events.category, categories));
  }

  if (after) {
    conditions.push(gte(events.timestamp, after));
  }

  const rows = await db
    .select({
      event: events,
      lng: sql<number>`ST_X(${events.location}::geometry)`,
      lat: sql<number>`ST_Y(${events.location}::geometry)`,
    })
    .from(events)
    .where(and(...conditions))
    .orderBy(desc(events.timestamp))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    ...row.event,
    lng: row.lng,
    lat: row.lat,
  }));
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    id: string;
    title: string;
    summary: string;
    category: string;
    severity: number;
    confidence: number;
    locationName: string;
    countryCode: string | null;
    timestamp: string;
    ageMinutes: number;
    sourceCount: number;
  };
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export async function queryEventsGeoJSON(
  db: DbClient,
  query: ViewportQuery,
): Promise<GeoJSONFeatureCollection> {
  const rows = await queryEventsInViewport(db, query);

  const features: GeoJSONFeature[] = rows.map((row) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [row.lng, row.lat],
    },
    properties: {
      id: row.id,
      title: row.title,
      summary: row.summary,
      category: row.category,
      severity: row.severity,
      confidence: row.confidence,
      locationName: row.locationName,
      countryCode: row.countryCode,
      timestamp: row.timestamp.toISOString(),
      ageMinutes: Math.max(
        0,
        (Date.now() - row.timestamp.getTime()) / 60_000,
      ),
      sourceCount: Array.isArray(row.sources) ? row.sources.length : 0,
    },
  }));

  return { type: "FeatureCollection", features };
}

export async function insertEvent(
  db: DbClient,
  event: Omit<NewEvent, "id" | "createdAt" | "updatedAt"> & {
    lat: number;
    lng: number;
  },
): Promise<Event> {
  const { lat, lng, ...rest } = event;

  const [inserted] = await db
    .insert(events)
    .values({
      ...rest,
      location: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`,
    })
    .returning();

  return inserted;
}

export async function upsertEvent(
  db: DbClient,
  event: Omit<NewEvent, "id" | "createdAt" | "updatedAt"> & {
    lat: number;
    lng: number;
    existingId: string;
  },
): Promise<Event> {
  const { lat, lng, existingId, ...rest } = event;

  const [upserted] = await db
    .insert(events)
    .values({
      id: existingId,
      ...rest,
      location: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`,
    })
    .onConflictDoUpdate({
      target: events.id,
      set: {
        ...rest,
        location: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`,
        updatedAt: new Date(),
      },
    })
    .returning();

  return upserted;
}

export async function findNearbyEvents(
  db: DbClient,
  lat: number,
  lng: number,
  category: EventCategory,
  withinKm: number = 50,
  withinHours: number = 6,
): Promise<EventWithCoords[]> {
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);

  const rows = await db
    .select({
      event: events,
      lng: sql<number>`ST_X(${events.location}::geometry)`,
      lat: sql<number>`ST_Y(${events.location}::geometry)`,
    })
    .from(events)
    .where(
      and(
        sql`ST_DWithin(${events.location}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${withinKm * 1000})`,
        sql`${events.category} = ${category}`,
        gte(events.timestamp, since),
      ),
    )
    .orderBy(desc(events.timestamp));

  return rows.map((row) => ({
    ...row.event,
    lng: row.lng,
    lat: row.lat,
  }));
}
