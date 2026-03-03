import { NextRequest, NextResponse } from "next/server";
import { createHttpClient } from "@sitalert/db/client";
import {
  queryEventsInViewport,
  queryEventsGeoJSON,
} from "@sitalert/db/queries";
import { EventsQuerySchema, EventCategory } from "@sitalert/shared";
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

    const viewportQuery = {
      west: query.bbox?.west ?? -180,
      south: query.bbox?.south ?? -90,
      east: query.bbox?.east ?? 180,
      north: query.bbox?.north ?? 90,
      categories: query.categories,
      minSeverity: query.minSeverity,
      minConfidence: query.minConfidence,
      after: query.after ? new Date(query.after) : undefined,
      limit: query.limit,
      offset: query.offset,
    };

    if (query.format === "geojson") {
      const geojson = await queryEventsGeoJSON(db, viewportQuery);
      return NextResponse.json(geojson);
    }

    const events = await queryEventsInViewport(db, viewportQuery);
    return NextResponse.json({
      data: events,
      meta: {
        count: events.length,
        limit: query.limit,
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
