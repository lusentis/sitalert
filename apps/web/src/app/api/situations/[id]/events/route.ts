import { NextRequest, NextResponse } from "next/server";
import { createHttpClient } from "@travelrisk/db/client";
import { queryEventsBySituation } from "@travelrisk/db/queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const db = createHttpClient(databaseUrl);
    const events = await queryEventsBySituation(db, id);

    return NextResponse.json({ data: events });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("Situation events API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
