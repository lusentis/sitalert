import Parser from "rss-parser";
import { BaseAdapter } from "./base.js";
import type { Platform, RawEvent, EventCategory } from "@sitalert/shared";

type GdacsCustomItem = {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  contentSnippet?: string;
  "gdacs:alertlevel"?: string;
  "gdacs:eventtype"?: string;
  "gdacs:severity"?: string;
  "geo:Point"?: { "geo:lat": string; "geo:long": string };
  "georss:point"?: string;
};

const ALERT_LEVEL_SEVERITY: Record<string, number> = {
  Green: 1,
  Orange: 3,
  Red: 5,
};

const EVENT_TYPE_CATEGORY: Record<string, EventCategory> = {
  EQ: "natural_disaster",
  TC: "weather_extreme",
  FL: "natural_disaster",
  VO: "natural_disaster",
  DR: "weather_extreme",
  WF: "natural_disaster",
};

function parseGeoPoint(
  item: GdacsCustomItem,
): { lat: number; lng: number } | undefined {
  // Try geo:Point first
  const geoPoint = item["geo:Point"];
  if (geoPoint) {
    const lat = parseFloat(geoPoint["geo:lat"]);
    const lng = parseFloat(geoPoint["geo:long"]);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { lat, lng };
    }
  }

  // Try georss:point (format: "lat lng")
  const georssPoint = item["georss:point"];
  if (georssPoint) {
    const parts = georssPoint.split(/\s+/);
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        return { lat, lng };
      }
    }
  }

  return undefined;
}

export class GdacsAdapter extends BaseAdapter {
  readonly name = "gdacs";
  readonly platform: Platform = "api";

  private seenGuids = new Set<string>();
  private parser: Parser<Record<string, unknown>, GdacsCustomItem>;

  private static readonly FEED_URL = "https://www.gdacs.org/xml/rss.xml";

  constructor(pollingInterval = 300_000) {
    super({ defaultConfidence: 1.0, pollingInterval });
    this.parser = new Parser({
      customFields: {
        item: [
          ["gdacs:alertlevel", "gdacs:alertlevel"],
          ["gdacs:eventtype", "gdacs:eventtype"],
          ["gdacs:severity", "gdacs:severity"],
          ["geo:Point", "geo:Point"],
          ["georss:point", "georss:point"],
        ],
      },
    });
  }

  protected async poll(): Promise<void> {
    const feed = await this.parser.parseURL(GdacsAdapter.FEED_URL);

    for (const item of feed.items) {
      const guid = item.guid;
      if (!guid || this.seenGuids.has(guid)) continue;
      this.seenGuids.add(guid);

      const alertLevel = item["gdacs:alertlevel"] ?? "Green";
      const eventType = item["gdacs:eventtype"] ?? "EQ";
      const severity = ALERT_LEVEL_SEVERITY[alertLevel] ?? 1;
      const category: EventCategory =
        EVENT_TYPE_CATEGORY[eventType] ?? "natural_disaster";

      const location = parseGeoPoint(item);

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: guid,
        rawText: `${item.title ?? "Unknown GDACS event"}\n${item.contentSnippet ?? ""}`,
        rawData: {
          alertLevel,
          eventType,
          gdacsSeverity: item["gdacs:severity"],
        },
        timestamp: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
        location,
        locationName: item.title,
        category,
        severity,
        confidence: this.defaultConfidence,
        title: item.title ?? `GDACS Alert - ${eventType}`,
        summary: item.contentSnippet ?? item.title ?? "",
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
