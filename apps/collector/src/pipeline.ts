import type Redis from "ioredis";
import type { PoolClient, EventWithCoords } from "@travelrisk/db";
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
    // Structured events already have location, category, title
    const location = raw.location!;
    const category = raw.category as EventCategory;
    const title = raw.title!;
    const severity = raw.severity ?? 2;
    const confidence = raw.confidence ?? 1.0;

    // Deduplication check
    const { isDuplicate, existingEvent } = await this.deduplicator.findDuplicate(
      location.lat,
      location.lng,
      category,
      title,
    );

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

    if (isDuplicate && existingEvent) {
      // Merge with existing event
      const merged = this.deduplicator.merge(existingEvent, severity, [source]);

      const event = await upsertEvent(this.db, {
        existingId: merged.existingId,
        title: existingEvent.title,
        summary: existingEvent.summary ?? raw.summary ?? "",
        category,
        severity: merged.severity,
        confidence: Math.max(existingEvent.confidence, confidence),
        location: "", // Overridden by PostGIS SQL in upsertEvent
        lat: existingEvent.lat,
        lng: existingEvent.lng,
        locationName: existingEvent.locationName,
        countryCode: existingEvent.countryCode ?? raw.countryCode ?? null,
        timestamp: existingEvent.timestamp,
        sources: merged.sources as EventSource[],
        media: [...(existingEvent.media as MediaItem[]), ...media],
        rawText: existingEvent.rawText,
      });

      console.log(`[pipeline] Merged event: ${event.id} "${title}"`);
      await this.publishNormalized(event, existingEvent.lat, existingEvent.lng);
    } else {
      // Insert new event
      const event = await insertEvent(this.db, {
        title,
        summary: raw.summary ?? raw.rawText.slice(0, 500),
        category,
        severity,
        confidence,
        location: "", // Overridden by PostGIS SQL in insertEvent
        lat: location.lat,
        lng: location.lng,
        locationName: raw.locationName ?? "Unknown",
        countryCode: raw.countryCode ?? null,
        timestamp: new Date(raw.timestamp),
        sources: [source],
        media,
        rawText: raw.rawText,
      });

      console.log(`[pipeline] New event: ${event.id} "${title}"`);
      await this.publishNormalized(event, location.lat, location.lng);
    }
  }

  private async processOsint(raw: RawEvent): Promise<void> {
    // Step 1: Classify with LLM
    const classification = await this.classifier.classify(raw.rawText);
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
    let countryCode = raw.countryCode;

    if (!location) {
      // Try location mentions from classifier, then raw locationName
      const locationCandidates = [
        ...classification.locationMentions,
        ...(locationName ? [locationName] : []),
      ];

      for (const candidate of locationCandidates) {
        const geocoded = await this.geocoder.geocode(candidate);
        if (geocoded) {
          location = { lat: geocoded.lat, lng: geocoded.lng };
          locationName = locationName ?? geocoded.displayName;
          countryCode = countryCode ?? geocoded.countryCode;
          break;
        }
      }
    }

    if (!location) {
      console.log(
        `[pipeline] Could not geocode OSINT event: "${title}" - discarding`,
      );
      return;
    }

    // Step 3: Dedup
    const { isDuplicate, existingEvent } = await this.deduplicator.findDuplicate(
      location.lat,
      location.lng,
      category,
      title,
    );

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

    if (isDuplicate && existingEvent) {
      const merged = this.deduplicator.merge(existingEvent, severity, [source]);

      const event = await upsertEvent(this.db, {
        existingId: merged.existingId,
        title: existingEvent.title,
        summary: existingEvent.summary ?? summary,
        category,
        severity: merged.severity,
        confidence: Math.max(existingEvent.confidence, confidence),
        location: "", // Overridden by PostGIS SQL in upsertEvent
        lat: existingEvent.lat,
        lng: existingEvent.lng,
        locationName: existingEvent.locationName,
        countryCode: existingEvent.countryCode ?? countryCode ?? null,
        timestamp: existingEvent.timestamp,
        sources: merged.sources as EventSource[],
        media: [...(existingEvent.media as MediaItem[]), ...media],
        rawText: existingEvent.rawText,
      });

      console.log(`[pipeline] Merged OSINT event: ${event.id} "${title}"`);
      await this.publishNormalized(event, existingEvent.lat, existingEvent.lng);
    } else {
      const event = await insertEvent(this.db, {
        title,
        summary,
        category,
        severity,
        confidence,
        location: "", // Overridden by PostGIS SQL in insertEvent
        lat: location.lat,
        lng: location.lng,
        locationName: locationName ?? "Unknown",
        countryCode: countryCode ?? null,
        timestamp: new Date(raw.timestamp),
        sources: [source],
        media,
        rawText: raw.rawText,
      });

      console.log(`[pipeline] New OSINT event: ${event.id} "${title}"`);
      await this.publishNormalized(event, location.lat, location.lng);
    }
  }

  private async publishNormalized(
    event: { id: string; title: string; summary: string; category: string; severity: number; confidence: number; locationName: string; countryCode: string | null; timestamp: Date; sources: unknown; media: unknown; rawText: string | null; situationId: string | null; expiresAt: Date | null; createdAt: Date; updatedAt: Date },
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
      countryCode: event.countryCode ?? undefined,
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
