import type { PoolClient, EventWithCoords } from "@travelrisk/db";
import { findNearbyEvents } from "@travelrisk/db";
import type { EventCategory } from "@travelrisk/shared";

/**
 * Compute Jaccard similarity of two strings based on word sets.
 * Returns a value between 0 (no overlap) and 1 (identical word sets).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  existingEvent: EventWithCoords | null;
}

export interface MergeResult {
  existingId: string;
  severity: number;
  sources: unknown[];
}

export class Deduplicator {
  private db: PoolClient;
  private similarityThreshold: number;

  constructor(db: PoolClient, similarityThreshold = 0.6) {
    this.db = db;
    this.similarityThreshold = similarityThreshold;
  }

  /**
   * Check if a similar event already exists nearby (50km, same category, last 6h).
   */
  async findDuplicate(
    lat: number,
    lng: number,
    category: EventCategory,
    title: string,
  ): Promise<DeduplicationResult> {
    const nearby = await findNearbyEvents(this.db, lat, lng, category, 50, 6);

    for (const existing of nearby) {
      const similarity = jaccardSimilarity(title, existing.title);
      if (similarity > this.similarityThreshold) {
        return { isDuplicate: true, existingEvent: existing };
      }
    }

    return { isDuplicate: false, existingEvent: null };
  }

  /**
   * Merge a new event with an existing one:
   * - Keep the higher severity
   * - Aggregate sources arrays
   */
  merge(
    existing: EventWithCoords,
    newSeverity: number,
    newSources: unknown[],
  ): MergeResult {
    const existingSources = Array.isArray(existing.sources)
      ? (existing.sources as unknown[])
      : [];

    // Deduplicate sources by adapter name — update retrievedAt instead of appending
    const mergedSources = [...existingSources];
    for (const ns of newSources) {
      const newSource = ns as Record<string, unknown>;
      const idx = mergedSources.findIndex(
        (s) => (s as Record<string, unknown>).name === newSource.name,
      );
      if (idx >= 0) {
        // Update existing source entry with latest retrievedAt
        mergedSources[idx] = { ...(mergedSources[idx] as Record<string, unknown>), retrievedAt: newSource.retrievedAt };
      } else {
        mergedSources.push(ns);
      }
    }

    return {
      existingId: existing.id,
      severity: Math.max(existing.severity, newSeverity),
      sources: mergedSources,
    };
  }
}
