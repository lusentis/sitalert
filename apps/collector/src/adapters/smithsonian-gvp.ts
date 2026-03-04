import Parser from "rss-parser";
import type Redis from "ioredis";
import { BaseAdapter } from "./base";
import type { Platform, RawEvent } from "@travelrisk/shared";

type GvpItem = {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  contentSnippet?: string;
  "georss:point"?: string;
};

const TTL_7D = 7 * 24 * 60 * 60;

export class SmithsonianGvpAdapter extends BaseAdapter {
  readonly name = "smithsonian-gvp";
  readonly platform: Platform = "rss";

  private parser: Parser<Record<string, unknown>, GvpItem>;

  private static readonly FEED_URL =
    "https://volcano.si.edu/news/WeeklyVolcanoRSS.xml";

  constructor(pollingInterval = 86_400_000, redis?: Redis) {
    super({ defaultConfidence: 0.9, pollingInterval, redis });
    this.parser = new Parser({
      requestOptions: {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; news-aggregator/1.0)",
        },
      },
      customFields: {
        item: [["georss:point", "georss:point"]],
      },
    });
  }

  protected async poll(): Promise<void> {
    const response = await fetch(SmithsonianGvpAdapter.FEED_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; news-aggregator/1.0)",
      },
    });
    if (!response.ok) {
      throw new Error(`Smithsonian GVP RSS returned ${response.status}`);
    }
    const xml = await response.text();
    const feed = await this.parser.parseString(xml);

    const seen = this.getSeenSet(TTL_7D);

    for (const item of feed.items) {
      const guid = item.guid;
      if (!guid || (await seen.has(guid))) continue;
      await seen.add(guid);

      let location: { lat: number; lng: number } | undefined;
      const georssPoint = item["georss:point"];
      if (georssPoint) {
        const parts = georssPoint.split(/\s+/);
        if (parts.length >= 2) {
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
            location = { lat, lng };
          }
        }
      }

      const title = item.title ?? "Smithsonian GVP Volcano Report";

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: `gvp-${guid}`,
        rawText: `${title}\n${item.contentSnippet ?? ""}`,
        rawData: {},
        timestamp: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
        location,
        locationName: item.title ?? undefined,
        category: "natural_disaster",
        severity: 3,
        confidence: this.defaultConfidence,
        title,
        summary: item.contentSnippet?.slice(0, 500) ?? title,
        url: item.link,
        media: [],
      };

      this.emit(raw);
    }
  }
}
