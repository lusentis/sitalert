import { createPoolClient, resolveExpiredSituations } from "@travelrisk/db";
import Redis from "ioredis";
import WebSocket from "ws";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { Pipeline } from "./pipeline";
import { Classifier } from "./processing/classifier";
import { Geocoder } from "./processing/geocoder";
import { Deduplicator } from "./processing/deduplicator";

import { UsgsAdapter } from "./adapters/usgs";
import { EmscAdapter } from "./adapters/emsc";
import { GdacsAdapter } from "./adapters/gdacs";
import { NasaFirmsAdapter } from "./adapters/nasa-firms";
import { ReliefWebAdapter } from "./adapters/reliefweb";
import { GeoNetNzAdapter } from "./adapters/geonet-nz";
import { UsgsVolcanoesAdapter } from "./adapters/usgs-volcanoes";
import { WhoOutbreaksAdapter } from "./adapters/who-outbreaks";
import { NoaaNhcAdapter } from "./adapters/noaa-nhc";
import { SmithsonianGvpAdapter } from "./adapters/smithsonian-gvp";
import { RssAdapter } from "./adapters/rss";
import { UsTravelAdvisoriesAdapter } from "./adapters/us-travel-advisories";
import { ViaggiareSicuriAdapter } from "./adapters/viaggiaresicuri";
import { TelegramAdapter } from "./adapters/telegram";
import type { BaseAdapter } from "./adapters/base";

// Schema for sources.json config
const SourceConfigSchema = z.object({
  structured: z.record(
    z.object({
      name: z.string(),
      url: z.string(),
      pollingInterval: z.number(),
      enabled: z.boolean(),
    }),
  ),
  osint: z.record(z.unknown()),
});

const RssFeedSchema = z.object({
  name: z.string(),
  url: z.string(),
});

const OsintRssConfigSchema = z.object({
  feeds: z.array(RssFeedSchema),
  pollingInterval: z.number().optional(),
  enabled: z.boolean(),
});

const OsintTelegramConfigSchema = z.object({
  enabled: z.boolean(),
});

// All adapters (polling and non-polling) that need stop()
interface Stoppable {
  stop(): Promise<void>;
  name: string;
}

async function main(): Promise<void> {
  console.log("[collector] Starting TravelRisk Collector...");

  // Load config
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const configPath = resolve(__dirname, "../../config/sources.json");
  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    // Fallback: try relative to project root in production
    const altPath = resolve(__dirname, "../config/sources.json");
    rawConfig = JSON.parse(readFileSync(altPath, "utf-8"));
  }
  const config = SourceConfigSchema.parse(rawConfig);

  // Database
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const db = createPoolClient(databaseUrl, WebSocket);
  console.log("[collector] Database connected");

  // Redis
  const redisUrl = process.env["REDIS_URL"];
  if (!redisUrl) {
    throw new Error("REDIS_URL environment variable is required");
  }
  const redis = new Redis(redisUrl);
  console.log("[collector] Redis connected");

  // Processing components
  const classifier = new Classifier();
  const geocoder = new Geocoder(redis);
  const deduplicator = new Deduplicator();
  const pipeline = new Pipeline(db, redis, classifier, geocoder, deduplicator);

  // Collect all adapters for shutdown
  const adapters: Stoppable[] = [];

  // Structured adapters
  const structuredConfig = config.structured;

  if (structuredConfig["usgs"]?.enabled) {
    const adapter = new UsgsAdapter(structuredConfig["usgs"].pollingInterval);
    adapters.push(adapter);
  }

  if (structuredConfig["emsc"]?.enabled) {
    const adapter = new EmscAdapter(structuredConfig["emsc"].pollingInterval);
    adapters.push(adapter);
  }

  if (structuredConfig["gdacs"]?.enabled) {
    const adapter = new GdacsAdapter(structuredConfig["gdacs"].pollingInterval);
    adapters.push(adapter);
  }

  if (structuredConfig["nasa_firms"]?.enabled && NasaFirmsAdapter.isAvailable()) {
    const adapter = new NasaFirmsAdapter(
      structuredConfig["nasa_firms"].pollingInterval,
    );
    adapters.push(adapter);
  } else if (structuredConfig["nasa_firms"]?.enabled) {
    console.log(
      "[collector] NASA FIRMS enabled but NASA_FIRMS_API_KEY not set, skipping",
    );
  }

  if (structuredConfig["reliefweb"]?.enabled) {
    const adapter = new ReliefWebAdapter(
      structuredConfig["reliefweb"].pollingInterval,
    );
    adapters.push(adapter);
  }

  if (structuredConfig["geonet_nz"]?.enabled) {
    const adapter = new GeoNetNzAdapter(
      structuredConfig["geonet_nz"].pollingInterval,
    );
    adapters.push(adapter);
  }

  if (structuredConfig["usgs_volcanoes"]?.enabled) {
    const adapter = new UsgsVolcanoesAdapter(
      structuredConfig["usgs_volcanoes"].pollingInterval,
    );
    adapters.push(adapter);
  }

  if (structuredConfig["who_outbreaks"]?.enabled) {
    const adapter = new WhoOutbreaksAdapter(
      structuredConfig["who_outbreaks"].pollingInterval,
    );
    adapters.push(adapter);
  }

  if (structuredConfig["noaa_nhc"]?.enabled) {
    const adapter = new NoaaNhcAdapter(
      structuredConfig["noaa_nhc"].pollingInterval,
    );
    adapters.push(adapter);
  }

  if (structuredConfig["smithsonian_gvp"]?.enabled) {
    const adapter = new SmithsonianGvpAdapter(
      structuredConfig["smithsonian_gvp"].pollingInterval,
    );
    adapters.push(adapter);
  }

  // OSINT adapters
  const osintConfig = config.osint;

  const rssConfig = OsintRssConfigSchema.safeParse(osintConfig["rss"]);
  if (rssConfig.success && rssConfig.data.enabled) {
    const adapter = new RssAdapter(
      rssConfig.data.feeds,
      rssConfig.data.pollingInterval,
    );
    adapters.push(adapter);
  }

  // Travel advisories
  const travelConfig = osintConfig["travel_advisories"];
  if (travelConfig && typeof travelConfig === "object" && "enabled" in travelConfig && travelConfig.enabled) {
    const usAdapter = new UsTravelAdvisoriesAdapter();
    adapters.push(usAdapter);

    const vsAdapter = new ViaggiareSicuriAdapter();
    adapters.push(vsAdapter);
  }

  // Telegram (optional)
  const telegramConfig = OsintTelegramConfigSchema.safeParse(
    osintConfig["telegram"],
  );
  let telegramAdapter: TelegramAdapter | null = null;
  if (
    telegramConfig.success &&
    telegramConfig.data.enabled &&
    TelegramAdapter.isAvailable()
  ) {
    telegramAdapter = new TelegramAdapter();
  }

  // Event handler
  const handleEvent = (raw: Parameters<typeof pipeline.process>[0]) => {
    pipeline.process(raw).catch((err: unknown) => {
      console.error(
        "[collector] Pipeline error:",
        err instanceof Error ? err.message : err,
      );
    });
  };

  // Start all polling adapters
  for (const adapter of adapters) {
    try {
      await (adapter as BaseAdapter).start(handleEvent);
      console.log(`[collector] Started adapter: ${adapter.name}`);
    } catch (err: unknown) {
      console.error(
        `[collector] Failed to start ${adapter.name}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Start Telegram adapter separately (non-polling)
  if (telegramAdapter) {
    try {
      await telegramAdapter.start(handleEvent);
      adapters.push(telegramAdapter);
      console.log("[collector] Started Telegram adapter");
    } catch (err: unknown) {
      console.error(
        "[collector] Failed to start Telegram adapter:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `[collector] Running with ${adapters.length} active adapter(s)`,
  );

  // Run every hour — resolve situations with no events in 48h
  setInterval(async () => {
    try {
      const count = await resolveExpiredSituations(db, 48);
      if (count > 0) {
        console.log(`[situations] Resolved ${count} expired situations`);
      }
    } catch (err) {
      console.error("[situations] Error resolving expired:", err instanceof Error ? err.message : err);
    }
  }, 60 * 60 * 1000);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[collector] Received ${signal}, shutting down...`);

    for (const adapter of adapters) {
      try {
        await adapter.stop();
        console.log(`[collector] Stopped adapter: ${adapter.name}`);
      } catch (err: unknown) {
        console.error(
          `[collector] Error stopping ${adapter.name}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    redis.disconnect();
    console.log("[collector] Redis disconnected");
    console.log("[collector] Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

main().catch((err: unknown) => {
  console.error(
    "[collector] Fatal error:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
