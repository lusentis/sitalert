CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"category" text NOT NULL,
	"severity" integer NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"location" "geography(POINT, 4326)" NOT NULL,
	"location_name" text NOT NULL,
	"country_code" text,
	"timestamp" timestamp with time zone NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_text" text,
	"situation_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "situations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"category" text NOT NULL,
	"severity" integer NOT NULL,
	"country_code" text,
	"location" "geography(POINT, 4326)" NOT NULL,
	"radius_km" integer DEFAULT 50 NOT NULL,
	"event_count" integer DEFAULT 1 NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_updated" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_timestamp_idx" ON "events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "events_category_idx" ON "events" USING btree ("category");--> statement-breakpoint
CREATE INDEX "events_category_severity_time_idx" ON "events" USING btree ("category","severity","timestamp");--> statement-breakpoint
CREATE INDEX "situations_category_status_idx" ON "situations" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "situations_status_last_updated_idx" ON "situations" USING btree ("status","last_updated");