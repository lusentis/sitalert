import type { GeoJSONFeatureCollection } from "@travelrisk/db";
import type { EventStats } from "@travelrisk/db";

export interface FetchEventsParams {
  bbox?: { west: number; south: number; east: number; north: number };
  categories?: string[];
  minSeverity?: number;
  minConfidence?: number;
  after?: string;
  limit?: number;
}

export async function fetchEventsGeoJSON(
  params: FetchEventsParams,
  signal?: AbortSignal,
): Promise<GeoJSONFeatureCollection> {
  const searchParams = new URLSearchParams();
  searchParams.set("format", "geojson");

  if (params.bbox) {
    searchParams.set(
      "bbox",
      `${params.bbox.west},${params.bbox.south},${params.bbox.east},${params.bbox.north}`,
    );
  }

  if (params.categories && params.categories.length > 0) {
    searchParams.set("categories", params.categories.join(","));
  }

  if (params.minSeverity !== undefined && params.minSeverity > 1) {
    searchParams.set("min_severity", String(params.minSeverity));
  }

  if (params.minConfidence !== undefined && params.minConfidence > 0) {
    searchParams.set("min_confidence", String(params.minConfidence));
  }

  if (params.after) {
    searchParams.set("after", params.after);
  }

  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit));
  }

  const response = await fetch(`/api/events?${searchParams.toString()}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`);
  }

  return response.json() as Promise<GeoJSONFeatureCollection>;
}

export async function fetchStats(): Promise<EventStats> {
  const response = await fetch("/api/stats");

  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.status}`);
  }

  return response.json() as Promise<EventStats>;
}
