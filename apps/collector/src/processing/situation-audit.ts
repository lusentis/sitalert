import { generateObject, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { PoolClient, Situation } from "@travelrisk/db";
import {
  createSituation,
  updateSituation,
  mergeSituations,
  assignEventsToSituation,
  clusterOrphanedEvents as dbClusterOrphans,
  queryActiveSituationsFlat,
  queryCoverageGaps,
  queryEventTitlesByIds,
} from "@travelrisk/db";
import type { EventCategory } from "@travelrisk/shared";
import { withRetry } from "./retry";

const openai = createOpenAI();

// 3a. Orphaned event clustering — LLM-assisted to avoid "Country Category" fragmentation
export async function clusterOrphanedEvents(db: PoolClient): Promise<number> {
  const clusters = await dbClusterOrphans(db);
  if (clusters.length === 0) return 0;

  // Fetch ALL active situations (across categories) for LLM matching
  const allSituations = await queryActiveSituationsFlat(db);
  let assigned = 0;

  for (const cluster of clusters) {
    const { category, countryCode, eventIds, maxSeverity } = cluster;

    const eventTitles = await queryEventTitlesByIds(db, eventIds);

    // Use LLM to decide: assign to existing situation or create new one
    const targetSituationId = await matchOrphanCluster(
      allSituations,
      eventTitles,
      category,
      countryCode,
      maxSeverity,
      db,
      eventIds,
    );

    await assignEventsToSituation(db, eventIds, targetSituationId);
    assigned += eventIds.length;
  }

  return assigned;
}

const orphanMatchSchema = z.object({
  situationId: z
    .string()
    .nullable()
    .describe("ID of existing situation to assign to, or null to create new"),
  newTitle: z
    .string()
    .nullable()
    .describe("Title for new situation if creating one — must describe what is happening, NEVER 'Country Category'"),
});

async function matchOrphanCluster(
  allSituations: Situation[],
  eventTitles: string[],
  category: EventCategory,
  countryCode: string,
  maxSeverity: number,
  db: PoolClient,
  eventIds: string[],
): Promise<string> {
  try {
    const situationList = allSituations
      .map(
        (s) =>
          `- [${s.id}] "${s.title}" | ${s.category} | countries: ${(s.countryCodes ?? []).join(",") || "??"} | ${s.status}`,
      )
      .join("\n");

    const { object } = await withRetry(() =>
      generateObject({
        model: openai("gpt-5-nano"),
        schema: orphanMatchSchema,
        system: `You assign orphaned events to existing situations in a global event monitoring system.

PREFER assigning to an existing situation over creating a new one.

Key rules:
- Events that are SPILLOVER EFFECTS of a larger conflict belong to that conflict's situation,
  even if they're in a different country or category. Example: infrastructure damage in Azerbaijan
  from Iranian drone strikes belongs to the Iran conflict situation, NOT a new "Azerbaijan Infrastructure" situation.
- Transport disruptions, infrastructure damage, and other secondary effects caused by a conflict
  belong to the CONFLICT situation, not a separate category-specific situation.
- Only create a new situation if these events are genuinely unrelated to any existing situation.

BANNED new situation titles: "Country Category" patterns like "Peru Earthquake", "Azerbaijan Infrastructure".
Good titles describe WHAT is happening: "Flooding devastates coastal Peru", "Power grid failures across Baku".`,
        prompt: `Orphaned events to assign:
Country: ${countryCode}
Category: ${category}
Event titles:
${eventTitles.map((t) => `- ${t}`).join("\n")}

Active situations:
${situationList || "None"}

Should these events go into an existing situation, or do they need a new one?`,
      }),
    );

    if (object.situationId) {
      // Verify the situation exists
      const match = allSituations.find((s) => s.id === object.situationId);
      if (match) {
        await updateSituation(db, match.id, {
          severity: maxSeverity,
          countryCodes: [countryCode],
        });
        console.log(
          `[situation-audit] Assigned ${eventIds.length} orphans (${countryCode}/${category}) to "${match.title}"`,
        );
        return match.id;
      }
    }

    // Create new situation
    const title = object.newTitle || await generateSituationTitle(db, eventIds, countryCode, category);
    const situation = await createSituation(db, {
      title,
      summary: `Auto-created from ${eventIds.length} unassigned events`,
      category,
      severity: maxSeverity,
      countryCodes: [countryCode],
      lat: 0,
      lng: 0,
    });
    console.log(
      `[situation-audit] Created new situation "${title}" for ${eventIds.length} orphans (${countryCode}/${category})`,
    );
    return situation.id;
  } catch (err: unknown) {
    console.error(
      "[situation-audit] Orphan matching failed:",
      err instanceof Error ? err.message : err,
    );
    // Fallback: try simple country+category match
    const fallbackMatch = allSituations.find(
      (s) => s.category === category && s.countryCodes?.includes(countryCode),
    );
    if (fallbackMatch) return fallbackMatch.id;

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
    return situation.id;
  }
}

async function generateSituationTitle(
  db: PoolClient,
  eventIds: string[],
  countryCode: string,
  category: EventCategory,
): Promise<string> {
  try {
    const eventTitles = await queryEventTitlesByIds(db, eventIds);
    if (eventTitles.length === 0) {
      return `Unclassified ${category} events in ${countryCode}`;
    }

    const { text } = await withRetry(() =>
      generateText({
        model: openai("gpt-5-nano"),
        system: `Generate a situation title (max 120 chars) that describes WHAT IS HAPPENING.

BANNED: generic "Country + Category" titles like "Peru Earthquake", "Syria Conflict", "Brazil Weather Extreme".
These say nothing useful. NEVER generate titles in this pattern.

GOOD titles describe the specific event or crisis:
- "Magnitude 7.1 earthquake devastates coastal Peru"
- "Severe flooding across Buenos Aires province"
- "Baku metro bombing claimed by separatist group"

The title must answer "what is happening?" — include the specific event/action and location.
Do NOT include dates. Return ONLY the title text, nothing else.`,
        prompt: `Country: ${countryCode}\nCategory: ${category}\nEvent titles:\n${eventTitles.map((t) => `- ${t}`).join("\n")}`,
      }),
    );

    return text.trim().slice(0, 120);
  } catch (err: unknown) {
    console.error(
      "[situation-audit] Title generation failed:",
      err instanceof Error ? err.message : err,
    );
    return `Unclassified ${category} events in ${countryCode}`;
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
Identify pairs that should be merged because they represent the SAME root-cause crisis.

Merge when:
- Two situations describe the same conflict from different angles or countries
  (e.g., "Airstrikes on Iran" and "Iranian missile attacks on Israel" are ONE war)
- A situation is a direct military component of a broader ongoing conflict
  (e.g., attacks on Gulf states that are retaliation in a wider war)
- Duplicate or near-duplicate titles for the same crisis

Do NOT merge when:
- Situations share a root cause but represent genuinely distinct theaters
  (e.g., core war vs. allied naval deployments vs. shipping lane disruptions)
- Unrelated crises happen to be in the same country (earthquake vs. insurgency)

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
