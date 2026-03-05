import type { GeoJSONFeatureCollection, SituationWithCoords } from "@travelrisk/db";

function userFacingError(response: Response): string {
  if (response.status === 0 || !response.status) return "Network error — check your connection and try again.";
  if (response.status === 408 || response.status === 504) return "Request timed out — try again in a moment.";
  if (response.status === 429) return "Too many requests — please wait a moment.";
  if (response.status >= 500) return "Server error — we're looking into it.";
  return `Request failed (${response.status}).`;
}

export interface FetchEventsParams {
  bbox?: { west: number; south: number; east: number; north: number };
  categories?: string[];
  minSeverity?: number;
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
    throw new Error(userFacingError(response));
  }

  return response.json() as Promise<GeoJSONFeatureCollection>;
}

export interface FetchSituationsParams {
  categories?: string[];
  minSeverity?: number;
  after?: string;
}

export async function fetchSituations(
  params: FetchSituationsParams,
  signal?: AbortSignal,
): Promise<SituationWithCoords[]> {
  const searchParams = new URLSearchParams();

  if (params.categories && params.categories.length > 0) {
    searchParams.set("categories", params.categories.join(","));
  }

  if (params.minSeverity !== undefined && params.minSeverity > 1) {
    searchParams.set("min_severity", String(params.minSeverity));
  }

  if (params.after) {
    searchParams.set("after", params.after);
  }

  const response = await fetch(`/api/situations?${searchParams.toString()}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(userFacingError(response));
  }

  const json = await response.json();
  return json.data as SituationWithCoords[];
}

export interface SituationEvent {
  id: string;
  title: string;
  summary: string;
  category: string;
  severity: number;
  locationName: string;
  countryCodes: string[] | null;
  timestamp: string;
  sources: Array<{ name: string; platform: string; url?: string }>;
  lng: number;
  lat: number;
}

export async function fetchSituationEvents(
  situationId: string,
  signal?: AbortSignal,
): Promise<SituationEvent[]> {
  const response = await fetch(`/api/situations/${situationId}/events`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(userFacingError(response));
  }

  const json = await response.json();
  return json.data as SituationEvent[];
}

export interface AdvisoryData {
  countryCode: string;
  level: number;
  title: string;
  summary: string;
  sourceUrl: string;
  sourceName: string;
  updatedAt: string;
}

export async function fetchAdvisories(
  signal?: AbortSignal,
): Promise<AdvisoryData[]> {
  const response = await fetch("/api/advisories", { signal });

  if (!response.ok) {
    throw new Error(userFacingError(response));
  }

  const json = await response.json();
  return json.data as AdvisoryData[];
}
