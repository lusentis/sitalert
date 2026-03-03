import { NextRequest, NextResponse } from "next/server";
import { createHttpClient } from "@travelrisk/db/client";
import {
  queryEventsInViewport,
  queryEventsGeoJSON,
} from "@travelrisk/db/queries";
import { EventsQuerySchema, EventCategory } from "@travelrisk/shared";
import { z } from "zod";

function parseBBox(
  bboxStr: string | null,
): { west: number; south: number; east: number; north: number } | undefined {
  if (!bboxStr) return undefined;

  const parts = bboxStr.split(",").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    return undefined;
  }

  return {
    west: parts[0],
    south: parts[1],
    east: parts[2],
    north: parts[3],
  };
}

function parseCategories(categoriesStr: string | null): z.infer<typeof EventCategory>[] | undefined {
  if (!categoriesStr) return undefined;

  const parts = categoriesStr.split(",").filter(Boolean);
  const valid: z.infer<typeof EventCategory>[] = [];

  for (const part of parts) {
    const result = EventCategory.safeParse(part);
    if (result.success) {
      valid.push(result.data);
    }
  }

  return valid.length > 0 ? valid : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const rawParams = {
      bbox: parseBBox(searchParams.get("bbox")),
      categories: parseCategories(searchParams.get("categories")),
      minSeverity: searchParams.has("min_severity")
        ? Number(searchParams.get("min_severity"))
        : undefined,
      minConfidence: searchParams.has("min_confidence")
        ? Number(searchParams.get("min_confidence"))
        : undefined,
      after: searchParams.get("after") ?? undefined,
      before: searchParams.get("before") ?? undefined,
      limit: searchParams.has("limit")
        ? Number(searchParams.get("limit"))
        : undefined,
      offset: searchParams.has("offset")
        ? Number(searchParams.get("offset"))
        : undefined,
      format: (searchParams.get("format") ?? "json") as "json" | "geojson",
    };

    const parsed = EventsQuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const query = parsed.data;
    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const db = createHttpClient(databaseUrl);

    // Clamp bbox to avoid PostGIS antipodal edge error when bbox spans ≥180° longitude.
    // ST_MakeEnvelope with geography type fails when any edge spans ≥ half the globe.
    // Empirically, ±179 works but ±179.1+ triggers the error on Neon/PostGIS.
    const bboxQuery = query.bbox
      ? {
          west: Math.max(query.bbox.west, -179),
          south: Math.max(query.bbox.south, -89),
          east: Math.min(query.bbox.east, 179),
          north: Math.min(query.bbox.north, 89),
        }
      : {};

    const baseQuery = {
      ...bboxQuery,
      categories: query.categories,
      minSeverity: query.minSeverity,
      minConfidence: query.minConfidence,
      after: query.after ? new Date(query.after) : undefined,
      limit: query.limit ?? 100,
      offset: query.offset,
    };

    if (query.format === "geojson") {
      const geojsonQuery = {
        ...baseQuery,
        limit: query.limit ?? 5000,
      };
      const geojson = await queryEventsGeoJSON(db, geojsonQuery);
      return NextResponse.json(geojson);
    }

    const events = await queryEventsInViewport(db, baseQuery);
    return NextResponse.json({
      data: events,
      meta: {
        count: events.length,
        limit: query.limit ?? 100,
        offset: query.offset,
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("Events API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
