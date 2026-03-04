import Parser from "rss-parser";
import type Redis from "ioredis";
import { BaseAdapter } from "./base";
import type { Platform, RawEvent, EventCategory } from "@travelrisk/shared";

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

const TTL_7D = 7 * 24 * 60 * 60;

export class GdacsAdapter extends BaseAdapter {
  readonly name = "gdacs";
  readonly platform: Platform = "api";

  private parser: Parser<Record<string, unknown>, GdacsCustomItem>;

  private static readonly FEED_URL = "https://www.gdacs.org/xml/rss.xml";

  constructor(pollingInterval = 300_000, redis?: Redis) {
    super({ defaultConfidence: 1.0, pollingInterval, redis });
    this.parser = new Parser({
      requestOptions: {
        headers: {
          "User-Agent": "travelrisk/1.0 (https://travelrisk.io)",
        },
      },
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

    const seen = this.getSeenSet(TTL_7D);

    for (const item of feed.items) {
      const guid = item.guid;
      if (!guid || (await seen.has(guid))) continue;

      const alertLevel = item["gdacs:alertlevel"] ?? "Green";
      const eventType = item["gdacs:eventtype"] ?? "EQ";
      const severity = ALERT_LEVEL_SEVERITY[alertLevel] ?? 1;
      const category: EventCategory =
        EVENT_TYPE_CATEGORY[eventType] ?? "natural_disaster";

      // Skip Green alerts — too many low-impact events (minor quakes, etc.)
      // Only Orange (severity 3) and Red (severity 5) are worth pipeline processing
      if (alertLevel === "Green") continue;

      await seen.add(guid);

      const location = parseGeoPoint(item);

      // Extract location from title (e.g. "Green earthquake alert (...) in Tonga")
      const titleStr = item.title ?? "Unknown GDACS event";
      const inMatch = titleStr.match(/ in (.+)$/);
      const locationName = inMatch?.[1] ?? undefined;

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: guid,
        rawText: `${titleStr}\n${item.contentSnippet ?? ""}`,
        rawData: {
          alertLevel,
          eventType,
          gdacsSeverity: item["gdacs:severity"],
        },
        timestamp: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
        location,
        locationName,
        category,
        severity,
        confidence: this.defaultConfidence,
        title: titleStr,
        summary: item.contentSnippet ?? item.title ?? "",
        url: item.link,
        media: [],
      };

      this.emit(raw);
    }
  }
}
