import { z } from "zod";
import { EventCategory } from "./category.js";

export const TimeRange = z.enum(["1h", "6h", "24h", "7d", "30d"]);
export type TimeRange = z.infer<typeof TimeRange>;

export const EventsQuerySchema = z.object({
  bbox: z
    .object({
      west: z.number().min(-180).max(180),
      south: z.number().min(-90).max(90),
      east: z.number().min(-180).max(180),
      north: z.number().min(-90).max(90),
    })
    .optional(),
  categories: z.array(EventCategory).optional(),
  minSeverity: z.number().int().min(1).max(5).default(1),
  minConfidence: z.number().min(0).max(1).default(0),
  after: z.string().datetime().optional(),
  before: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
  format: z.enum(["json", "geojson"]).default("json"),
});

export type EventsQuery = z.infer<typeof EventsQuerySchema>;

export const StreamQuerySchema = z.object({
  categories: z.array(EventCategory).optional(),
  minSeverity: z.number().int().min(1).max(5).default(1),
  bbox: z
    .object({
      west: z.number().min(-180).max(180),
      south: z.number().min(-90).max(90),
      east: z.number().min(-180).max(180),
      north: z.number().min(-90).max(90),
    })
    .optional(),
});

export type StreamQuery = z.infer<typeof StreamQuerySchema>;
