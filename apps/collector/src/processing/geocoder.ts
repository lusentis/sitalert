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

const CACHE_TTL = 604800; // 7 days
const NEGATIVE_CACHE_TTL = 86400; // 1 day for failed lookups
const CACHE_PREFIX = "geo:";

export class Geocoder {
  private redis: Redis;
  private nominatimUrl: string;
  private pendingForward: Promise<void> = Promise.resolve();
  private pendingReverse: Promise<void> = Promise.resolve();

  constructor(redis: Redis, nominatimUrl?: string) {
    this.redis = redis;
    this.nominatimUrl =
      nominatimUrl ?? process.env["NOMINATIM_URL"] ?? "https://nominatim.openstreetmap.org";
  }

  async geocode(locationName: string): Promise<GeocodeResult | null> {
    const normalized = locationName.trim().toLowerCase();
    if (!normalized) return null;

    // Check cache first (includes negative cache)
    const cacheKey = `${CACHE_PREFIX}${normalized}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      if (cached === "null") return null; // Negative cache hit
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

    // Rate-limit: chain requests to 1/sec (forward chain)
    const result = await this.rateLimitedGeocode(normalized);

    // Cache result (or negative result)
    if (result) {
      await this.redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
    } else {
      await this.redis.set(cacheKey, "null", "EX", NEGATIVE_CACHE_TTL);
    }

    return result;
  }

  private rateLimitedGeocode(
    location: string,
  ): Promise<GeocodeResult | null> {
    const request = this.pendingForward.then(async () => {
      // Wait 1 second between requests to respect Nominatim rate limit
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    });

    const geocodePromise = request.then(() => this.fetchGeocode(location));

    // Update the forward chain — next forward request waits for this one
    this.pendingForward = request.then(() => {});

    return geocodePromise;
  }

  async reverse(lat: number, lng: number): Promise<GeocodeResult | null> {
    const cacheKey = `${CACHE_PREFIX}rev:${lat.toFixed(2)},${lng.toFixed(2)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      if (cached === "null") return null; // Negative cache hit
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
        if (result.success) return result.data;
      } catch { /* cache miss */ }
    }

    const result = await this.rateLimitedReverse(lat, lng);
    if (result) {
      await this.redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
    } else {
      await this.redis.set(cacheKey, "null", "EX", NEGATIVE_CACHE_TTL);
    }
    return result;
  }

  private rateLimitedReverse(
    lat: number,
    lng: number,
  ): Promise<GeocodeResult | null> {
    const request = this.pendingReverse.then(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    });
    const reversePromise = request.then(() => this.fetchReverse(lat, lng));
    this.pendingReverse = request.then(() => {});
    return reversePromise;
  }

  private async fetchReverse(
    lat: number,
    lng: number,
  ): Promise<GeocodeResult | null> {
    try {
      const url = `${this.nominatimUrl}/reverse?lat=${lat}&lon=${lng}&format=json&zoom=5`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; news-aggregator/1.0)",
        },
      });

      if (!response.ok) return null;

      const json: unknown = await response.json();
      const result = z
        .object({
          display_name: z.string(),
          address: z.object({ country_code: z.string().optional() }).optional(),
        })
        .safeParse(json);

      if (!result.success) return null;

      return {
        lat,
        lng,
        countryCode: result.data.address?.country_code?.toUpperCase(),
        displayName: result.data.display_name,
      };
    } catch {
      return null;
    }
  }

  private async fetchGeocode(
    location: string,
  ): Promise<GeocodeResult | null> {
    try {
      const url = `${this.nominatimUrl}/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; news-aggregator/1.0)",
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
