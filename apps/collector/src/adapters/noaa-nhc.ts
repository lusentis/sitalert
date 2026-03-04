import Parser from "rss-parser";
import type Redis from "ioredis";
import { BaseAdapter } from "./base";
import type { Platform, RawEvent } from "@travelrisk/shared";

type NhcItem = {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  contentSnippet?: string;
  "georss:point"?: string;
};

const TTL_7D = 7 * 24 * 60 * 60;

export class NoaaNhcAdapter extends BaseAdapter {
  readonly name = "noaa-nhc";
  readonly platform: Platform = "rss";

  private parser: Parser<Record<string, unknown>, NhcItem>;

  private static readonly FEED_URLS = [
    "https://www.nhc.noaa.gov/gis-at.xml",
    "https://www.nhc.noaa.gov/gis-ep.xml",
  ];

  constructor(pollingInterval = 600_000, redis?: Redis) {
    super({ defaultConfidence: 1.0, pollingInterval, redis });
    this.parser = new Parser({
      requestOptions: {
        headers: {
          "User-Agent": "travelrisk/1.0 (https://travelrisk.io)",
        },
      },
      customFields: {
        item: [["georss:point", "georss:point"]],
      },
    });
  }

  protected async poll(): Promise<void> {
    const results = await Promise.allSettled(
      NoaaNhcAdapter.FEED_URLS.map((url) => this.pollFeed(url)),
    );
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") {
        console.error(
          `[noaa-nhc] Error polling ${NoaaNhcAdapter.FEED_URLS[i]}:`,
          result.reason instanceof Error ? result.reason.message : result.reason,
        );
      }
    }
  }

  private async pollFeed(feedUrl: string): Promise<void> {
    const response = await fetch(feedUrl, {
      headers: {
        "User-Agent": "travelrisk/1.0 (https://travelrisk.io)",
      },
    });
    if (!response.ok) {
      throw new Error(`NOAA NHC returned ${response.status} for ${feedUrl}`);
    }
    const xml = await response.text();
    const feed = await this.parser.parseString(xml);

    const seen = this.getSeenSet(TTL_7D);

    for (const item of feed.items) {
      const guid = item.guid;
      if (!guid || (await seen.has(guid))) continue;

      // Skip placeholder/non-storm items (no georss:point means no active storm)
      const georssPoint = item["georss:point"];
      if (!georssPoint) continue;

      await seen.add(guid);

      const parts = georssPoint.split(/\s+/);
      let location: { lat: number; lng: number } | undefined;
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          location = { lat, lng };
        }
      }

      const title = item.title ?? "NOAA NHC Alert";

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: `nhc-${guid}`,
        rawText: `${title}\n${item.contentSnippet ?? ""}`,
        rawData: {
          feedUrl,
        },
        timestamp: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
        location,
        locationName: item.title ?? undefined,
        category: "weather_extreme",
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
