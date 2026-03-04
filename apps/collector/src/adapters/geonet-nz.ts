import { z } from "zod";
import type Redis from "ioredis";
import { BaseAdapter } from "./base";
import type { Platform, RawEvent } from "@travelrisk/shared";
import { magnitudeToSeverity } from "./usgs";

const GeoNetPropertiesSchema = z.object({
  publicID: z.string(),
  time: z.string(),
  depth: z.number(),
  magnitude: z.number(),
  mmi: z.number(),
  locality: z.string(),
  quality: z.string(),
});

const GeoNetFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.array(z.number()).min(2).max(3),
  }),
  properties: GeoNetPropertiesSchema,
});

const GeoNetResponseSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(GeoNetFeatureSchema),
});

const TTL_2H = 2 * 60 * 60;

export class GeoNetNzAdapter extends BaseAdapter {
  readonly name = "geonet-nz";
  readonly platform: Platform = "api";

  private static readonly FEED_URL =
    "https://api.geonet.org.nz/quake?MMI=3";

  constructor(pollingInterval = 60_000, redis?: Redis) {
    super({ defaultConfidence: 1.0, pollingInterval, redis });
  }

  protected async poll(): Promise<void> {
    const response = await fetch(GeoNetNzAdapter.FEED_URL, {
      headers: { Accept: "application/vnd.geo+json;version=2" },
    });
    if (!response.ok) {
      throw new Error(`GeoNet API returned ${response.status}`);
    }

    const json: unknown = await response.json();
    const data = GeoNetResponseSchema.parse(json);

    const seen = this.getSeenSet(TTL_2H);

    for (const feature of data.features) {
      const { publicID, magnitude, depth, locality, time } =
        feature.properties;

      if (await seen.has(publicID)) continue;
      if (magnitude < 5) continue;
      await seen.add(publicID);

      const [lng, lat] = feature.geometry.coordinates;
      const severity = magnitudeToSeverity(magnitude);

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: publicID,
        rawText: `M${magnitude.toFixed(1)} earthquake ${locality}`,
        rawData: {
          magnitude,
          depth,
          mmi: feature.properties.mmi,
          quality: feature.properties.quality,
        },
        timestamp: new Date(time).toISOString(),
        location: { lat, lng },
        locationName: locality,
        category: "natural_disaster",
        severity,
        confidence: this.defaultConfidence,
        title: `M${magnitude.toFixed(1)} Earthquake - ${locality}`,
        summary: `Magnitude ${magnitude.toFixed(1)} earthquake at ${depth.toFixed(1)} km depth, ${locality}.`,
        url: `https://www.geonet.org.nz/earthquake/${publicID}`,
        media: [],
      };

      this.emit(raw);
    }
  }
}
