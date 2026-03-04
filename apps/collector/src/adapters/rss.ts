import crypto from "node:crypto";
import Parser from "rss-parser";
import type Redis from "ioredis";
import { BaseAdapter } from "./base";
import type { Platform, RawEvent } from "@travelrisk/shared";
import { SeenSet } from "../processing/seen-set";

interface FeedConfig {
  name: string;
  url: string;
}

const TTL_7D = 7 * 24 * 60 * 60;

export class RssAdapter extends BaseAdapter {
  readonly name = "rss";
  readonly platform: Platform = "rss";

  private feeds: FeedConfig[];
  private feedSeenSets = new Map<string, SeenSet>();
  private parser: Parser;

  constructor(feeds: FeedConfig[], pollingInterval = 300_000, redis?: Redis) {
    super({ defaultConfidence: 0.6, pollingInterval, redis });
    this.feeds = feeds;
    this.parser = new Parser();
  }

  protected override async init(): Promise<void> {
    if (!this.redis) {
      throw new Error(`[${this.name}] Redis required for SeenSet`);
    }
    for (const feed of this.feeds) {
      const urlHash = crypto.createHash("md5").update(feed.url).digest("hex").slice(0, 12);
      const seenSet = new SeenSet(this.redis, `rss:${urlHash}`, TTL_7D);
      this.feedSeenSets.set(feed.url, seenSet);
    }
  }

  protected async poll(): Promise<void> {
    const results = await Promise.allSettled(
      this.feeds.map((feedConfig) => this.pollFeed(feedConfig)),
    );
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") {
        console.error(
          `[rss] Error polling feed ${this.feeds[i].name}:`,
          result.reason instanceof Error ? result.reason.message : result.reason,
        );
      }
    }
  }

  private async pollFeed(feedConfig: FeedConfig): Promise<void> {
    const feed = await this.parser.parseURL(feedConfig.url);
    const seen = this.feedSeenSets.get(feedConfig.url);
    if (!seen) return;

    for (const item of feed.items) {
      const guid = item.guid ?? item.link ?? item.title ?? "";
      if (!guid || (await seen.has(guid))) continue;
      await seen.add(guid);

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
  }
}
