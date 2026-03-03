import { z } from "zod";
import { BaseAdapter } from "./base.js";
import type { Platform, RawEvent } from "@sitalert/shared";
import { magnitudeToSeverity } from "./usgs.js";

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
        coordinates: z.tuple([z.number(), z.number()]),
      }),
    }),
  ),
});

export class EmscAdapter extends BaseAdapter {
  readonly name = "emsc";
  readonly platform: Platform = "api";

  private seenIds = new Set<string>();

  private static readonly FEED_URL =
    "https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=20&minmag=3";

  constructor(pollingInterval = 60_000) {
    super({ defaultConfidence: 1.0, pollingInterval });
  }

  protected async poll(): Promise<void> {
    const response = await fetch(EmscAdapter.FEED_URL);
    if (!response.ok) {
      throw new Error(`EMSC API returned ${response.status}`);
    }

    const json: unknown = await response.json();
    const data = EmscResponseSchema.parse(json);

    for (const feature of data.features) {
      const { unid, lat, lon, mag, flynn_region, time } = feature.properties;

      if (this.seenIds.has(unid)) continue;
      this.seenIds.add(unid);

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

    // Prune old IDs
    if (this.seenIds.size > 10_000) {
      const idsArray = Array.from(this.seenIds);
      this.seenIds = new Set(idsArray.slice(idsArray.length - 5_000));
    }
  }
}
