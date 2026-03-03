import { z } from "zod";
import { BaseAdapter } from "./base.js";
import type { Platform, RawEvent } from "@sitalert/shared";

const WhoOutbreakSchema = z.object({
  Id: z.coerce.string(),
  Title: z.string(),
  PublicationDate: z.string(),
  UrlName: z.string(),
  Overview: z.string().nullable().optional(),
});

const WhoResponseSchema = z.object({
  value: z.array(WhoOutbreakSchema),
});

function extractCountry(title: string): string | undefined {
  // WHO titles follow pattern: "Disease Name – Country" or "Disease Name - Country"
  const match = title.match(/[–\-]\s*(.+)$/);
  return match?.[1]?.trim();
}

export class WhoOutbreaksAdapter extends BaseAdapter {
  readonly name = "who-outbreaks";
  readonly platform: Platform = "api";

  private seenIds = new Set<string>();

  private static readonly FEED_URL =
    "https://www.who.int/api/news/diseaseoutbreaknews?$top=20&$orderby=PublicationDate desc&$select=Id,Title,PublicationDate,UrlName,Overview";

  constructor(pollingInterval = 21_600_000) {
    super({ defaultConfidence: 0.9, pollingInterval });
  }

  protected async poll(): Promise<void> {
    const response = await fetch(WhoOutbreaksAdapter.FEED_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "sitalert/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(`WHO API returned ${response.status}`);
    }

    const json: unknown = await response.json();
    const data = WhoResponseSchema.parse(json);

    for (const outbreak of data.value) {
      if (this.seenIds.has(outbreak.Id)) continue;
      this.seenIds.add(outbreak.Id);

      const country = extractCountry(outbreak.Title);
      const overview = outbreak.Overview ?? "";

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: `who-${outbreak.Id}`,
        rawText: `${outbreak.Title}\n\n${overview}`.slice(0, 1500),
        rawData: {
          whoId: outbreak.Id,
          urlName: outbreak.UrlName,
        },
        timestamp: new Date(outbreak.PublicationDate).toISOString(),
        locationName: country,
        category: "health_epidemic",
        severity: 3,
        confidence: this.defaultConfidence,
        title: outbreak.Title,
        summary: overview.slice(0, 500) || outbreak.Title,
        url: `https://www.who.int/emergencies/disease-outbreak-news/${outbreak.UrlName}`,
        media: [],
      };

      this.emit(raw);
    }

    // Prune old IDs
    if (this.seenIds.size > 10_000) {
      const idsArray = Array.from(this.seenIds);
      this.seenIds = new Set(idsArray.slice(idsArray.length - 5_000));
    }
  }
}
