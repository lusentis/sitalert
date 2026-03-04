import type { EventWithCoords } from "@travelrisk/db";

export interface MergeResult {
  existingId: string;
  severity: number;
  sources: unknown[];
}

export class Deduplicator {
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
