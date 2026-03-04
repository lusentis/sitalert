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
Given a new event and lists of candidate duplicates and active situations, decide ONE of three actions:

1. **Duplicate detection**: Is this new event reporting the SAME real-world incident as an existing event, just from a different source? If so, set duplicateOf to that event's ID.
   - Same earthquake, same attack, same storm = duplicate.
   - Aftershocks, follow-up developments, escalations = NOT duplicates (they are new events).
   - Different incidents in the same region = NOT duplicates.

2. **Situation assignment**: Does this event belong to an ongoing situation? If so, set situationId.
   - Group events that are part of the same ongoing crisis, conflict, disaster zone, or regional security concern.
   - Be BROAD in grouping: events in the same country about the same type of crisis belong together.

3. **New situation**: If no existing situation matches, create a new one. EVERY event must belong to a situation.
   - Use a clear, descriptive title for the situation (e.g., "Ukraine Conflict", "East Africa Drought", "Myanmar Civil War").
   - Situations represent ongoing regional concerns, not individual incidents.

RULES:
- EVERY event MUST result in exactly one action: duplicate, assign to situation, or create new situation.
- duplicateOf, situationId, and newSituation are MUTUALLY EXCLUSIVE — set exactly ONE.
- If the event is a duplicate, set ONLY duplicateOf.
- If assigning to an existing situation, set ONLY situationId.
- If no situation matches, set ONLY newSituation. Never leave all fields null.`;

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
    if (candidateDuplicates.length === 0 && activeSituations.length === 0) {
      return { duplicateOf: null, situationId: null, newSituation: null };
    }

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

      const { object } = await withRetry(() =>
        generateObject({
          model: openai(this.model),
          // model: groq(this.model),
          schema: judgmentSchema,
          system: SYSTEM_PROMPT,
          prompt,
        }),
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
