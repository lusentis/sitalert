import { z } from "zod";
import { BaseAdapter } from "./base.js";
import type { Platform, RawEvent } from "@sitalert/shared";

const UsgsPropertiesSchema = z.object({
  mag: z.number(),
  place: z.string(),
  time: z.number(),
  url: z.string().url().optional(),
  title: z.string(),
  type: z.string(),
  ids: z.string().optional(),
});

const UsgsFeatureSchema = z.object({
  type: z.literal("Feature"),
  properties: UsgsPropertiesSchema,
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.array(z.number()).min(2).max(3),
  }),
  id: z.string(),
});

const UsgsResponseSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(UsgsFeatureSchema),
});

export function magnitudeToSeverity(mag: number): number {
  if (mag >= 7) return 5;
  if (mag >= 6) return 4;
  if (mag >= 5) return 3;
  if (mag >= 4) return 2;
  return 1;
}

export class UsgsAdapter extends BaseAdapter {
  readonly name = "usgs";
  readonly platform: Platform = "api";

  private seenIds = new Set<string>();

  private static readonly FEED_URL =
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_hour.geojson";

  constructor(pollingInterval = 60_000) {
    super({ defaultConfidence: 1.0, pollingInterval });
  }

  protected async poll(): Promise<void> {
    const response = await fetch(UsgsAdapter.FEED_URL);
    if (!response.ok) {
      throw new Error(`USGS API returned ${response.status}`);
    }

    const json: unknown = await response.json();
    const data = UsgsResponseSchema.parse(json);

    for (const feature of data.features) {
      if (this.seenIds.has(feature.id)) continue;
      this.seenIds.add(feature.id);

      const [lng, lat] = feature.geometry.coordinates;
      const severity = magnitudeToSeverity(feature.properties.mag);

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: feature.id,
        rawText: feature.properties.title,
        rawData: {
          magnitude: feature.properties.mag,
          type: feature.properties.type,
          place: feature.properties.place,
        },
        timestamp: new Date(feature.properties.time).toISOString(),
        location: { lat, lng },
        locationName: feature.properties.place,
        category: "natural_disaster",
        severity,
        confidence: this.defaultConfidence,
        title: `M${feature.properties.mag.toFixed(1)} Earthquake - ${feature.properties.place}`,
        summary: `Magnitude ${feature.properties.mag.toFixed(1)} earthquake detected at ${feature.properties.place}.`,
        url: feature.properties.url,
        media: [],
      };

      this.emit(raw);
    }

    // Prune old IDs to avoid unbounded growth
    if (this.seenIds.size > 10_000) {
      const idsArray = Array.from(this.seenIds);
      this.seenIds = new Set(idsArray.slice(idsArray.length - 5_000));
    }
  }
}
