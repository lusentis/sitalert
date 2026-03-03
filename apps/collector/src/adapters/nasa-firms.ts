import { z } from "zod";
import { BaseAdapter } from "./base.js";
import type { Platform, RawEvent } from "@sitalert/shared";
import { haversineDistance } from "@sitalert/shared";

const FirmsRowSchema = z.object({
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  brightness: z.coerce.number(),
  confidence: z.string(),
  acq_date: z.string(),
  acq_time: z.string(),
});

type FirmsRow = z.infer<typeof FirmsRowSchema>;

interface FireCluster {
  points: FirmsRow[];
  centroidLat: number;
  centroidLng: number;
}

function clusterSizeToSeverity(count: number): number {
  if (count >= 100) return 5;
  if (count >= 50) return 4;
  if (count >= 20) return 3;
  if (count >= 5) return 2;
  return 1;
}

function parseCsv(text: string): FirmsRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: FirmsRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j] ?? "";
    }

    const parsed = FirmsRowSchema.safeParse(record);
    if (parsed.success) {
      rows.push(parsed.data);
    }
  }

  return rows;
}

function clusterFires(rows: FirmsRow[], radiusKm: number): FireCluster[] {
  const clusters: FireCluster[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    if (assigned.has(i)) continue;

    const cluster: FirmsRow[] = [rows[i]];
    assigned.add(i);

    // Simple greedy clustering: add nearby points
    for (let j = i + 1; j < rows.length; j++) {
      if (assigned.has(j)) continue;

      // Check distance against current cluster centroid
      const centroidLat =
        cluster.reduce((sum, p) => sum + p.latitude, 0) / cluster.length;
      const centroidLng =
        cluster.reduce((sum, p) => sum + p.longitude, 0) / cluster.length;

      const dist = haversineDistance(
        centroidLat,
        centroidLng,
        rows[j].latitude,
        rows[j].longitude,
      );

      if (dist <= radiusKm) {
        cluster.push(rows[j]);
        assigned.add(j);
      }
    }

    const centroidLat =
      cluster.reduce((sum, p) => sum + p.latitude, 0) / cluster.length;
    const centroidLng =
      cluster.reduce((sum, p) => sum + p.longitude, 0) / cluster.length;

    clusters.push({ points: cluster, centroidLat, centroidLng });
  }

  return clusters;
}

export class NasaFirmsAdapter extends BaseAdapter {
  readonly name = "nasa-firms";
  readonly platform: Platform = "api";

  private apiKey: string;
  private lastPollDate: string | null = null;

  constructor(pollingInterval = 900_000) {
    super({ defaultConfidence: 0.9, pollingInterval });
    const key = process.env["NASA_FIRMS_API_KEY"];
    if (!key) {
      throw new Error("NASA_FIRMS_API_KEY environment variable is required");
    }
    this.apiKey = key;
  }

  static isAvailable(): boolean {
    return !!process.env["NASA_FIRMS_API_KEY"];
  }

  protected async poll(): Promise<void> {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${this.apiKey}/VIIRS_SNPP_NRT/world/1`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`NASA FIRMS API returned ${response.status}`);
    }

    const text = await response.text();
    const rows = parseCsv(text);

    if (rows.length === 0) return;

    const clusters = clusterFires(rows, 10);
    const now = new Date().toISOString();
    const pollId = now.slice(0, 13); // hourly granularity for dedup

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const count = cluster.points.length;
      const severity = clusterSizeToSeverity(count);

      // Use first point's acquisition date/time for timestamp
      const firstPoint = cluster.points[0];
      const timestamp = new Date(
        `${firstPoint.acq_date}T${firstPoint.acq_time.padStart(4, "0").slice(0, 2)}:${firstPoint.acq_time.padStart(4, "0").slice(2)}:00Z`,
      ).toISOString();

      const avgBrightness =
        cluster.points.reduce((sum, p) => sum + p.brightness, 0) / count;

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: `firms-${pollId}-cluster-${i}`,
        rawText: `Active fire cluster: ${count} hotspot(s) detected`,
        rawData: {
          clusterSize: count,
          avgBrightness,
          points: cluster.points.map((p) => ({
            lat: p.latitude,
            lng: p.longitude,
            brightness: p.brightness,
          })),
        },
        timestamp,
        location: {
          lat: cluster.centroidLat,
          lng: cluster.centroidLng,
        },
        category: "natural_disaster",
        severity,
        confidence: this.defaultConfidence,
        title: `Active Fire Cluster - ${count} Hotspot${count > 1 ? "s" : ""} Detected`,
        summary: `${count} active fire hotspot(s) detected by NASA FIRMS VIIRS. Average brightness: ${avgBrightness.toFixed(0)}K.`,
        media: [],
      };

      this.emit(raw);
    }

    this.lastPollDate = pollId;
  }
}
