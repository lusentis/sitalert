import { z } from "zod";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { upsertSituation } from "@travelrisk/db/queries";
import type { PoolClient } from "@travelrisk/db/client";
import type Redis from "ioredis";
import type { Geocoder } from "../processing/geocoder";
import { withRetry } from "../processing/retry";

const LOG_PREFIX = "[wikipedia-conflicts]";

const WIKI_API_URL =
  "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_ongoing_armed_conflicts&prop=wikitext&format=json";

const WIKI_REVID_URL =
  "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_ongoing_armed_conflicts&prop=revid&format=json";

const CURSOR_KEY = "cursor:wikipedia:revid";

/** Severity tier → situation severity */
const TIER_SEVERITY: Record<string, number> = {
  major: 5,
  minor: 4,
  conflicts: 3,
  skirmishes: 2,
};

interface RawConflict {
  tier: string;
  severity: number;
  startYear: string;
  rawTitle: string;
  rawCountries: string[];
  continent: string;
  cumulativeFatalities: string;
  fatalities2025: string;
  fatalities2026: string;
}

const openai = createOpenAI();

const RewrittenConflictsSchema = z.object({
  conflicts: z.array(
    z.object({
      id: z.string(),
      title: z.string().max(120),
      summary: z.string().max(500),
    }),
  ),
});

async function rewriteBatch(
  batch: { id: string; rawTitle: string; countries: string[]; fatalities: string; fatalities2025: string; fatalities2026: string; tier: string }[],
): Promise<Map<string, { title: string; summary: string }>> {
  const { object } = await withRetry(() =>
    generateObject({
      model: openai("gpt-5-nano"),
      schema: RewrittenConflictsSchema,
      system: `You rewrite armed conflict titles and summaries for a global crisis monitoring dashboard.

Title rules:
- Max 120 chars, descriptive of the conflict
- Include the main region/countries involved
- Named conflicts should keep their name
- Good: "Myanmar civil war and ethnic conflicts across five countries"
- Good: "Russo-Ukrainian war with spillover into Russia and Belarus"
- Bad: "Myanmar Conflict" (too vague)

Summary rules:
- 1-3 sentences, max 500 chars, factual
- Mention: what the conflict is about, who is involved, scale (death toll)
- Include current year fatality info when available
- Neutral tone, no sensationalism
- Do NOT include "ongoing since" — the start year is shown separately`,
      prompt: `Rewrite each armed conflict for a dashboard:\n\n${batch.map((b) => `[${b.id}] (${b.tier})\nRaw title: ${b.rawTitle}\nCountries: ${b.countries.join(", ")}\n Cumulative fatalities: ${b.fatalities}\n2025 fatalities: ${b.fatalities2025}\n2026 fatalities: ${b.fatalities2026}`).join("\n\n")}`,
    }),
  );

  const map = new Map<string, { title: string; summary: string }>();
  for (const c of object.conflicts) {
    map.set(c.id, { title: c.title, summary: c.summary });
  }
  return map;
}

/**
 * Extract country names from wikitext {{flag|Country}} patterns.
 */
function extractCountries(cell: string): string[] {
  const flagPattern = /\{\{flag\|([^}]+)\}\}/gi;
  const countries: string[] = [];
  let match;
  while ((match = flagPattern.exec(cell)) !== null) {
    countries.push(match[1].trim());
  }
  return countries;
}

/**
 * Extract the first {{nts|number}} value from a cell, or the raw text.
 */
function extractFatalities(cell: string): string {
  const ntsMatch = cell.match(/\{\{nts\|([^}]+)\}\}/);
  if (ntsMatch) return ntsMatch[1].replace(/,/g, "").trim();
  const numMatch = cell.match(/([\d,]+)\+?/);
  if (numMatch) return numMatch[1].replace(/,/g, "").trim();
  return "unknown";
}

/**
 * Clean wikitext markup from a conflict title cell.
 */
function extractConflictTitle(cell: string): string {
  const lines = cell.split("\n").map((l) => l.trim()).filter(Boolean);

  let mainTitle = "";
  for (const line of lines) {
    if (/^\{\{[Tt]ree list(\/end)?\}\}$/.test(line)) continue;
    if (line.startsWith("* ") && !line.startsWith("** ")) {
      mainTitle = line.replace(/^\*\s*/, "");
      break;
    }
    if (!line.startsWith("*")) {
      mainTitle = line;
      break;
    }
  }

  if (!mainTitle) mainTitle = lines.join(" ");

  mainTitle = mainTitle.replace(/<!--[\s\S]*?-->/g, "");
  mainTitle = mainTitle.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
  mainTitle = mainTitle.replace(/\[\[([^\]]+)\]\]/g, "$1");
  mainTitle = mainTitle.replace(/\{\{[^}]*\}\}/g, "").trim();
  mainTitle = mainTitle.replace(/\s*\(disambiguation\)/gi, "");
  mainTitle = mainTitle.replace(/^\*+\s*/, "").replace(/\s+/g, " ").trim();

  return mainTitle || "Unknown conflict";
}

function extractTable(wikitext: string, sectionHeading: string): string | null {
  const sectionIdx = wikitext.indexOf(sectionHeading);
  if (sectionIdx === -1) return null;
  const tableStart = wikitext.indexOf('{| class="wikitable sortable"', sectionIdx);
  if (tableStart === -1) return null;
  const tableEnd = wikitext.indexOf("|}", tableStart);
  if (tableEnd === -1) return null;
  return wikitext.slice(tableStart, tableEnd + 2);
}

function parseWikitext(wikitext: string): RawConflict[] {
  const conflicts: RawConflict[] = [];

  const tiers: [string, string][] = [
    ["major", "===Major wars"],
    ["minor", "===Minor wars"],
    ["conflicts", "===Conflicts"],
    ["skirmishes", "===Skirmishes"],
  ];

  for (const [tier, heading] of tiers) {
    const tableContent = extractTable(wikitext, heading);
    if (!tableContent) {
      console.log(`${LOG_PREFIX} No table found for tier: ${tier}`);
      continue;
    }

    const rows = tableContent.split(/\n\|-/).slice(2);

    for (const row of rows) {
      const cells = row.split(/\n\|(?!\|)/).map((c) => c.trim()).filter(Boolean);

      if (cells.length < 6) continue;

      const startYearCell = cells[0];
      const titleCell = cells[1];
      const continentCell = cells[2];
      const locationCell = cells[3];
      const cumulativeCell = cells[4];
      const fatalities2025Cell = cells[5] ?? "";
      const fatalities2026Cell = cells[6] ?? "";

      const yearMatch = startYearCell.match(/(\d{4})/);
      const startYear = yearMatch?.[1] ?? "unknown";

      const rawTitle = extractConflictTitle(titleCell);
      const rawCountries = extractCountries(locationCell);
      const continent = continentCell
        .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .trim();

      if (rawCountries.length === 0) continue;

      conflicts.push({
        tier,
        severity: TIER_SEVERITY[tier] ?? 3,
        startYear,
        rawTitle,
        rawCountries,
        continent,
        cumulativeFatalities: extractFatalities(cumulativeCell),
        fatalities2025: extractFatalities(fatalities2025Cell),
        fatalities2026: extractFatalities(fatalities2026Cell),
      });
    }
  }

  return conflicts;
}

function elapsed(startMs: number): string {
  return `${((performance.now() - startMs) / 1000).toFixed(1)}s`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

const BATCH_SIZE = 10;

export async function syncWikipediaConflicts(
  db: PoolClient,
  geocoder: Geocoder,
  redis?: Redis,
): Promise<number> {
  const t0 = performance.now();
  console.log(`${LOG_PREFIX} Starting conflict sync...`);

  // Check revid cursor — skip sync if page hasn't changed
  if (redis) {
    const tRevCheck = performance.now();
    try {
      const resp = await fetch(WIKI_REVID_URL, {
        headers: { "User-Agent": "TravelRisk/1.0 (https://travelrisk.io)" },
      });
      if (resp.ok) {
        const json: unknown = await resp.json();
        const parsed = z.object({ parse: z.object({ revid: z.number() }) }).safeParse(json);
        if (parsed.success) {
          const currentRevid = String(parsed.data.parse.revid);
          const storedRevid = await redis.get(CURSOR_KEY);
          if (storedRevid === currentRevid) {
            console.log(`${LOG_PREFIX} Page unchanged (revid=${currentRevid}), skipping sync (${elapsed(tRevCheck)})`);
            return 0;
          }
          console.log(`${LOG_PREFIX} Page changed: revid ${storedRevid ?? "none"} → ${currentRevid} (${elapsed(tRevCheck)})`);
        }
      }
    } catch (err: unknown) {
      console.warn(`${LOG_PREFIX} Revid check failed, proceeding with full sync:`, err instanceof Error ? err.message : err);
    }
  }

  // Fetch wikitext
  const tFetch = performance.now();
  const response = await fetch(WIKI_API_URL, {
    headers: {
      "User-Agent": "TravelRisk/1.0 (https://travelrisk.io)",
    },
  });

  if (!response.ok) {
    throw new Error(`Wikipedia API returned ${response.status}`);
  }

  const json: unknown = await response.json();
  const apiResult = z
    .object({
      parse: z.object({
        revid: z.number().optional(),
        wikitext: z.object({
          "*": z.string(),
        }),
      }),
    })
    .parse(json);

  const wikitext = apiResult.parse.wikitext["*"];
  const revid = apiResult.parse.revid;
  console.log(`${LOG_PREFIX} Fetched wikitext in ${elapsed(tFetch)} (${(wikitext.length / 1024).toFixed(0)}KB, revid=${revid ?? "unknown"})`);

  // Parse into structured conflicts
  const tParse = performance.now();
  const conflicts = parseWikitext(wikitext);
  console.log(`${LOG_PREFIX} Parsed ${conflicts.length} conflicts in ${elapsed(tParse)}`);

  const byTier = new Map<string, number>();
  for (const c of conflicts) {
    byTier.set(c.tier, (byTier.get(c.tier) ?? 0) + 1);
  }
  console.log(
    `${LOG_PREFIX} By tier: ${Array.from(byTier.entries()).map(([t, n]) => `${t}=${n}`).join(", ")}`,
  );

  if (conflicts.length === 0) {
    console.log(`${LOG_PREFIX} No conflicts parsed, done in ${elapsed(t0)}`);
    return 0;
  }

  // Rewrite titles/summaries via LLM in batches
  const totalBatches = Math.ceil(conflicts.length / BATCH_SIZE);
  console.log(`${LOG_PREFIX} Rewriting via LLM (${totalBatches} batch(es))...`);
  const tLlm = performance.now();
  const rewritten = new Map<string, { title: string; summary: string }>();

  for (let i = 0; i < conflicts.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = conflicts.slice(i, i + BATCH_SIZE);
    const tBatch = performance.now();
    try {
      const result = await rewriteBatch(
        batch.map((c, batchIdx) => ({
          id: `${i + batchIdx}`,
          rawTitle: c.rawTitle,
          countries: c.rawCountries,
          fatalities: c.cumulativeFatalities,
          fatalities2025: c.fatalities2025,
          fatalities2026: c.fatalities2026,
          tier: c.tier,
        })),
      );
      for (const [id, val] of result) {
        rewritten.set(id, val);
      }
      console.log(`${LOG_PREFIX} LLM batch ${batchNum}/${totalBatches}: ${result.size} rewritten in ${elapsed(tBatch)}`);
    } catch (err: unknown) {
      console.warn(
        `${LOG_PREFIX} LLM batch ${batchNum}/${totalBatches} failed (${elapsed(tBatch)}), using raw text:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  console.log(`${LOG_PREFIX} LLM done in ${elapsed(tLlm)}: ${rewritten.size} rewritten`);

  // Geocode and upsert
  console.log(`${LOG_PREFIX} Geocoding and upserting...`);
  const tUpsert = performance.now();
  let count = 0;
  let skippedGeo = 0;

  for (const [idx, conflict] of conflicts.entries()) {
    const externalId = `wikipedia:${slugify(conflict.rawTitle)}`;

    let lat = 0;
    let lng = 0;
    const countryCodes: string[] = [];

    for (const name of conflict.rawCountries) {
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

    if (lat === 0 && lng === 0) {
      skippedGeo++;
      console.warn(
        `${LOG_PREFIX} [${idx + 1}/${conflicts.length}] Skipping: no geocode for "${conflict.rawCountries.join(", ")}"`,
      );
      continue;
    }

    const llmResult = rewritten.get(`${idx}`);
    const title = llmResult?.title ?? conflict.rawTitle;
    const summary =
      llmResult?.summary ??
      `Armed conflict in ${conflict.rawCountries.join(", ")}. Cumulative fatalities: ${conflict.cumulativeFatalities}.`;

    try {
      await upsertSituation(db, {
        externalId,
        title,
        summary,
        category: "conflict",
        severity: conflict.severity,
        countryCodes,
        lat,
        lng,
      });
      count++;
    } catch (err: unknown) {
      console.error(
        `${LOG_PREFIX} [${idx + 1}/${conflicts.length}] Failed to upsert ${externalId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Store revid cursor after successful sync
  if (redis && revid) {
    await redis.set(CURSOR_KEY, String(revid));
    console.log(`${LOG_PREFIX} Stored revid cursor: ${revid}`);
  }

  console.log(
    `${LOG_PREFIX} Upsert done in ${elapsed(tUpsert)}: ${count} synced, ${skippedGeo} no geocode`,
  );
  console.log(
    `${LOG_PREFIX} Sync complete in ${elapsed(t0)}: ${count} conflict situations from ${conflicts.length} parsed`,
  );
  return count;
}
