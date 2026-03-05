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
   - Think about the ROOT CAUSE: what real-world crisis is driving this event?

   ## Situation hierarchy for complex conflicts
   When a major conflict or crisis involves multiple countries, organize events into LAYERED situations:

   **Core conflict situation** — The primary military/political confrontation.
   Assign direct combat events here: airstrikes, missile launches, ground offensives, naval engagements,
   retaliatory attacks — regardless of which country they physically occur in.
   Example: if Country A strikes Country B, and Country B retaliates against Country A's allies,
   ALL of those events belong to the SAME core conflict situation.

   **Regional spillover situations** — Secondary effects that spread to neighboring countries.
   Create separate situations when a distinct sub-theater emerges with its own dynamic:
   e.g., drone attacks on a neutral neighbor's territory, shipping lane closures in a strait,
   cross-border ground offensives by non-state actors. These are RELATED to the core conflict
   but are geographically and operationally distinct.

   **Allied/international response situations** — Third-party military deployments, NATO responses,
   naval task forces, air defense postures by countries not directly at war. These are responses TO
   the conflict, not part of the fighting itself.

   ## Matching rules
   - Match by ROOT CAUSE first, not by geography. An airstrike in Country X that is part of a war
     between A and B belongs to the A-B war situation, not a "Country X conflict" situation.
   - Don't fragment: if a war involves 5 countries, it should be 1 core situation + a few spillover
     situations, NOT 5 separate country-level situations.
   - Same country + same category + same root cause = same situation.
   - If in doubt, assign to the broader existing situation rather than creating a new one.

3. **New situation** (LAST RESORT): Only create a new situation if NO existing situation covers this event's root cause.
   - Use descriptive titles that name the core dynamic, not just a country:
     e.g., "US-led air campaign against Iranian military targets",
     "Houthi attacks on Gulf shipping and energy infrastructure",
     "NATO naval deployments in Eastern Mediterranean"
   - Include the primary countries/region and the key event type
   - Do NOT include dates or version numbers

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
        `- [${s.id}] "${s.title}" | ${s.category} | severity ${s.severity} | countries: ${(s.countryCodes ?? []).join(",") || "??"} | ${s.status} | ${s.eventCount} events | since ${s.firstSeen.toISOString()}`,
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
      countryCodes: string[];
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
Country codes: ${newEvent.countryCodes.join(", ") || "unknown"}
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
