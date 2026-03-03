import { z } from "zod";
import { EventCategory } from "./category.js";
import { Platform } from "./source.js";

export const RawEventSchema = z.object({
  sourceAdapter: z.string(),
  platform: Platform,
  externalId: z.string(),
  rawText: z.string(),
  rawData: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  locationName: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  category: EventCategory.optional(),
  severity: z.number().int().min(1).max(5).optional(),
  confidence: z.number().min(0).max(1).optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  url: z.string().url().optional(),
  media: z
    .array(
      z.object({
        type: z.enum(["image", "video", "link"]),
        url: z.string().url(),
        caption: z.string().optional(),
      }),
    )
    .default([]),
});

export type RawEvent = z.infer<typeof RawEventSchema>;

export type EventCallback = (raw: RawEvent) => void;

export interface SourceAdapter {
  readonly name: string;
  readonly platform: Platform;
  start(callback: EventCallback): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<boolean>;
}
