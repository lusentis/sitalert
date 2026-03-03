import Parser from "rss-parser";
import { BaseAdapter } from "./base.js";
import type { Platform, RawEvent } from "@travelrisk/shared";

interface FeedConfig {
  name: string;
  url: string;
}

export class RssAdapter extends BaseAdapter {
  readonly name = "rss";
  readonly platform: Platform = "rss";

  private feeds: FeedConfig[];
  private seenGuids = new Map<string, Set<string>>();
  private parser: Parser;

  constructor(feeds: FeedConfig[], pollingInterval = 300_000) {
    super({ defaultConfidence: 0.6, pollingInterval });
    this.feeds = feeds;
    this.parser = new Parser();
  }

  protected override async init(): Promise<void> {
    // Initialize seen GUID sets per feed
    for (const feed of this.feeds) {
      this.seenGuids.set(feed.url, new Set());
    }
  }

  protected async poll(): Promise<void> {
    for (const feedConfig of this.feeds) {
      try {
        await this.pollFeed(feedConfig);
      } catch (err: unknown) {
        console.error(
          `[rss] Error polling feed ${feedConfig.name}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  private async pollFeed(feedConfig: FeedConfig): Promise<void> {
    const feed = await this.parser.parseURL(feedConfig.url);
    const seenSet = this.seenGuids.get(feedConfig.url);
    if (!seenSet) return;

    for (const item of feed.items) {
      const guid = item.guid ?? item.link ?? item.title ?? "";
      if (!guid || seenSet.has(guid)) continue;
      seenSet.add(guid);

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: `rss-${feedConfig.name}-${Buffer.from(guid).toString("base64url").slice(0, 32)}`,
        rawText: `${item.title ?? ""}\n\n${item.contentSnippet ?? item.content ?? ""}`.trim(),
        rawData: {
          feedName: feedConfig.name,
          feedUrl: feedConfig.url,
          author: item.creator ?? item["dc:creator"],
        },
        timestamp: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
        confidence: this.defaultConfidence,
        title: item.title,
        url: item.link,
        media: [],
      };

      this.emit(raw);
    }

    // Prune per-feed seen sets
    if (seenSet.size > 5_000) {
      const arr = Array.from(seenSet);
      seenSet.clear();
      for (const id of arr.slice(arr.length - 2_500)) {
        seenSet.add(id);
      }
    }
  }
}
