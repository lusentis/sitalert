import { z } from "zod";
import { upsertAdvisory } from "@travelrisk/db/queries";
import type { PoolClient } from "@travelrisk/db/client";

const AdvisorySchema = z.object({
  Title: z.string(),
  Category: z.array(z.string()),
  Summary: z.string(),
  Published: z.string(),
  Updated: z.string(),
  Link: z.string().url(),
  id: z.string(),
});

const ApiResponseSchema = z.array(AdvisorySchema);

function parseAdvisoryLevel(title: string): number {
  const match = title.match(/Level\s+(\d)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const API_URL = "https://cadataapi.state.gov/api/TravelAdvisories";
const SOURCE_NAME = "us-travel-advisories";

export async function syncTravelAdvisories(db: PoolClient): Promise<number> {
  const res = await fetch(API_URL);
  if (!res.ok) {
    throw new Error(
      `US Travel Advisories API returned ${res.status}: ${res.statusText}`,
    );
  }

  const data: unknown = await res.json();
  const advisories = ApiResponseSchema.parse(data);
  let count = 0;

  for (const advisory of advisories) {
    const level = parseAdvisoryLevel(advisory.Title);
    if (level === 0) continue;

    const countryCode = advisory.Category[0]?.trim().toUpperCase() ?? "";
    if (!countryCode) continue;

    const plainSummary = stripHtml(advisory.Summary);

    await upsertAdvisory(db, {
      countryCode,
      level,
      title: advisory.Title,
      summary: plainSummary.slice(0, 1000),
      sourceUrl: advisory.Link,
      sourceName: SOURCE_NAME,
      updatedAt: new Date(advisory.Updated),
    });
    count++;
  }

  console.log(`[${SOURCE_NAME}] Synced ${count} advisories`);
  return count;
}
