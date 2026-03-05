import Parser from "rss-parser";
import { BaseAdapter } from "./base";
import type { Platform, RawEvent, EventCategory } from "@travelrisk/shared";

type ReliefWebItem = {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  contentSnippet?: string;
  categories?: string[];
};

function inferCategory(title: string): EventCategory {
  const lower = title.toLowerCase();
  if (lower.includes("earthquake") || lower.includes("tsunami")) return "natural_disaster";
  if (lower.includes("flood") || lower.includes("flooding")) return "natural_disaster";
  if (lower.includes("cyclone") || lower.includes("hurricane") || lower.includes("typhoon") || lower.includes("storm")) return "weather_extreme";
  if (lower.includes("volcano") || lower.includes("eruption")) return "natural_disaster";
  if (lower.includes("drought")) return "weather_extreme";
  if (lower.includes("wildfire") || lower.includes("fire")) return "natural_disaster";
  if (lower.includes("conflict") || lower.includes("war") || lower.includes("armed") || lower.includes("military")) return "conflict";
  if (lower.includes("terror") || lower.includes("attack") || lower.includes("bombing")) return "terrorism";
  if (lower.includes("epidemic") || lower.includes("outbreak") || lower.includes("pandemic") || lower.includes("disease") || lower.includes("cholera") || lower.includes("ebola")) return "health_epidemic";
  if (lower.includes("protest") || lower.includes("unrest") || lower.includes("riot")) return "civil_unrest";
  return "natural_disaster";
}

export class ReliefWebAdapter extends BaseAdapter {
  readonly name = "reliefweb";
  readonly platform: Platform = "rss";

  private seenGuids = new Set<string>();
  private parser: Parser<Record<string, unknown>, ReliefWebItem>;

  private static readonly FEED_URL = "https://reliefweb.int/disasters/rss.xml?appname=lusentis-integration-sdf20gfu2&status=alert&status=current&status=ongoing";

  constructor(pollingInterval = 900_000) {
    super({ defaultConfidence: 0.8, pollingInterval });
    this.parser = new Parser({
      requestOptions: {
        headers: {
          "User-Agent": "lusentis-integration-sdf20gfu2",
        },
      },
    });
  }

  protected async poll(): Promise<void> {
    // Fetch manually to control headers and avoid rss-parser's HTTP client issues
    const response = await fetch(ReliefWebAdapter.FEED_URL, {
      headers: { "User-Agent": "lusentis-integration-sdf20gfu2" },
    });
    if (!response.ok) {
      throw new Error(`ReliefWeb RSS returned ${response.status}`);
    }
    const xml = await response.text();
    const feed = await this.parser.parseString(xml);

    for (const item of feed.items) {
      const guid = item.guid;
      if (!guid || this.seenGuids.has(guid)) continue;
      this.seenGuids.add(guid);

      const title = item.title ?? "Unknown ReliefWeb disaster";
      const category = inferCategory(title);

      // Extract country names from RSS categories (filter out GLIDE codes like "TC-2026-000009-MDG")
      const countries = item.categories ?? [];
      const countryNames = countries.filter((c) => !/-\d{4}-/.test(c));
      const locationName = countryNames.length > 0 ? countryNames.join(", ") : undefined;

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: `reliefweb-${guid}`,
        rawText: `${title}\n\n${item.contentSnippet ?? ""}`.slice(0, 1500),
        timestamp: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
        locationName,
        category,
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
