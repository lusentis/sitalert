import { generateObject } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";
import { EVENT_CATEGORIES } from "@travelrisk/shared";
import { withRetry } from "./retry";

const classificationSchema = z.object({
  relevant: z
    .boolean()
    .describe("Is this a security/safety/disaster event worth tracking?"),
  category: z
    .enum(EVENT_CATEGORIES as unknown as [string, ...string[]])
    .describe("Event category"),
  severity: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("1=minor, 5=catastrophic"),
  title: z.string().max(120).describe("Concise event title"),
  summary: z.string().max(500).describe("Brief event summary"),
  locationMentions: z
    .array(z.string())
    .describe("Place names mentioned in the text"),
});

export type ClassificationResult = z.infer<typeof classificationSchema>;

const SYSTEM_PROMPT = `You are an event classifier for a global situation monitoring system (TravelRisk).
Your job is to analyze raw text from various sources and determine:
1. Whether it describes a real security, safety, disaster, or crisis event worth tracking
2. What category it falls into
3. How severe it is (1=minor/localized, 2=moderate, 3=significant, 4=severe, 5=catastrophic)
4. A concise title and summary
5. Any place names or locations mentioned

IMPORTANT rules for title and summary:
- ALWAYS write in English, regardless of the input language (translate if needed).
- Write from a neutral, universal perspective. Do NOT reference specific nationalities
  (e.g. "US citizens", "Italian nationals", "connazionali") or government-specific advice
  (e.g. "register with the embassy", "contact the consulate").
- Focus on WHAT is happening and WHERE, not travel advice for any specific country's citizens.
- Example: instead of "US citizens should avoid travel to X due to Y",
  write "X: Y poses significant risk" or "Ongoing Y situation in X".

Be conservative with severity — only use 4-5 for events with major impact.
Ignore opinion pieces, scheduled events, advertisements, and general news.
Focus on actionable situational awareness information.`;

const groq = createGroq();

export class Classifier {
  private model: string;

  constructor(model = "llama-3.1-8b-instant") {
    this.model = model;
  }

  async classify(rawText: string): Promise<ClassificationResult | null> {
    try {
      const { object } = await withRetry(() =>
        generateObject({
          model: groq(this.model),
          schema: classificationSchema,
          system: SYSTEM_PROMPT,
          prompt: `Analyze this text and classify it:\n\n${rawText.slice(0, 2000)}`,
        }),
      );

      if (!object.relevant) {
        return null;
      }

      return object;
    } catch (err: unknown) {
      console.error(
        "[classifier] LLM classification error:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }
}
