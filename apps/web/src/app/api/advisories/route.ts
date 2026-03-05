import { NextResponse } from "next/server";
import { createHttpClient } from "@travelrisk/db/client";
import { queryAllAdvisories } from "@travelrisk/db/queries";

export async function GET() {
  try {
    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const db = createHttpClient(databaseUrl);
    const advisories = await queryAllAdvisories(db);

    return NextResponse.json({ data: advisories });
  } catch (err: unknown) {
    console.error("Advisories API error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
