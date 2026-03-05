import { generateObject, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { PoolClient } from "@travelrisk/db";
import {
  findActiveSituations,
  createSituation,
  updateSituation,
  mergeSituations,
  assignEventsToSituation,
  clusterOrphanedEvents as dbClusterOrphans,
  queryActiveSituationsFlat,
  queryCoverageGaps,
  queryEventTitlesByIds,
} from "@travelrisk/db";
import { withRetry } from "./retry";

const openai = createOpenAI();

// 3a. Orphaned event clustering (SQL, no LLM)
export async function clusterOrphanedEvents(db: PoolClient): Promise<number> {
  const clusters = await dbClusterOrphans(db);
  let assigned = 0;

  for (const cluster of clusters) {
    const { category, countryCode, eventIds, maxSeverity } = cluster;

    // Check if an active situation covers this country+category
    const activeSits = await findActiveSituations(db, 0, 0, category, 500);
    const matchingSituation = activeSits.find(
      (s) => s.countryCodes?.includes(countryCode),
    );

    let targetSituationId: string;

    if (matchingSituation) {
      await updateSituation(db, matchingSituation.id, {
        severity: maxSeverity,
        countryCodes: [countryCode],
      });
      targetSituationId = matchingSituation.id;
    } else {
      const title = await generateSituationTitle(db, eventIds, countryCode, category);
      const situation = await createSituation(db, {
        title,
        summary: `Auto-created from ${eventIds.length} unassigned events`,
        category,
        severity: maxSeverity,
        countryCodes: [countryCode],
        lat: 0,
        lng: 0,
      });
      targetSituationId = situation.id;
    }

    await assignEventsToSituation(db, eventIds, targetSituationId);
    assigned += eventIds.length;
  }

  return assigned;
}

async function generateSituationTitle(
  db: PoolClient,
  eventIds: string[],
  countryCode: string,
  category: string,
): Promise<string> {
  try {
    const eventTitles = await queryEventTitlesByIds(db, eventIds);
    if (eventTitles.length === 0) {
      return `${countryCode} ${category.charAt(0).toUpperCase() + category.slice(1)}`;
    }

    const { text } = await withRetry(() =>
      generateText({
        model: openai("gpt-5-nano"),
        system: `Generate a short, descriptive situation title (max 120 chars) that summarizes these related events. Include the country/region and the key event type. Do NOT include dates. Return ONLY the title, nothing else.`,
        prompt: `Country: ${countryCode}\nCategory: ${category}\nEvent titles:\n${eventTitles.map((t) => `- ${t}`).join("\n")}`,
      }),
    );

    return text.trim().slice(0, 120);
  } catch (err: unknown) {
    console.error(
      "[situation-audit] Title generation failed:",
      err instanceof Error ? err.message : err,
    );
    return `${countryCode} ${category.charAt(0).toUpperCase() + category.slice(1)}`;
  }
}

// 3b. LLM-driven merge detection
const mergeSchema = z.object({
  merges: z.array(
    z.object({
      keepId: z.string().describe("ID of the situation to keep"),
      mergeId: z.string().describe("ID of the situation to merge into keepId"),
      reason: z.string().describe("Why these should be merged"),
    }),
  ),
});

export async function detectMergeCandidates(db: PoolClient): Promise<number> {
  const rows = await queryActiveSituationsFlat(db);

  if (rows.length < 2) return 0;

  const situationList = rows
    .map(
      (s) =>
        `- [${s.id}] "${s.title}" | ${s.category} | severity ${s.severity} | countries: ${(s.countryCodes ?? []).join(",") || "??"} | ${s.eventCount} events`,
    )
    .join("\n");

  try {
    const { object } = await withRetry(() =>
      generateObject({
        model: openai("gpt-5-nano"),
        schema: mergeSchema,
        system: `You analyze a list of active situations in a global event monitoring system.
Identify pairs that represent the SAME real-world crisis and should be merged.
Only suggest merges when you are confident — same conflict, same disaster, just named differently or covering overlapping countries.
The situation with more events should be the keepId (the one that survives).
Return an empty array if no merges are needed.`,
        prompt: `Active situations:\n${situationList}`,
      }),
    );

    let merged = 0;
    for (const merge of object.merges) {
      const keep = rows.find((s) => s.id === merge.keepId);
      const mergeTarget = rows.find((s) => s.id === merge.mergeId);

      if (keep && mergeTarget) {
        await mergeSituations(db, merge.keepId, merge.mergeId);
        console.log(
          `[situation-audit] Merged "${mergeTarget.title}" into "${keep.title}": ${merge.reason}`,
        );
        merged++;
      }
    }

    return merged;
  } catch (err: unknown) {
    console.error(
      "[situation-audit] Merge detection failed:",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

// 3c. Coverage gap logging
export async function logCoverageGaps(db: PoolClient): Promise<void> {
  const gaps = await queryCoverageGaps(db);

  for (const gap of gaps) {
    console.warn(
      `[situation-audit] Coverage gap: "${gap.title}" (sev ${gap.severity}, ext=${gap.externalId}) has no events in 48h`,
    );
  }
}

// Main audit function
export async function runSituationAudit(db: PoolClient): Promise<void> {
  console.log("[situation-audit] Starting audit...");

  const clustered = await clusterOrphanedEvents(db);
  if (clustered > 0) {
    console.log(`[situation-audit] Assigned ${clustered} orphaned events`);
  }

  const merged = await detectMergeCandidates(db);
  if (merged > 0) {
    console.log(`[situation-audit] Merged ${merged} duplicate situations`);
  }

  await logCoverageGaps(db);

  console.log("[situation-audit] Audit complete");
}
