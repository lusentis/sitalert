import { createPoolClient, resolveExpiredSituations, decaySeverity } from "@travelrisk/db";
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
import { runSituationAudit } from "./processing/situation-audit";
import {
  createJobQueue,
  createJobWorker,
  registerRepeatableJobs,
  runAllJobsImmediately,
  JOB_NAMES,
} from "./jobs";

import { UsgsAdapter } from "./adapters/usgs";
import { EmscAdapter } from "./adapters/emsc";
import { GdacsAdapter } from "./adapters/gdacs";
import { NasaFirmsAdapter } from "./adapters/nasa-firms";
import { GeoNetNzAdapter } from "./adapters/geonet-nz";
import { UsgsVolcanoesAdapter } from "./adapters/usgs-volcanoes";
import { WhoOutbreaksAdapter } from "./adapters/who-outbreaks";
import { NoaaNhcAdapter } from "./adapters/noaa-nhc";
import { SmithsonianGvpAdapter } from "./adapters/smithsonian-gvp";
import { RssAdapter } from "./adapters/rss";
import { syncTravelAdvisories } from "./adapters/us-travel-advisories";
import { syncReliefWebSituations } from "./adapters/reliefweb-situations";
import { syncWikipediaConflicts } from "./adapters/wikipedia-conflicts";
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
  const configPath = resolve(__dirname, "../../../config/sources.json");
  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    // Fallback: production Docker layout (/app/dist → /app/config)
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
    const adapter = new UsgsAdapter(structuredConfig["usgs"].pollingInterval, redis);
    adapters.push(adapter);
  }

  if (structuredConfig["emsc"]?.enabled) {
    const adapter = new EmscAdapter(structuredConfig["emsc"].pollingInterval, redis);
    adapters.push(adapter);
  }

  if (structuredConfig["gdacs"]?.enabled) {
    const adapter = new GdacsAdapter(structuredConfig["gdacs"].pollingInterval, redis);
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

  // ReliefWeb disasters are synced as situations (not events) by
  // syncReliefWebSituations — no need for the event adapter.

  if (structuredConfig["geonet_nz"]?.enabled) {
    const adapter = new GeoNetNzAdapter(
      structuredConfig["geonet_nz"].pollingInterval,
      redis,
    );
    adapters.push(adapter);
  }

  if (structuredConfig["usgs_volcanoes"]?.enabled) {
    const adapter = new UsgsVolcanoesAdapter(
      structuredConfig["usgs_volcanoes"].pollingInterval,
      redis,
    );
    adapters.push(adapter);
  }

  if (structuredConfig["who_outbreaks"]?.enabled) {
    const adapter = new WhoOutbreaksAdapter(
      structuredConfig["who_outbreaks"].pollingInterval,
      redis,
    );
    adapters.push(adapter);
  }

  if (structuredConfig["noaa_nhc"]?.enabled) {
    const adapter = new NoaaNhcAdapter(
      structuredConfig["noaa_nhc"].pollingInterval,
      redis,
    );
    adapters.push(adapter);
  }

  if (structuredConfig["smithsonian_gvp"]?.enabled) {
    const adapter = new SmithsonianGvpAdapter(
      structuredConfig["smithsonian_gvp"].pollingInterval,
      redis,
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
      redis,
    );
    adapters.push(adapter);
  }

  // Travel advisories
  const travelConfig = osintConfig["travel_advisories"];
  if (travelConfig && typeof travelConfig === "object" && "enabled" in travelConfig && travelConfig.enabled) {
    // US advisories — sync directly to advisories table (not event pipeline)
    syncTravelAdvisories(db, redis).catch((err: unknown) => {
      console.error("[collector] US advisory sync failed:", err instanceof Error ? err.message : err);
    });

    // ViaggiareSicuri — actual breaking news events, keep in event pipeline
    const vsAdapter = new ViaggiareSicuriAdapter(undefined, redis);
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

  // Priority queue — still serial (one event at a time) to avoid
  // race conditions, but high-priority sources get processed first.
  // This prevents a burst of 200 wildfire pixels from blocking an earthquake.
  const ADAPTER_PRIORITY: Record<string, number> = {
    // High priority — OSINT, human-written, low-volume
    telegram: 3,
    rss: 2,
    viaggiaresicuri: 2,
    "who-outbreaks": 1,
    gdacs: 1,
    "smithsonian-gvp": 1,
    "usgs-volcanoes": 1,
    // Low priority — high-volume automated feeds
    usgs: 0,
    emsc: 0,
    "geonet-nz": 0,
    "noaa-nhc": 0,
    "nasa-firms": 0,
  };

  type QueuedEvent = { raw: Parameters<typeof pipeline.process>[0]; priority: number };
  const pendingEvents: QueuedEvent[] = [];
  let processing = false;
  let totalProcessed = 0;
  let currentEvent: { adapter: string; title: string; startedAt: number } | null = null;

  const processNext = async () => {
    if (processing || pendingEvents.length === 0) return;
    processing = true;

    // Pick highest priority event (stable: first inserted among equal priority)
    let bestIdx = 0;
    for (let i = 1; i < pendingEvents.length; i++) {
      if (pendingEvents[i].priority > pendingEvents[bestIdx].priority) {
        bestIdx = i;
      }
    }
    const { raw } = pendingEvents.splice(bestIdx, 1)[0];
    currentEvent = {
      adapter: raw.sourceAdapter,
      title: raw.title ?? raw.rawText.slice(0, 60),
      startedAt: performance.now(),
    };

    try {
      await pipeline.process(raw);
    } catch (err: unknown) {
      console.error(
        "[collector] Pipeline error:",
        err instanceof Error ? err.message : err,
      );
    }

    totalProcessed++;
    currentEvent = null;
    processing = false;
    void processNext();
  };

  const handleEvent = (raw: Parameters<typeof pipeline.process>[0]) => {
    const priority = ADAPTER_PRIORITY[raw.sourceAdapter] ?? 1;
    pendingEvents.push({ raw, priority });
    void processNext();
  };

  // Periodic queue status (every 30s)
  setInterval(() => {
    if (pendingEvents.length === 0 && !processing) return;

    const byAdapter = new Map<string, number>();
    for (const e of pendingEvents) {
      byAdapter.set(e.raw.sourceAdapter, (byAdapter.get(e.raw.sourceAdapter) ?? 0) + 1);
    }
    const breakdown = Array.from(byAdapter.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name}=${count}`)
      .join(" ");

    const nowStr = currentEvent
      ? `processing="${currentEvent.title.slice(0, 50)}" from=${currentEvent.adapter} elapsed=${((performance.now() - currentEvent.startedAt) / 1000).toFixed(1)}s`
      : "idle";

    console.log(
      `[queue] depth=${pendingEvents.length} processed=${totalProcessed} | ${nowStr}${breakdown ? ` | pending: ${breakdown}` : ""}`,
    );
  }, 30_000);

  // Seed situations BEFORE starting adapters,
  // so incoming events can immediately match existing situations.
  // Wikipedia conflicts first (armed conflicts context), then ReliefWeb (disasters).
  try {
    await syncWikipediaConflicts(db, geocoder, redis);
  } catch (err: unknown) {
    console.error(
      "[collector] Wikipedia conflict sync failed:",
      err instanceof Error ? err.message : err,
    );
  }

  try {
    await syncReliefWebSituations(db, geocoder, redis);
  } catch (err: unknown) {
    console.error(
      "[collector] ReliefWeb situation sync failed:",
      err instanceof Error ? err.message : err,
    );
  }

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

  // BullMQ job queue for recurring tasks
  const advisoriesEnabled = !!(travelConfig && typeof travelConfig === "object" && "enabled" in travelConfig && travelConfig.enabled);

  const redisOpts = { connection: redis.options };
  const queue = createJobQueue(redisOpts.connection);
  const worker = createJobWorker(redisOpts.connection, async (job) => {
    switch (job.name) {
      case JOB_NAMES.RESOLVE_SITUATIONS: {
        const count = await resolveExpiredSituations(db);
        if (count > 0) {
          console.log(`[situations] Resolved ${count} expired situations`);
        }
        break;
      }
      case JOB_NAMES.DECAY_SEVERITY: {
        const count = await decaySeverity(db);
        if (count > 0) {
          console.log(`[situations] Decayed severity for ${count} situations`);
        }
        break;
      }
      case JOB_NAMES.SYNC_WIKIPEDIA: {
        await syncWikipediaConflicts(db, geocoder, redis);
        break;
      }
      case JOB_NAMES.SYNC_RELIEFWEB: {
        await syncReliefWebSituations(db, geocoder, redis);
        break;
      }
      case JOB_NAMES.SYNC_ADVISORIES: {
        await syncTravelAdvisories(db, redis);
        break;
      }
      case JOB_NAMES.SITUATION_AUDIT: {
        await runSituationAudit(db);
        break;
      }
      default:
        console.warn(`[jobs] Unknown job: ${job.name}`);
    }
  });

  worker.on("completed", (job) => {
    console.log(`[jobs] Completed: ${job.name}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[jobs] Failed: ${job?.name}`, err.message);
  });

  // Register repeatable jobs (idempotent — BullMQ deduplicates)
  await registerRepeatableJobs(queue, advisoriesEnabled);

  // Run all jobs immediately on startup
  await runAllJobsImmediately(queue, advisoriesEnabled);

  console.log("[jobs] BullMQ job queue initialized");

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[collector] Received ${signal}, shutting down...`);

    await worker.close();
    await queue.close();
    console.log("[collector] BullMQ worker and queue closed");

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
