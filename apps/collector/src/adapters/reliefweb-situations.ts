import Parser from "rss-parser";
import { z } from "zod";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { upsertSituation } from "@travelrisk/db/queries";
import type { PoolClient } from "@travelrisk/db/client";
import type Redis from "ioredis";
import type { Geocoder } from "../processing/geocoder";
import type { EventCategory } from "@travelrisk/shared";
import { withRetry } from "../processing/retry";

const LOG_PREFIX = "[reliefweb-situations]";

type ReliefWebDisasterItem = {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  contentSnippet?: string;
  content?: string;
  categories?: string[];
};

/** GLIDE type prefix → EventCategory */
const GLIDE_TYPE_MAP: Record<string, EventCategory> = {
  EQ: "natural_disaster",
  TC: "weather_extreme",
  FL: "natural_disaster",
  VO: "natural_disaster",
  DR: "weather_extreme",
  FR: "natural_disaster",
  EP: "health_epidemic",
  CE: "conflict",
  CW: "weather_extreme",
  HT: "weather_extreme",
  LS: "natural_disaster",
  ST: "weather_extreme",
  AV: "natural_disaster",
  WF: "natural_disaster",
  SS: "weather_extreme",
  MS: "natural_disaster",
  OT: "natural_disaster",
};

const GLIDE_PATTERN = /^([A-Z]{2})-(\d{4})-\d{6}-[A-Z]{3}$/;

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const openai = createOpenAI();

const RewrittenBatchSchema = z.object({
  situations: z.array(
    z.object({
      id: z.string(),
      title: z.string().max(120),
      summary: z.string().max(500),
      severity: z.number().min(1).max(5),
      skip: z.boolean(),
    }),
  ),
});

type RewriteResult = { title: string; summary: string; severity: number; skip: boolean };

const LLM_CACHE_TTL = 48 * 60 * 60; // 48 hours
const LLM_CACHE_PREFIX = "reliefweb:llm:";

async function rewriteBatchWithCache(
  batch: { id: string; rawTitle: string; rawSummary: string; pubDate: string }[],
  redis: Redis | undefined,
): Promise<Map<string, RewriteResult>> {
  const results = new Map<string, RewriteResult>();
  const uncached: typeof batch = [];

  // Check cache for each item
  if (redis) {
    for (const item of batch) {
      const cached = await redis.get(`${LLM_CACHE_PREFIX}${item.id}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as RewriteResult;
          results.set(item.id, parsed);
          continue;
        } catch {
          // Invalid cache entry, re-process
        }
      }
      uncached.push(item);
    }

    if (uncached.length === 0) return results;
    if (uncached.length < batch.length) {
      console.log(`${LOG_PREFIX} LLM cache hit: ${batch.length - uncached.length}/${batch.length} items cached`);
    }
  } else {
    uncached.push(...batch);
  }

  // Call LLM for uncached items
  const llmResults = await rewriteBatch(uncached);

  // Store results in cache
  for (const [id, val] of llmResults) {
    results.set(id, val);
    if (redis) {
      await redis.set(`${LLM_CACHE_PREFIX}${id}`, JSON.stringify(val), "EX", LLM_CACHE_TTL);
    }
  }

  return results;
}

async function rewriteBatch(
  batch: { id: string; rawTitle: string; rawSummary: string; pubDate: string }[],
): Promise<Map<string, RewriteResult>> {
  const today = new Date().toISOString().slice(0, 10);

  const { object } = await withRetry(() =>
    generateObject({
      model: openai("gpt-5-nano"),
      schema: RewrittenBatchSchema,
      system: `You rewrite disaster situation titles and summaries for a global crisis monitoring dashboard.
Today's date is ${today}.

Title rules:
- Max 120 chars, but use as many as needed to be informative
- Describe WHAT is happening, not just the category and location
- Good: "Severe flooding displaces thousands in Colombia", "Tropical Cyclone Chido hits Mozambique and Mayotte", "Mpox outbreak spreading in Madagascar"
- Bad: "Colombia Floods", "Indonesia Transport", "Mozambique: Cyclone" (too vague, no context)
- Named events (cyclones, operations) should include the name
- Include the country/region so the title stands alone

Summary rules:
- 1-3 sentences, max 500 chars
- Key facts: what happened, where, scale of impact
- Neutral, factual tone — no sensationalism
- Remove ReliefWeb jargon, GLIDE codes, internal references
- Keep specific details: death tolls, displacement numbers, affected regions
- NEVER write filler like "no further info provided", "details are limited", "situation is developing"
- If the raw text is too vague to write a useful summary, set skip=true instead of writing a hollow summary

Severity assessment (1-5 scale based on CURRENT relevance as of ${today}):
- 5: Active crisis right now, major ongoing impact
- 4: Ongoing situation, significant current impact
- 3: Active but winding down, or moderate current impact
- 2: Mostly resolved or very low current impact
- 1: Clearly over, historical only

Set skip=true if the disaster is clearly no longer active or relevant today (e.g. a flood from months ago with no ongoing impact, a resolved short-term event). Be conservative — if in doubt, keep it with lower severity rather than skipping.`,
      prompt: `Assess and rewrite each disaster. Each entry includes its publication date for context:\n\n${batch.map((b) => `[${b.id}] (published: ${b.pubDate})\nTitle: ${b.rawTitle}\nDescription: ${b.rawSummary}`).join("\n\n")}`,
    }),
  );

  const map = new Map<string, RewriteResult>();
  for (const s of object.situations) {
    map.set(s.id, { title: s.title, summary: s.summary, severity: s.severity, skip: s.skip });
  }
  return map;
}

const BATCH_SIZE = 10;

function parseDisasterItem(item: ReliefWebDisasterItem): {
  glideCode: string | null;
  category: EventCategory;
  countryNames: string[];
  title: string;
  summary: string;
  link: string;
  pubDate: string;
} {
  const categories = item.categories ?? [];

  // Separate GLIDE codes from country names
  let glideCode: string | null = null;
  const countryNames: string[] = [];

  for (const cat of categories) {
    const match = cat.match(GLIDE_PATTERN);
    if (match) {
      glideCode = cat;
    } else if (!/-\d{4}-/.test(cat)) {
      // Not a GLIDE code — treat as country name
      countryNames.push(cat);
    }
  }

  // Infer category from GLIDE type prefix, fall back to title-based inference
  let eventCategory: EventCategory = "natural_disaster";
  if (glideCode) {
    const typePrefix = glideCode.slice(0, 2);
    eventCategory = GLIDE_TYPE_MAP[typePrefix] ?? "natural_disaster";
  }

  const rawSummary = item.content
    ? stripHtml(item.content)
    : item.contentSnippet ?? "";

  return {
    glideCode,
    category: eventCategory,
    countryNames,
    title: item.title ?? "Unknown disaster",
    summary: rawSummary.slice(0, 1000),
    link: item.link ?? "",
    pubDate: item.pubDate ?? new Date().toISOString(),
  };
}

// Use the unfiltered feed — query params like ?status=current trigger
// Cloudflare bot protection on datacenter IPs (Railway, etc.)
const FEED_URL = "https://reliefweb.int/disasters/rss.xml";

function elapsed(startMs: number): string {
  return `${((performance.now() - startMs) / 1000).toFixed(1)}s`;
}

export async function syncReliefWebSituations(
  db: PoolClient,
  geocoder: Geocoder,
  redis?: Redis,
): Promise<number> {
  const t0 = performance.now();
  console.log(`${LOG_PREFIX} Starting situation sync...`);

  const parser = new Parser<Record<string, unknown>, ReliefWebDisasterItem>({
    requestOptions: {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; news-aggregator/1.0)",
      },
    },
  });

  // Fetch the RSS feed
  console.log(`${LOG_PREFIX} Fetching RSS feed...`);
  const tFetch = performance.now();
  const response = await fetch(FEED_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; news-aggregator/1.0)",
      "Accept": "application/rss+xml, application/xml, text/xml, */*",
    },
  });
  const contentType = response.headers.get("content-type") ?? "unknown";
  console.log(`${LOG_PREFIX} ${FEED_URL} → ${response.status} (${contentType})`);

  if (!response.ok) {
    throw new Error(`ReliefWeb RSS returned ${response.status}`);
  }

  const xml = await response.text();
  if (!xml.includes("<rss") && !xml.includes("<feed")) {
    console.warn(`${LOG_PREFIX} Response doesn't look like RSS (first 200 chars): ${xml.slice(0, 200)}`);
    throw new Error(`ReliefWeb RSS returned non-RSS content (${contentType})`);
  }

  const feed = await parser.parseString(xml);
  console.log(`${LOG_PREFIX} Feed fetched in ${elapsed(tFetch)}: ${feed.items.length} items`);

  // Dedup by guid
  const seenGuids = new Set<string>();
  const items: ReliefWebDisasterItem[] = [];
  for (const item of feed.items) {
    if (!item.guid || seenGuids.has(item.guid)) continue;
    seenGuids.add(item.guid);
    items.push(item);
  }

  console.log(`${LOG_PREFIX} ${items.length} unique disasters`);

  // Parse all items and filter to those with GLIDE codes
  const parsed = items
    .map((item) => parseDisasterItem(item))
    .filter((p) => p.glideCode !== null);

  console.log(`${LOG_PREFIX} ${parsed.length} disasters with GLIDE codes`);

  if (parsed.length === 0) {
    console.log(`${LOG_PREFIX} No disasters to sync, done in ${elapsed(t0)}`);
    return 0;
  }

  // Rewrite titles/summaries and assess relevance via LLM in batches (with cache)
  const totalBatches = Math.ceil(parsed.length / BATCH_SIZE);
  console.log(`${LOG_PREFIX} Rewriting + assessing relevance via LLM (${totalBatches} batch(es) of ${BATCH_SIZE})...`);
  const tLlm = performance.now();
  const rewritten = new Map<string, RewriteResult>();

  for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = parsed.slice(i, i + BATCH_SIZE);
    const tBatch = performance.now();
    try {
      const result = await rewriteBatchWithCache(
        batch.map((p) => ({
          id: p.glideCode!,
          rawTitle: p.title,
          rawSummary: p.summary,
          pubDate: p.pubDate,
        })),
        redis,
      );
      const skipped = Array.from(result.values()).filter((r) => r.skip).length;
      for (const [id, val] of result) {
        rewritten.set(id, val);
      }
      console.log(`${LOG_PREFIX} LLM batch ${batchNum}/${totalBatches}: ${result.size} assessed (${skipped} marked stale) in ${elapsed(tBatch)}`);
    } catch (err: unknown) {
      console.warn(
        `${LOG_PREFIX} LLM batch ${batchNum}/${totalBatches} failed (${elapsed(tBatch)}), using raw text:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  const totalSkipped = Array.from(rewritten.values()).filter((r) => r.skip).length;
  console.log(`${LOG_PREFIX} LLM done in ${elapsed(tLlm)}: ${rewritten.size} assessed, ${totalSkipped} marked stale`);

  // Geocode and upsert
  console.log(`${LOG_PREFIX} Geocoding and upserting...`);
  const tUpsert = performance.now();
  let count = 0;
  let skippedGeo = 0;
  let skippedStale = 0;

  for (const [idx, p] of parsed.entries()) {
    const llmResult = rewritten.get(p.glideCode!);

    // Skip disasters the LLM marked as no longer relevant
    if (llmResult?.skip) {
      skippedStale++;
      console.log(
        `${LOG_PREFIX} [${idx + 1}/${parsed.length}] Skipping stale: ${p.glideCode} "${p.title}"`,
      );
      continue;
    }

    const externalId = `reliefweb:${p.glideCode}`;
    const severity = llmResult?.severity ?? 3;

    // Geocode all country names, use first for location
    let lat = 0;
    let lng = 0;
    const countryCodes: string[] = [];

    for (const name of p.countryNames) {
      const geo = await geocoder.geocode(name);
      if (geo) {
        if (lat === 0 && lng === 0) {
          lat = geo.lat;
          lng = geo.lng;
        }
        if (geo.countryCode && !countryCodes.includes(geo.countryCode)) {
          countryCodes.push(geo.countryCode);
        }
      }
    }

    // Skip if we couldn't geocode at all
    if (lat === 0 && lng === 0) {
      skippedGeo++;
      console.warn(
        `${LOG_PREFIX} [${idx + 1}/${parsed.length}] Skipping ${p.glideCode}: no geocode for "${p.countryNames.join(", ")}"`,
      );
      continue;
    }

    const title = llmResult?.title ?? p.title;
    const summary = llmResult?.summary ?? p.summary;

    try {
      await upsertSituation(db, {
        externalId,
        title,
        summary,
        category: p.category,
        severity,
        countryCodes,
        lat,
        lng,
      });
      count++;
    } catch (err: unknown) {
      console.error(
        `${LOG_PREFIX} [${idx + 1}/${parsed.length}] Failed to upsert ${externalId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `${LOG_PREFIX} Upsert done in ${elapsed(tUpsert)}: ${count} synced, ${skippedStale} stale, ${skippedGeo} no geocode`,
  );
  console.log(
    `${LOG_PREFIX} Sync complete in ${elapsed(t0)}: ${count} active situations from ${parsed.length} disasters`,
  );
  return count;
}
