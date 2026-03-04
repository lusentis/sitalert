import { z } from "zod";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { upsertAdvisory } from "@travelrisk/db/queries";
import type { PoolClient } from "@travelrisk/db/client";
import type Redis from "ioredis";
import { withRetry } from "../processing/retry";

const AdvisorySchema = z.object({
  Title: z.string(),
  Category: z.array(z.string()),
  Summary: z.string(),
  Published: z.string(),
  Updated: z.string(),
  Link: z.string().url(),
  id: z.string(),
});

const ApiResponseSchema = z.array(AdvisorySchema);

function parseAdvisoryLevel(title: string): number {
  const match = title.match(/Level\s+(\d)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const API_URL = "https://cadataapi.state.gov/api/TravelAdvisories";
const SOURCE_NAME = "us-travel-advisories";
const CURSOR_KEY = "cursor:advisories:lastSync";

const openai = createOpenAI();

const CleanedBatchSchema = z.object({
  summaries: z.array(
    z.object({
      countryCode: z.string(),
      summary: z.string().max(500),
    }),
  ),
});

async function cleanSummaries(
  batch: { countryCode: string; rawSummary: string }[],
): Promise<Map<string, string>> {
  const { object } = await withRetry(() =>
    generateObject({
      model: openai("gpt-5-nano"),
      schema: CleanedBatchSchema,
      system: `You rewrite travel advisory summaries for a global audience.
Rules:
- Remove US-centric language ("U.S. citizens", "the Department of State", etc.)
- Write in neutral third person ("Travelers should..." not "You should...")
- Keep it concise: 1-2 sentences, max 500 characters
- Preserve key risks (crime, terrorism, civil unrest, health, etc.)
- No HTML, no special characters, clean punctuation`,
      prompt: `Rewrite each advisory summary:\n\n${batch.map((b) => `[${b.countryCode}]: ${b.rawSummary}`).join("\n\n")}`,
    }),
  );

  const map = new Map<string, string>();
  for (const s of object.summaries) {
    map.set(s.countryCode, s.summary);
  }
  return map;
}

/** US State Dept uses FIPS 10-4 codes; the map GeoJSON uses ISO 3166-1 alpha-2.
 *  Only entries where FIPS !== ISO are listed — unlisted codes pass through as-is. */
const FIPS_TO_ISO: Record<string, string> = {
  AC: "AG", AG: "DZ", AJ: "AZ", AN: "AD", AS: "AU", AU: "AT", AV: "AI",
  AY: "AQ", BA: "BH", BC: "BW", BD: "BM", BF: "BS", BG: "BD", BH: "BZ",
  BK: "BA", BL: "BO", BM: "MM", BN: "BJ", BO: "BY", BP: "SB", BU: "BG",
  BX: "BN", BY: "BI", CB: "KH", CD: "TD", CE: "LK", CF: "CG", CG: "CD",
  CH: "CN", CI: "CL", CJ: "KY", CN: "KM", CS: "CR", CT: "CF", DA: "DK",
  DO: "DM", DR: "DO", EI: "IE", EK: "GQ", EN: "EE", ES: "SV", EZ: "CZ",
  FP: "PF", GA: "GM", GB: "GA", GG: "GE", GJ: "GD", GM: "DE", GV: "GN",
  HA: "HT", HO: "HN", IC: "IS", IV: "CI", IZ: "IQ", JA: "JP", KN: "KP",
  KR: "KI", KS: "KR", KU: "KW", KV: "XK", LE: "LB", LG: "LV", LH: "LT",
  LI: "LR", LO: "SK", LS: "LI", LT: "LS", MA: "MG", MC: "MO", MG: "MN",
  MH: "MS", MI: "MW", MJ: "ME", MO: "MA", MP: "MU", MU: "OM", NG: "NE",
  NH: "VU", NI: "NG", NN: "SX", NS: "SR", NU: "NI", OD: "SS", PA: "PY",
  PM: "PA", PO: "PT", PP: "PG", PS: "PW", RI: "RS", RM: "MH", RP: "PH",
  RS: "RU", SC: "KN", SE: "SC", SF: "ZA", SG: "SN", SN: "SG", SP: "ES",
  SR: "CH", ST: "LC", SU: "SD", SW: "SE", TD: "TT", TI: "TJ", TK: "TC",
  TN: "TO", TO: "TG", TP: "ST", TS: "TN", TT: "TL", TU: "TR", TX: "TM",
  UC: "CW", UK: "GB", UP: "UA", UV: "BF", VI: "VG", VM: "VN", WA: "NA",
  WZ: "SZ", YM: "YE", ZA: "ZM", ZI: "ZW",
};

const BATCH_SIZE = 20;

export async function syncTravelAdvisories(db: PoolClient, redis?: Redis): Promise<number> {
  const res = await fetch(API_URL);
  if (!res.ok) {
    throw new Error(
      `US Travel Advisories API returned ${res.status}: ${res.statusText}`,
    );
  }

  const data: unknown = await res.json();
  const advisories = ApiResponseSchema.parse(data);

  // Load cursor — only process advisories updated since last sync
  let lastSyncAt: Date | null = null;
  if (redis) {
    const stored = await redis.get(CURSOR_KEY);
    if (stored) {
      lastSyncAt = new Date(stored);
      console.log(`[${SOURCE_NAME}] Last sync: ${lastSyncAt.toISOString()}`);
    }
  }

  // Parse and prepare all advisories
  const parsed = advisories.flatMap((advisory) => {
    const level = parseAdvisoryLevel(advisory.Title);
    if (level === 0) return [];
    const fipsCode = advisory.Category[0]?.trim().toUpperCase() ?? "";
    if (!fipsCode) return [];
    const countryCode = FIPS_TO_ISO[fipsCode] ?? fipsCode;
    return [{ advisory, level, countryCode, rawSummary: stripHtml(advisory.Summary) }];
  });

  // Filter to only changed advisories if we have a cursor
  const toProcess = lastSyncAt
    ? parsed.filter((p) => new Date(p.advisory.Updated) > lastSyncAt)
    : parsed;

  if (lastSyncAt && toProcess.length < parsed.length) {
    console.log(`[${SOURCE_NAME}] ${toProcess.length}/${parsed.length} advisories updated since last sync`);
  }

  if (toProcess.length === 0) {
    console.log(`[${SOURCE_NAME}] No advisories changed since last sync, skipping`);
    return 0;
  }

  // Clean summaries in batches via LLM
  const cleanedSummaries = new Map<string, string>();
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    try {
      const cleaned = await cleanSummaries(
        batch.map((p) => ({ countryCode: p.countryCode, rawSummary: p.rawSummary })),
      );
      for (const [code, summary] of cleaned) {
        cleanedSummaries.set(code, summary);
      }
    } catch (err: unknown) {
      console.warn(
        `[${SOURCE_NAME}] LLM cleanup failed for batch ${i / BATCH_SIZE + 1}, using raw text:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  let count = 0;
  for (const { advisory, level, countryCode, rawSummary } of toProcess) {
    await upsertAdvisory(db, {
      countryCode,
      level,
      title: advisory.Title,
      summary: (cleanedSummaries.get(countryCode) ?? rawSummary).slice(0, 1000),
      sourceUrl: advisory.Link,
      sourceName: SOURCE_NAME,
      updatedAt: new Date(advisory.Updated),
    });
    count++;
  }

  // Update cursor after successful sync
  if (redis) {
    await redis.set(CURSOR_KEY, new Date().toISOString());
  }

  console.log(`[${SOURCE_NAME}] Synced ${count} advisories (${cleanedSummaries.size} cleaned by LLM)`);
  return count;
}
