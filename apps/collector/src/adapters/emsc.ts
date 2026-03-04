import { z } from "zod";
import type Redis from "ioredis";
import { BaseAdapter } from "./base";
import type { Platform, RawEvent } from "@travelrisk/shared";
import { magnitudeToSeverity } from "./usgs";

const EmscEventSchema = z.object({
  unid: z.string(),
  lat: z.number(),
  lon: z.number(),
  mag: z.number(),
  flynn_region: z.string(),
  time: z.string(),
  depth: z.number().optional(),
  source_id: z.string().optional(),
});

const EmscResponseSchema = z.object({
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      id: z.string(),
      properties: EmscEventSchema,
      geometry: z.object({
        type: z.literal("Point"),
        coordinates: z.array(z.number()).min(2).max(3),
      }),
    }),
  ),
});

const TTL_2H = 2 * 60 * 60;

export class EmscAdapter extends BaseAdapter {
  readonly name = "emsc";
  readonly platform: Platform = "api";

  private static readonly FEED_URL =
    "https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=20";

  constructor(pollingInterval = 60_000, redis?: Redis) {
    super({ defaultConfidence: 1.0, pollingInterval, redis });
  }

  protected async poll(): Promise<void> {
    const response = await fetch(EmscAdapter.FEED_URL);
    if (!response.ok) {
      throw new Error(`EMSC API returned ${response.status}`);
    }

    const json: unknown = await response.json();
    const data = EmscResponseSchema.parse(json);

    const seen = this.getSeenSet(TTL_2H);

    for (const feature of data.features) {
      const { unid, lat, lon, mag, flynn_region, time } = feature.properties;

      if (await seen.has(unid)) continue;
      if (mag < 5) continue;
      await seen.add(unid);

      const severity = magnitudeToSeverity(mag);

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: unid,
        rawText: `M${mag.toFixed(1)} earthquake in ${flynn_region}`,
        rawData: {
          magnitude: mag,
          region: flynn_region,
          depth: feature.properties.depth,
        },
        timestamp: new Date(time).toISOString(),
        location: { lat, lng: lon },
        locationName: flynn_region,
        category: "natural_disaster",
        severity,
        confidence: this.defaultConfidence,
        title: `M${mag.toFixed(1)} Earthquake - ${flynn_region}`,
        summary: `Magnitude ${mag.toFixed(1)} earthquake detected in ${flynn_region}.`,
        media: [],
      };

      this.emit(raw);
    }
  }
}
