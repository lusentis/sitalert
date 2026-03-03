import Parser from "rss-parser";
import { BaseAdapter } from "./base.js";
import type { Platform, RawEvent } from "@travelrisk/shared";

type NhcItem = {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  contentSnippet?: string;
  "georss:point"?: string;
};

export class NoaaNhcAdapter extends BaseAdapter {
  readonly name = "noaa-nhc";
  readonly platform: Platform = "rss";

  private seenGuids = new Set<string>();
  private parser: Parser<Record<string, unknown>, NhcItem>;

  private static readonly FEED_URLS = [
    "https://www.nhc.noaa.gov/gis-at.xml",
    "https://www.nhc.noaa.gov/gis-ep.xml",
  ];

  constructor(pollingInterval = 600_000) {
    super({ defaultConfidence: 1.0, pollingInterval });
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
    for (const feedUrl of NoaaNhcAdapter.FEED_URLS) {
      try {
        await this.pollFeed(feedUrl);
      } catch (err: unknown) {
        console.error(
          `[noaa-nhc] Error polling ${feedUrl}:`,
          err instanceof Error ? err.message : err,
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

    for (const item of feed.items) {
      const guid = item.guid;
      if (!guid || this.seenGuids.has(guid)) continue;

      // Skip placeholder/non-storm items (no georss:point means no active storm)
      const georssPoint = item["georss:point"];
      if (!georssPoint) continue;

      this.seenGuids.add(guid);

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
        locationName: title,
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

    // Prune old GUIDs
    if (this.seenGuids.size > 10_000) {
      const arr = Array.from(this.seenGuids);
      this.seenGuids = new Set(arr.slice(arr.length - 5_000));
    }
  }
}
