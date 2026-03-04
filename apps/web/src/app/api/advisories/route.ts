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
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("Advisories API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
