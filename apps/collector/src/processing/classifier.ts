import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
// import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";
import { EVENT_CATEGORIES } from "@travelrisk/shared";
import { withRetry } from "./retry";

const classificationSchema = z.object({
  relevant: z
    .boolean()
    .describe("Is this a security/safety/disaster event worth tracking?"),
  isAnalysis: z
    .boolean()
    .describe("True if this is opinion, analysis, or commentary rather than a discrete event"),
  travelRelevant: z
    .boolean()
    .describe("Would a traveler or business traveler need to know about this?"),
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
  geocodableLocation: z
    .string()
    .describe(
      "Best geocoder-ready location string for this event. " +
      "Format: 'City, Country' or 'Specific Place, Country'. " +
      "Must be unambiguous and suitable for Nominatim forward geocoding.",
    ),
  expectedCountryCodes: z
    .array(z.string())
    .describe(
      "ISO 3166-1 alpha-2 country codes (uppercase) for countries this event relates to. " +
      "Used to validate geocoding results. E.g. ['IR'] for Iran, ['IL'] for Israel.",
    ),
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

## Travel relevance (travelRelevant)

This app serves travelers and business travelers. Ask: "Would someone planning or currently
on a trip to this area need to know about this?" If no, set travelRelevant=false.

travelRelevant=false (reject these):
- Isolated local crime (a stabbing, a single murder, a robbery) — unless it indicates a pattern
  or targets areas frequented by travelers
- Domestic accidents (house fire, gas explosion, car crash) — no broader safety implication
- Court rulings, legal proceedings, convictions — no immediate safety impact
- Political ceremonies, commemorations, vigils — no disruption to movement
- Local government scandals, political disputes with no physical disruption
- Individual incidents with no area-wide impact (a helicopter damaging a field)

travelRelevant=true (keep these):
- Armed conflicts, military operations, terrorist attacks — any scale
- Natural disasters, epidemics, extreme weather
- Transport disruptions: airport closures, border changes, flight cancellations, shipping blockades
- Civil unrest with area-wide impact: protests blocking roads, curfews, evacuations
- Mass casualty events or ongoing security operations
- Infrastructure failures affecting a city or region (power grid collapse, telecom outage)
- Events that change the risk profile of an area (new travel advisory, martial law, airspace closure)
- Elections, leader visits, state visits — low impact but relevant context for travelers (severity 1-2)

## What counts as analysis (isAnalysis=true)

Set isAnalysis=true for content that is NOT a discrete, actionable event. This includes:
- Opinion pieces, editorials, rhetorical questions ("Are Patriot missiles enough?")
- Policy analysis, geopolitical commentary ("NATO Article 5 not triggered, alliance on high alert")
- Diplomatic denials and statements with no concrete action ("Iran denies missile launch", "Italy: not at war")
- Speculative or future-looking pieces ("Could X lead to Y?", "What if Z happens?")
- Propaganda speeches and political rhetoric
- Supply/strategy analysis ("Missile shortage limits operations")
- Meeting summaries with no concrete outcome ("Crisis discussed in high-level meeting")

Examples of isAnalysis=true (do NOT ingest these):
- "Iran–US conflict: Are Patriot missiles enough to support Ukraine?" → rhetorical/editorial
- "NATO Article 5 not triggered, alliance on high alert" → policy analysis
- "White House rules out deployment of ground troops" → policy statement, no event
- "Spain denies reports of cooperating with the United States" → diplomatic denial
- "Houthi leader claims Arab currents align with aggressive powers" → propaganda speech
- "De-escalation channels opened with Iran" → diplomatic posturing

Examples of isAnalysis=false (DO ingest these):
- "Airstrikes target missile storage sites in Tehran" → concrete military event
- "Iranian bombers shot down near Al-Udeid base" → concrete incident
- "Earthquake M6.5 near Attu Station, Alaska" → concrete natural event
- "Qatar: Airspace closed amid regional escalation" → concrete transport disruption

## Category: transport

The "transport" category covers anything that affects travel logistics. This includes:
- Flight disruptions, cancellations, and airport closures
- Border crossing status updates, visa requirement changes, and entry restrictions
- Shipping route disruptions, port closures, and strait blockades
- Evacuation and repatriation flights
- Road closures and land border changes

Border/visa guides ARE relevant as transport events — they provide actionable travel info.
Example: "Kuwait–Saudi Arabia border crossing: open with visa on arrival" → transport, sev=1

## Location fields

You output THREE location-related fields:

### locationMentions
All place names mentioned in the text (for reference/search). Raw extraction, no formatting needed.

### geocodableLocation (CRITICAL for map accuracy)
A single string optimized for Nominatim forward geocoding. This is the PRIMARY location of the event.
- Format as "City, Country" or "Specific Place, Country" in English.
- ALWAYS include the country name to disambiguate.
- Use the most specific identifiable location, not vague regions.
- Think: "If I type this into a geocoder, will it return the RIGHT point on the map?"

Examples:
- Text about airstrikes in Karaj, Iran → "Karaj, Iran" (NOT just "Karaj" which matches Slovakia)
- Text about missile threat to Persian Gulf shipping → "Strait of Hormuz, Oman"
- Text about sirens in central Israel → "Tel Aviv, Israel"
- Text about border crossing Kuwait-Saudi Arabia → "Kuwait City, Kuwait"
- Text about Middle East conflict generally → "Baghdad, Iraq" (pick a central representative city)
- Text about explosions in Erbil → "Erbil, Iraq"

BAD examples (will geocode to wrong places):
- "Gulf" → matches Gulf County, Florida
- "Central Israel" → matches places in Argentina
- "Middle East" → matches a neighborhood in Baltimore, Maryland
- "Karaj" alone → matches Krajné, Slovakia

### expectedCountryCodes
ISO 3166-1 alpha-2 codes (uppercase) for countries this event is about.
Used to validate that the geocoder returned a result in the right country.
- Iran → ["IR"], Israel → ["IL"], Turkey → ["TR"], Iraq → ["IQ"]
- Multi-country events → ["IR", "IQ"] etc.
- Always provide at least one code when the country is known.

Ignore scheduled events, advertisements, and general news.
Focus on actionable situational awareness information.`;

const openai = createOpenAI();
// const groq = createGroq();

export class Classifier {
  private model: string;

  constructor(model = "gpt-5-nano") {
    // constructor(model = "llama-3.1-8b-instant") {
    this.model = model;
  }

  async classify(rawText: string): Promise<ClassificationResult | null> {
    try {
      const t0 = performance.now();
      const { object, usage, response } = await withRetry(() =>
        generateObject({
          model: openai(this.model),
          // model: groq(this.model),
          schema: classificationSchema,
          system: SYSTEM_PROMPT,
          prompt: `Analyze this text and classify it:\n\n${rawText.slice(0, 2000)}`,
        }),
      );
      const ms = (performance.now() - t0).toFixed(0);
      const modelId = response?.modelId ?? this.model;
      console.log(
        `[classifier] model=${modelId} time=${ms}ms tokens=${usage.promptTokens}+${usage.completionTokens}=${usage.totalTokens} inputChars=${rawText.length}`,
      );

      if (!object.relevant || object.isAnalysis || !object.travelRelevant) {
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
