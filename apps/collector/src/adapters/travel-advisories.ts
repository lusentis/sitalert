import Parser from "rss-parser";
import { BaseAdapter } from "./base.js";
import type { Platform, RawEvent, EventCategory } from "@sitalert/shared";

function parseAdvisoryLevel(title: string): number {
  // US State Department format: "Country - Level X: Description"
  const match = title.match(/Level\s+(\d)/i);
  if (match) {
    const level = parseInt(match[1], 10);
    // Level 1 → severity 1, Level 2 → 2, Level 3 → 3, Level 4 → 5
    if (level >= 4) return 5;
    return Math.min(level, 5);
  }
  return 2; // default moderate
}

function inferCategoryFromAdvisory(title: string, description: string): EventCategory {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes("terrorism") || text.includes("terrorist")) return "terrorism";
  if (text.includes("crime") || text.includes("kidnapping")) return "civil_unrest";
  if (text.includes("conflict") || text.includes("war") || text.includes("armed")) return "conflict";
  if (text.includes("disease") || text.includes("health") || text.includes("epidemic")) return "health_epidemic";
  if (text.includes("natural disaster") || text.includes("earthquake") || text.includes("hurricane")) return "natural_disaster";
  return "civil_unrest";
}

export class TravelAdvisoriesAdapter extends BaseAdapter {
  readonly name = "travel-advisories";
  readonly platform: Platform = "api";

  private seenGuids = new Set<string>();
  private parser: Parser;

  private static readonly FEED_URL =
    "https://travel.state.gov/_res/rss/TAsTWs.xml";

  constructor(pollingInterval = 21_600_000) {
    // 6 hours default
    super({ defaultConfidence: 0.9, pollingInterval });
    this.parser = new Parser();
  }

  protected async poll(): Promise<void> {
    const feed = await this.parser.parseURL(TravelAdvisoriesAdapter.FEED_URL);

    for (const item of feed.items) {
      const guid = item.guid ?? item.link ?? item.title ?? "";
      if (!guid || this.seenGuids.has(guid)) continue;
      this.seenGuids.add(guid);

      const title = item.title ?? "Travel Advisory";
      const description = item.contentSnippet ?? item.content ?? "";
      const severity = parseAdvisoryLevel(title);
      const category = inferCategoryFromAdvisory(title, description);

      // Extract country name from title (before the dash)
      const countryMatch = title.match(/^(.+?)\s*-\s*Level/i);
      const countryName = countryMatch ? countryMatch[1].trim() : undefined;

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: `travel-advisory-${Buffer.from(guid).toString("base64url").slice(0, 32)}`,
        rawText: `${title}\n\n${description}`,
        rawData: {
          source: "US State Department",
        },
        timestamp: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
        locationName: countryName,
        category,
        severity,
        confidence: this.defaultConfidence,
        title,
        summary: description.slice(0, 500),
        url: item.link,
        media: [],
      };

      this.emit(raw);
    }

    // Prune old GUIDs
    if (this.seenGuids.size > 5_000) {
      const arr = Array.from(this.seenGuids);
      this.seenGuids = new Set(arr.slice(arr.length - 2_500));
    }
  }
}
