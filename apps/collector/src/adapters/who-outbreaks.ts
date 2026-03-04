import { z } from "zod";
import type Redis from "ioredis";
import { BaseAdapter } from "./base";
import type { Platform, RawEvent } from "@travelrisk/shared";

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

const TTL_7D = 7 * 24 * 60 * 60;

export class WhoOutbreaksAdapter extends BaseAdapter {
  readonly name = "who-outbreaks";
  readonly platform: Platform = "api";

  private static readonly FEED_URL =
    "https://www.who.int/api/news/diseaseoutbreaknews?$top=20&$orderby=PublicationDate desc&$select=Id,Title,PublicationDate,UrlName,Overview";

  constructor(pollingInterval = 21_600_000, redis?: Redis) {
    super({ defaultConfidence: 0.9, pollingInterval, redis });
  }

  protected async poll(): Promise<void> {
    const response = await fetch(WhoOutbreaksAdapter.FEED_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; news-aggregator/1.0)",
      },
    });
    if (!response.ok) {
      throw new Error(`WHO API returned ${response.status}`);
    }

    const json: unknown = await response.json();
    const data = WhoResponseSchema.parse(json);

    const seen = this.getSeenSet(TTL_7D);

    for (const outbreak of data.value) {
      if (await seen.has(outbreak.Id)) continue;
      await seen.add(outbreak.Id);

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
  }
}
