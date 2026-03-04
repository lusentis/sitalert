import { z } from "zod";
import { EventCategory } from "./category";
import { Platform } from "./source";

export const EventSourceSchema = z.object({
  platform: Platform,
  name: z.string(),
  url: z.string().url().optional(),
  retrievedAt: z.string().datetime(),
});

export type EventSource = z.infer<typeof EventSourceSchema>;

export const MediaItemSchema = z.object({
  type: z.enum(["image", "video", "link"]),
  url: z.string().url(),
  caption: z.string().optional(),
});

export type MediaItem = z.infer<typeof MediaItemSchema>;

export const NormalizedEventSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string(),
  category: EventCategory,
  severity: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  locationName: z.string(),
  countryCodes: z.array(z.string().length(2)).optional(),
  timestamp: z.string().datetime(),
  sources: z.array(EventSourceSchema),
  media: z.array(MediaItemSchema).default([]),
  rawText: z.string().optional(),
  situationId: z.string().uuid().optional(),
  expiresAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;

export const NormalizedEventGeoJSONFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: z.object({
    id: z.string().uuid(),
    title: z.string(),
    summary: z.string(),
    category: EventCategory,
    severity: z.number().int().min(1).max(5),
    confidence: z.number().min(0).max(1),
    locationName: z.string(),
    countryCodes: z.array(z.string().length(2)).optional(),
    timestamp: z.string().datetime(),
    ageMinutes: z.number(),
    sourceCount: z.number().int(),
  }),
});

export type NormalizedEventGeoJSONFeature = z.infer<
  typeof NormalizedEventGeoJSONFeatureSchema
>;
