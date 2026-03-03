import Parser from "rss-parser";
import { BaseAdapter } from "./base.js";
import type { Platform, RawEvent } from "@travelrisk/shared";

type GvpItem = {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  contentSnippet?: string;
  "georss:point"?: string;
};

export class SmithsonianGvpAdapter extends BaseAdapter {
  readonly name = "smithsonian-gvp";
  readonly platform: Platform = "rss";

  private seenGuids = new Set<string>();
  private parser: Parser<Record<string, unknown>, GvpItem>;

  private static readonly FEED_URL =
    "https://volcano.si.edu/news/WeeklyVolcanoRSS.xml";

  constructor(pollingInterval = 86_400_000) {
    super({ defaultConfidence: 0.9, pollingInterval });
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
    const response = await fetch(SmithsonianGvpAdapter.FEED_URL, {
      headers: {
        "User-Agent": "travelrisk/1.0 (https://travelrisk.io)",
      },
    });
    if (!response.ok) {
      throw new Error(`Smithsonian GVP RSS returned ${response.status}`);
    }
    const xml = await response.text();
    const feed = await this.parser.parseString(xml);

    for (const item of feed.items) {
      const guid = item.guid;
      if (!guid || this.seenGuids.has(guid)) continue;
      this.seenGuids.add(guid);

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
        locationName: title,
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

    // Prune old GUIDs
    if (this.seenGuids.size > 10_000) {
      const arr = Array.from(this.seenGuids);
      this.seenGuids = new Set(arr.slice(arr.length - 5_000));
    }
  }
}
