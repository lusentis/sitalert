import type Redis from "ioredis";
import type { PoolClient, Event } from "@travelrisk/db";
import {
  insertEvent,
  upsertEvent,
  findNearbyEvents,
  findActiveSituations,
  createSituation,
  updateSituation,
} from "@travelrisk/db";
import type {
  RawEvent,
  NormalizedEvent,
  EventSource,
  EventCategory,
  MediaItem,
} from "@travelrisk/shared";
import { Classifier } from "./processing/classifier";
import { Geocoder } from "./processing/geocoder";
import { Deduplicator } from "./processing/deduplicator";
import { Judgment } from "./processing/judgment";
import { Publisher } from "./publisher";

function isStructuredEvent(raw: RawEvent): boolean {
  return !!(raw.location && raw.category && raw.title);
}

function elapsed(start: number): string {
  return `${(performance.now() - start).toFixed(0)}ms`;
}

export class Pipeline {
  private db: PoolClient;
  private classifier: Classifier;
  private geocoder: Geocoder;
  private deduplicator: Deduplicator;
  private judgment: Judgment;
  private publisher: Publisher;

  constructor(
    db: PoolClient,
    redis: Redis,
    classifier: Classifier,
    geocoder: Geocoder,
    deduplicator: Deduplicator,
  ) {
    this.db = db;
    this.classifier = classifier;
    this.geocoder = geocoder;
    this.deduplicator = deduplicator;
    this.judgment = new Judgment();
    this.publisher = new Publisher(redis);
  }

  async process(raw: RawEvent): Promise<void> {
    try {
      if (isStructuredEvent(raw)) {
        await this.processStructured(raw);
      } else {
        await this.processOsint(raw);
      }
    } catch (err: unknown) {
      console.error(
        `[pipeline] Error processing event from ${raw.sourceAdapter}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  private async processStructured(raw: RawEvent): Promise<void> {
    const t0 = performance.now();
    const tag = `[perf:${raw.sourceAdapter}]`;

    // Structured events already have location, category, title
    const location = raw.location!;
    const category = raw.category as EventCategory;
    const title = raw.title!;
    const severity = raw.severity ?? 2;
    const confidence = raw.confidence ?? 1.0;

    const source: EventSource = {
      platform: raw.platform,
      name: raw.sourceAdapter,
      url: raw.url,
      retrievedAt: new Date().toISOString(),
    };

    const media: MediaItem[] = raw.media.map((m) => ({
      type: m.type,
      url: m.url,
      caption: m.caption,
    }));

    // Reverse-geocode if no locationName provided
    let locationName = raw.locationName;
    let countryCodes = raw.countryCodes ?? [];
    if (!locationName) {
      const tGeo = performance.now();
      const geocoded = await this.geocoder.reverse(location.lat, location.lng);
      console.log(`${tag} reverse-geocode=${elapsed(tGeo)}`);
      if (geocoded) {
        locationName = geocoded.displayName;
        if (countryCodes.length === 0 && geocoded.countryCode) {
          countryCodes = [geocoded.countryCode];
        }
      }
    }

    const { event, lat, lng } = await this.judgeAndAct({
      title,
      summary: raw.summary ?? raw.rawText.slice(0, 500),
      category,
      severity,
      confidence,
      lat: location.lat,
      lng: location.lng,
      locationName: locationName ?? "Unknown",
      countryCodes,
      timestamp: new Date(raw.timestamp),
      sources: [source],
      media,
      rawText: raw.rawText,
    });

    console.log(`${tag} total=${elapsed(t0)} | "${title}"`);
    await this.publishNormalized(event, lat, lng);
  }

  private async processOsint(raw: RawEvent): Promise<void> {
    const t0 = performance.now();
    const tag = `[perf:${raw.sourceAdapter}]`;

    // Step 1: Classify with LLM
    const tClassify = performance.now();
    const classification = await this.classifier.classify(raw.rawText);
    console.log(`${tag} classify=${elapsed(tClassify)}`);
    if (!classification) {
      console.log(
        `[pipeline] Discarding irrelevant OSINT event from ${raw.sourceAdapter}`,
      );
      return;
    }

    const category = classification.category as EventCategory;
    const title = classification.title;
    const summary = classification.summary;
    const severity = classification.severity;
    const confidence = raw.confidence ?? 0.5;

    // Step 2: Geocode if no coordinates
    let location = raw.location;
    let locationName = raw.locationName;
    let countryCodes = raw.countryCodes ?? [];

    if (!location) {
      const tGeo = performance.now();
      // Try location mentions from classifier, then raw locationName
      const locationCandidates = [
        ...classification.locationMentions,
        ...(locationName ? [locationName] : []),
      ];

      const collectedCodes = new Set<string>(countryCodes);
      let geocodeAttempts = 0;
      for (const candidate of locationCandidates) {
        geocodeAttempts++;
        const geocoded = await this.geocoder.geocode(candidate);
        if (geocoded) {
          if (!location) {
            location = { lat: geocoded.lat, lng: geocoded.lng };
            locationName = locationName ?? geocoded.displayName;
          }
          if (geocoded.countryCode) {
            collectedCodes.add(geocoded.countryCode);
          }
        }
      }
      countryCodes = [...collectedCodes];
      console.log(`${tag} geocode=${elapsed(tGeo)} attempts=${geocodeAttempts}/${locationCandidates.length}`);
    }

    if (!location) {
      console.log(
        `[pipeline] Could not geocode OSINT event: "${title}" - discarding`,
      );
      return;
    }

    // Step 3: Judge (dedup + situation assignment via LLM)
    const source: EventSource = {
      platform: raw.platform,
      name: raw.sourceAdapter,
      url: raw.url,
      retrievedAt: new Date().toISOString(),
    };

    const media: MediaItem[] = raw.media.map((m) => ({
      type: m.type,
      url: m.url,
      caption: m.caption,
    }));

    const { event, lat, lng } = await this.judgeAndAct({
      title,
      summary,
      category,
      severity,
      confidence,
      lat: location.lat,
      lng: location.lng,
      locationName: locationName ?? "Unknown",
      countryCodes,
      timestamp: new Date(raw.timestamp),
      sources: [source],
      media,
      rawText: raw.rawText,
    });

    console.log(`${tag} total=${elapsed(t0)} | "${title}"`);
    await this.publishNormalized(event, lat, lng);
  }

  private async judgeAndAct(params: {
    title: string;
    summary: string;
    category: EventCategory;
    severity: number;
    confidence: number;
    lat: number;
    lng: number;
    locationName: string;
    countryCodes: string[];
    timestamp: Date;
    sources: EventSource[];
    media: MediaItem[];
    rawText: string;
  }): Promise<{ event: Event; lat: number; lng: number }> {
    const { title, summary, category, severity, confidence, lat, lng, locationName, countryCodes, timestamp, sources, media, rawText } = params;
    const tag = `[perf:judge]`;

    // Fetch candidates for dedup and situation assignment
    const tDb = performance.now();
    const [candidates, activeSituations] = await Promise.all([
      findNearbyEvents(this.db, lat, lng, category, 200, 24),
      findActiveSituations(this.db, lat, lng, category, 500),
    ]);
    console.log(`${tag} db-query=${elapsed(tDb)} candidates=${candidates.length} situations=${activeSituations.length}`);

    const tLlm = performance.now();
    const judgment = await this.judgment.call(
      { title, summary, category, locationName, countryCodes, timestamp: timestamp.toISOString() },
      candidates,
      activeSituations,
    );
    console.log(`${tag} llm=${elapsed(tLlm)} decision=${judgment.duplicateOf ? "duplicate" : judgment.situationId ? "existing" : judgment.newSituation ? "new" : "fallback"}`);

    // Handle duplicate
    if (judgment.duplicateOf) {
      const existing = candidates.find((c) => c.id === judgment.duplicateOf);
      if (existing) {
        const merged = this.deduplicator.merge(existing, severity, sources);
        const event = await upsertEvent(this.db, {
          existingId: merged.existingId,
          title: existing.title,
          summary: existing.summary ?? summary,
          category,
          severity: merged.severity,
          confidence: Math.max(existing.confidence, confidence),
          location: "", // Overridden by PostGIS SQL
          lat: existing.lat,
          lng: existing.lng,
          locationName: existing.locationName,
          countryCodes: existing.countryCodes ?? countryCodes,
          timestamp: existing.timestamp,
          sources: merged.sources as EventSource[],
          media: [...(existing.media as MediaItem[]), ...media],
          rawText: existing.rawText,
          situationId: existing.situationId,
        });
        console.log(`[pipeline] Duplicate merged into ${existing.id}`);
        return { event, lat: existing.lat, lng: existing.lng };
      }
      console.warn(`[pipeline] Judgment returned unknown duplicateOf="${judgment.duplicateOf}", will auto-create situation`);
    }

    // Handle existing situation assignment
    if (judgment.situationId) {
      const matchedSituation = activeSituations.find((s) => s.id === judgment.situationId);
      if (matchedSituation) {
        const [event] = await Promise.all([
          insertEvent(this.db, {
            title, summary, category, severity, confidence,
            location: "", lat, lng, locationName,
            countryCodes, timestamp, sources, media, rawText,
            situationId: matchedSituation.id,
          }),
          updateSituation(this.db, matchedSituation.id, { severity, countryCodes }),
        ]);
        console.log(`[pipeline] Assigned to situation ${matchedSituation.id}`);
        return { event, lat, lng };
      }
      console.warn(`[pipeline] Judgment returned unknown situationId="${judgment.situationId}", will auto-create situation`);
    }

    // Handle new situation creation
    if (judgment.newSituation) {
      const situation = await createSituation(this.db, {
        title: judgment.newSituation.title,
        summary: judgment.newSituation.summary,
        category,
        severity,
        countryCodes,
        lat,
        lng,
      });
      const event = await insertEvent(this.db, {
        title, summary, category, severity, confidence,
        location: "", lat, lng, locationName,
        countryCodes, timestamp, sources, media, rawText,
        situationId: situation.id,
      });
      console.log(`[pipeline] Created new situation ${situation.id}`);
      return { event, lat, lng };
    }

    // Fallback: LLM returned all-null or hallucinated IDs — auto-create situation
    const fallbackSituation = await createSituation(this.db, {
      title,
      summary,
      category,
      severity,
      countryCodes,
      lat,
      lng,
    });
    const event = await insertEvent(this.db, {
      title, summary, category, severity, confidence,
      location: "", lat, lng, locationName,
      countryCodes, timestamp, sources, media, rawText,
      situationId: fallbackSituation.id,
    });
    console.log(`[pipeline] Auto-created situation ${fallbackSituation.id} for event ${event.id}`);
    return { event, lat, lng };
  }

  private async publishNormalized(
    event: Event,
    lat: number,
    lng: number,
  ): Promise<void> {
    const normalized: NormalizedEvent = {
      id: event.id,
      title: event.title,
      summary: event.summary,
      category: event.category as EventCategory,
      severity: event.severity,
      confidence: event.confidence,
      location: { lat, lng },
      locationName: event.locationName,
      countryCodes: event.countryCodes ?? undefined,
      timestamp: event.timestamp.toISOString(),
      sources: (event.sources as EventSource[]) ?? [],
      media: (event.media as MediaItem[]) ?? [],
      rawText: event.rawText ?? undefined,
      situationId: event.situationId ?? undefined,
      expiresAt: event.expiresAt?.toISOString(),
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };

    await this.publisher.publishEvent(normalized);
  }
}
