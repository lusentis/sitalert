import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { geographyPoint } from "./custom-types";
import type { EventCategory } from "@travelrisk/shared";
import type { EventSource, MediaItem } from "@travelrisk/shared";

export const events = pgTable(
  "events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    category: text("category").$type<EventCategory>().notNull(),
    severity: integer("severity").notNull(),
    confidence: real("confidence").notNull().default(1.0),
    location: geographyPoint("location").notNull(),
    locationName: text("location_name").notNull(),
    countryCode: text("country_code"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    sources: jsonb("sources").$type<EventSource[]>().notNull().default([]),
    media: jsonb("media").$type<MediaItem[]>().notNull().default([]),
    rawText: text("raw_text"),
    situationId: uuid("situation_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("events_timestamp_idx").on(table.timestamp),
    index("events_category_idx").on(table.category),
    index("events_category_severity_time_idx").on(
      table.category,
      table.severity,
      table.timestamp,
    ),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export const situations = pgTable(
  "situations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    category: text("category").$type<EventCategory>().notNull(),
    severity: integer("severity").notNull(),
    countryCode: text("country_code"),
    location: geographyPoint("location").notNull(),
    radiusKm: integer("radius_km").notNull().default(50),
    eventCount: integer("event_count").notNull().default(1),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
    lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull(),
    status: text("status")
      .$type<"active" | "resolved">()
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("situations_category_status_idx").on(table.category, table.status),
    index("situations_status_last_updated_idx").on(
      table.status,
      table.lastUpdated,
    ),
  ],
);

export type Situation = typeof situations.$inferSelect;
export type NewSituation = typeof situations.$inferInsert;

export const advisories = pgTable("advisories", {
  countryCode: text("country_code").primaryKey(),
  level: integer("level").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceName: text("source_name").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Advisory = typeof advisories.$inferSelect;
export type NewAdvisory = typeof advisories.$inferInsert;
