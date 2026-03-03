import { NextResponse } from "next/server";
import { createHttpClient } from "@sitalert/db/client";
import { getStats24h } from "@sitalert/db/queries";

const CACHE_TTL_SECONDS = 60;

let cachedStats: {
  data: Awaited<ReturnType<typeof getStats24h>>;
  expiresAt: number;
} | null = null;

export async function GET(): Promise<NextResponse> {
  try {
    // Check in-memory cache
    if (cachedStats && Date.now() < cachedStats.expiresAt) {
      return NextResponse.json(cachedStats.data, {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=30`,
          "X-Cache": "HIT",
        },
      });
    }

    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const db = createHttpClient(databaseUrl);
    const stats = await getStats24h(db);

    // Update cache
    cachedStats = {
      data: stats,
      expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
    };

    return NextResponse.json(stats, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=30`,
        "X-Cache": "MISS",
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("Stats API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
