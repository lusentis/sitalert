import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
// import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";
import type { EventWithCoords, SituationWithCoords } from "@travelrisk/db";
import { withRetry } from "./retry";

export const judgmentSchema = z.object({
  duplicateOf: z
    .string()
    .nullable()
    .describe("ID of existing event this is a duplicate of, or null"),
  situationId: z
    .string()
    .nullable()
    .describe("ID of existing situation this belongs to, or null"),
  newSituation: z
    .object({
      title: z.string().max(120).describe("Short name for the ongoing situation"),
      summary: z
        .string()
        .max(500)
        .describe("Brief description of the situation"),
    })
    .nullable()
    .describe(
      "If this event starts a new situation, provide title and summary. Otherwise null.",
    ),
});

export type JudgmentResult = z.infer<typeof judgmentSchema>;

const SYSTEM_PROMPT = `You are a judgment module for a global event monitoring system (TravelRisk).
Given a new event and lists of candidate duplicates and active situations, decide ONE of three actions IN THIS PRIORITY ORDER:

1. **Duplicate detection** (CHECK FIRST — HIGHEST PRIORITY): Is this new event reporting the SAME real-world incident as an existing event, just from a different source? If so, set duplicateOf to that event's ID.
   - Same earthquake reported by USGS and EMSC = duplicate.
   - Same storm, same attack, same disaster from different news sources = duplicate.
   - IMPORTANT: Cross-source duplicates are COMMON. If two events describe the same incident (same location, same type, same time) but come from different sources, they ARE duplicates.
   - Aftershocks, follow-up developments, escalations = NOT duplicates (they are new events).
   - Different incidents in the same region = NOT duplicates.

2. **Situation assignment** (PREFERRED): If NOT a duplicate, does this event belong to an ongoing situation? If so, set situationId.
   - ALWAYS prefer assigning to an existing situation over creating a new one.
   - Group broadly: same country + same category = same situation (e.g., all forest fires in CAR = one situation).
   - Don't be picky about exact title matching — "Sudan Forest Fires" and "Forest fire in Sudan" are the SAME situation.
   - If in doubt, assign to the existing situation rather than creating a new one.

3. **New situation** (LAST RESORT): Only create a new situation if NO existing situation covers this event's country and category.
   - Use short, generic titles: "[Country] [Category]" (e.g., "Sudan Forest Fires", "Ukraine Conflict", "Haiti Civil Unrest").
   - Do NOT include dates, specifics, or qualifiers in situation titles.

RULES:
- EVERY event MUST result in exactly one action: duplicate, assign to situation, or create new situation.
- duplicateOf, situationId, and newSituation are MUTUALLY EXCLUSIVE — set exactly ONE.
- ALWAYS check for duplicates FIRST before considering situation assignment.
- If the event is a duplicate, set ONLY duplicateOf.
- If assigning to an existing situation, set ONLY situationId.
- ONLY create a new situation if no existing situation matches. Never leave all fields null.`;

const openai = createOpenAI();
// const groq = createGroq();

function formatCandidates(events: EventWithCoords[]): string {
  if (events.length === 0) return "None";
  return events
    .map(
      (e) =>
        `- [${e.id}] "${e.title}" | ${e.category} | ${e.locationName} | ${e.timestamp.toISOString()}`,
    )
    .join("\n");
}

function formatSituations(situations: SituationWithCoords[]): string {
  if (situations.length === 0) return "None";
  return situations
    .map(
      (s) =>
        `- [${s.id}] "${s.title}" | ${s.category} | severity ${s.severity} | ${s.eventCount} events | since ${s.firstSeen.toISOString()}`,
    )
    .join("\n");
}

export class Judgment {
  private model: string;

  constructor(model = "gpt-5-nano") {
    // constructor(model = "llama-3.1-8b-instant") {
    this.model = model;
  }

  async call(
    newEvent: {
      title: string;
      summary: string;
      category: string;
      locationName: string;
      timestamp: string;
    },
    candidateDuplicates: EventWithCoords[],
    activeSituations: SituationWithCoords[],
  ): Promise<JudgmentResult> {
    try {
      const prompt = `NEW EVENT:
Title: ${newEvent.title}
Summary: ${newEvent.summary}
Category: ${newEvent.category}
Location: ${newEvent.locationName}
Time: ${newEvent.timestamp}

CANDIDATE DUPLICATES:
${formatCandidates(candidateDuplicates)}

ACTIVE SITUATIONS:
${formatSituations(activeSituations)}

Analyze the new event against the candidates and situations above.`;

      const t0 = performance.now();
      const { object, usage, response } = await withRetry(() =>
        generateObject({
          model: openai(this.model),
          // model: groq(this.model),
          schema: judgmentSchema,
          system: SYSTEM_PROMPT,
          prompt,
        }),
      );
      const ms = (performance.now() - t0).toFixed(0);
      console.log(
        `[judgment] model=${response?.modelId ?? this.model} time=${ms}ms tokens=${usage.promptTokens}+${usage.completionTokens} candidates=${candidateDuplicates.length} situations=${activeSituations.length}`,
      );

      return object;
    } catch (err: unknown) {
      console.error(
        "[judgment] LLM judgment error:",
        err instanceof Error ? err.message : err,
      );
      return { duplicateOf: null, situationId: null, newSituation: null };
    }
  }
}
