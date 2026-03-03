import { z } from "zod";

export const EventCategory = z.enum([
  "conflict",
  "terrorism",
  "natural_disaster",
  "weather_extreme",
  "health_epidemic",
  "civil_unrest",
  "transport",
  "infrastructure",
]);

export type EventCategory = z.infer<typeof EventCategory>;

export const EVENT_CATEGORIES = EventCategory.options;
