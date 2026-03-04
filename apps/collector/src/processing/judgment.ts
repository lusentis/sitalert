import { generateObject } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";
import type { EventWithCoords, SituationWithCoords } from "@travelrisk/db";

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
Given a new event and lists of candidate duplicates and active situations, make three decisions:

1. **Duplicate detection**: Is this new event reporting the SAME real-world incident as an existing event, just from a different source? If so, set duplicateOf to that event's ID.
   - Same earthquake, same attack, same storm = duplicate.
   - Aftershocks, follow-up developments, escalations = NOT duplicates (they are new events).
   - Different incidents in the same region = NOT duplicates.

2. **Situation assignment**: Does this event belong to an ongoing situation (crisis, disaster sequence, conflict, outbreak)? If so, set situationId.
   - Group events that are part of the same ongoing crisis.
   - Do NOT group unrelated events just because they are geographically close.

3. **New situation**: Should this event start a NEW situation? Only if it is a significant event likely to have follow-up reports (major disaster, conflict escalation, disease outbreak). Minor one-off events do not need situations.

RULES:
- duplicateOf and situationId are MUTUALLY EXCLUSIVE. If the event is a duplicate, set ONLY duplicateOf (situationId and newSituation must be null).
- If assigning to an existing situation, set ONLY situationId (duplicateOf and newSituation must be null).
- If creating a new situation, set ONLY newSituation (duplicateOf and situationId must be null).
- If the event is standalone (not a duplicate, no situation), set ALL fields to null.`;

const groq = createGroq();

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

  constructor(model = "llama-3.1-8b-instant") {
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

      const { object } = await generateObject({
        model: groq(this.model),
        schema: judgmentSchema,
        system: SYSTEM_PROMPT,
        prompt,
      });

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
