import { NextRequest, NextResponse } from "next/server";
import { createHttpClient } from "@travelrisk/db/client";
import { querySituationsForFeed } from "@travelrisk/db/queries";
import { EventCategory, type EventCategory as EventCategoryType } from "@travelrisk/shared";

function parseCategories(str: string | null): EventCategoryType[] | undefined {
  if (!str) return undefined;
  const parts = str.split(",").filter(Boolean);
  const valid: EventCategoryType[] = [];
  for (const part of parts) {
    const result = EventCategory.safeParse(part);
    if (result.success) valid.push(result.data);
  }
  return valid.length > 0 ? valid : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const categories = parseCategories(searchParams.get("categories"));
    const minSeverity = searchParams.has("min_severity")
      ? Number(searchParams.get("min_severity"))
      : undefined;
    const after = searchParams.get("after")
      ? new Date(searchParams.get("after")!)
      : undefined;

    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const db = createHttpClient(databaseUrl);
    const situations = await querySituationsForFeed(db, {
      categories,
      minSeverity,
      after,
    });

    return NextResponse.json({ data: situations });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("Situations API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
