import type Redis from "ioredis";
import { z } from "zod";

const NominatimResultSchema = z.array(
  z.object({
    lat: z.string(),
    lon: z.string(),
    display_name: z.string(),
    address: z
      .object({
        country_code: z.string().optional(),
      })
      .optional(),
  }),
);

export interface GeocodeResult {
  lat: number;
  lng: number;
  countryCode?: string;
  displayName: string;
}

const CACHE_TTL = 86400; // 24 hours
const CACHE_PREFIX = "geo:";

export class Geocoder {
  private redis: Redis;
  private nominatimUrl: string;
  private pendingRequest: Promise<void> = Promise.resolve();

  constructor(redis: Redis, nominatimUrl?: string) {
    this.redis = redis;
    this.nominatimUrl =
      nominatimUrl ?? process.env["NOMINATIM_URL"] ?? "https://nominatim.openstreetmap.org";
  }

  async geocode(locationName: string): Promise<GeocodeResult | null> {
    const normalized = locationName.trim().toLowerCase();
    if (!normalized) return null;

    // Check cache first
    const cacheKey = `${CACHE_PREFIX}${normalized}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        const parsed: unknown = JSON.parse(cached);
        const result = z
          .object({
            lat: z.number(),
            lng: z.number(),
            countryCode: z.string().optional(),
            displayName: z.string(),
          })
          .safeParse(parsed);

        if (result.success) {
          return result.data;
        }
      } catch {
        // Cache miss, continue to geocode
      }
    }

    // Rate-limit: chain requests to 1/sec
    const result = await this.rateLimitedGeocode(normalized);

    if (result) {
      // Store in cache
      await this.redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
    }

    return result;
  }

  private rateLimitedGeocode(
    location: string,
  ): Promise<GeocodeResult | null> {
    const request = this.pendingRequest.then(async () => {
      // Wait 1 second between requests to respect Nominatim rate limit
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    });

    const geocodePromise = request.then(() => this.fetchGeocode(location));

    // Update the chain — next request waits for this one
    this.pendingRequest = request.then(() => {});

    return geocodePromise;
  }

  private async fetchGeocode(
    location: string,
  ): Promise<GeocodeResult | null> {
    try {
      const url = `${this.nominatimUrl}/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "SitAlert/1.0 (https://github.com/sitalert)",
        },
      });

      if (!response.ok) {
        console.error(`[geocoder] Nominatim returned ${response.status}`);
        return null;
      }

      const json: unknown = await response.json();
      const results = NominatimResultSchema.parse(json);

      if (results.length === 0) return null;

      const first = results[0];
      return {
        lat: parseFloat(first.lat),
        lng: parseFloat(first.lon),
        countryCode: first.address?.country_code?.toUpperCase(),
        displayName: first.display_name,
      };
    } catch (err: unknown) {
      console.error(
        "[geocoder] Geocoding error:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }
}
