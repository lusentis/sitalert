import { z } from "zod";
import { BaseAdapter } from "./base.js";
import type { Platform, RawEvent } from "@sitalert/shared";

const AdvisorySchema = z.object({
  Title: z.string(),
  Category: z.array(z.string()), // Array of ISO2 country codes, e.g. ["QA"]
  Summary: z.string(),
  Published: z.string(),
  Updated: z.string(),
  Link: z.string().url(),
  id: z.string(),
});

const ApiResponseSchema = z.array(AdvisorySchema);

function parseAdvisoryLevel(title: string): number {
  const match = title.match(/Level\s+(\d)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}

function levelToSeverity(level: number): number {
  if (level >= 4) return 5;
  return Math.min(level, 5);
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

export class UsTravelAdvisoriesAdapter extends BaseAdapter {
  readonly name = "us-travel-advisories";
  readonly platform: Platform = "api";

  private static readonly API_URL =
    "https://cadataapi.state.gov/api/TravelAdvisories";

  /** Track seen advisories by countryCode:updatedTimestamp to detect changes */
  private seenKeys = new Set<string>();

  constructor(pollingInterval = 43_200_000) {
    // 12 hours default
    super({ defaultConfidence: 0.9, pollingInterval });
  }

  protected async poll(): Promise<void> {
    const res = await fetch(UsTravelAdvisoriesAdapter.API_URL);
    if (!res.ok) {
      throw new Error(
        `US Travel Advisories API returned ${res.status}: ${res.statusText}`,
      );
    }

    const data: unknown = await res.json();
    const advisories = ApiResponseSchema.parse(data);

    for (const advisory of advisories) {
      const level = parseAdvisoryLevel(advisory.Title);

      // Skip Level 1 ("Exercise Normal Precautions") — too noisy
      if (level < 2) continue;

      const countryCode = advisory.Category[0]?.trim().toUpperCase() ?? "";
      if (!countryCode) continue;

      const dedupKey = `${countryCode}:${advisory.Updated}`;
      if (this.seenKeys.has(dedupKey)) continue;
      this.seenKeys.add(dedupKey);

      const plainSummary = stripHtml(advisory.Summary);
      const countryMatch = advisory.Title.match(/^(.+?)\s*-\s*Level/i);
      const countryName = countryMatch ? countryMatch[1].trim() : countryCode;

      // Emit without category — let the pipeline's gpt-5-nano classifier handle it
      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: `us-advisory-${countryCode}-${advisory.Updated}`,
        rawText: `${advisory.Title}\n\n${plainSummary}`,
        rawData: {
          source: "US State Department",
          advisoryLevel: level,
          countryCode,
        },
        timestamp: new Date(advisory.Updated).toISOString(),
        locationName: countryName,
        countryCode,
        severity: levelToSeverity(level),
        confidence: this.defaultConfidence,
        title: advisory.Title,
        summary: plainSummary.slice(0, 500),
        url: advisory.Link,
        media: [],
      };

      this.emit(raw);
    }

    // Prune old keys
    if (this.seenKeys.size > 5_000) {
      const arr = Array.from(this.seenKeys);
      this.seenKeys = new Set(arr.slice(arr.length - 2_500));
    }
  }
}
