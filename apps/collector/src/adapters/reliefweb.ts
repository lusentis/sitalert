import { z } from "zod";
import { BaseAdapter } from "./base.js";
import type { Platform, RawEvent, EventCategory } from "@sitalert/shared";

const ReliefWebFieldsSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  "date.created": z.string().optional(),
  "country.name": z.union([z.string(), z.array(z.string())]).optional(),
  status: z.string().optional(),
  url: z.string().url().optional(),
});

const ReliefWebItemSchema = z.object({
  id: z.string(),
  fields: ReliefWebFieldsSchema,
});

const ReliefWebResponseSchema = z.object({
  data: z.array(ReliefWebItemSchema),
});

const STATUS_SEVERITY: Record<string, number> = {
  ongoing: 3,
  alert: 4,
  past: 1,
};

function inferCategory(title: string): EventCategory {
  const lower = title.toLowerCase();
  if (lower.includes("earthquake") || lower.includes("tsunami")) return "natural_disaster";
  if (lower.includes("flood") || lower.includes("flooding")) return "natural_disaster";
  if (lower.includes("cyclone") || lower.includes("hurricane") || lower.includes("typhoon") || lower.includes("storm")) return "weather_extreme";
  if (lower.includes("volcano") || lower.includes("eruption")) return "natural_disaster";
  if (lower.includes("drought")) return "weather_extreme";
  if (lower.includes("wildfire") || lower.includes("fire")) return "natural_disaster";
  if (lower.includes("conflict") || lower.includes("war") || lower.includes("armed") || lower.includes("military")) return "conflict";
  if (lower.includes("terror") || lower.includes("attack") || lower.includes("bombing")) return "terrorism";
  if (lower.includes("epidemic") || lower.includes("outbreak") || lower.includes("pandemic") || lower.includes("disease") || lower.includes("cholera") || lower.includes("ebola")) return "health_epidemic";
  if (lower.includes("protest") || lower.includes("unrest") || lower.includes("riot")) return "civil_unrest";
  return "natural_disaster";
}

export class ReliefWebAdapter extends BaseAdapter {
  readonly name = "reliefweb";
  readonly platform: Platform = "api";

  private seenIds = new Set<string>();

  private static readonly API_URL =
    "https://api.reliefweb.int/v1/reports?appname=sitalert&limit=20&filter[field]=date.created&filter[value][from]=now-1d&fields[include][]=title&fields[include][]=body&fields[include][]=date.created&fields[include][]=country.name&fields[include][]=status&fields[include][]=url";

  constructor(pollingInterval = 900_000) {
    super({ defaultConfidence: 0.8, pollingInterval });
  }

  protected async poll(): Promise<void> {
    const response = await fetch(ReliefWebAdapter.API_URL);
    if (!response.ok) {
      throw new Error(`ReliefWeb API returned ${response.status}`);
    }

    const json: unknown = await response.json();
    const data = ReliefWebResponseSchema.parse(json);

    for (const item of data.data) {
      if (this.seenIds.has(item.id)) continue;
      this.seenIds.add(item.id);

      const { title, body, status, url } = item.fields;
      const dateCreated = item.fields["date.created"];
      const countryName = item.fields["country.name"];

      const severity = STATUS_SEVERITY[status ?? ""] ?? 2;
      const category = inferCategory(title);

      const countries = Array.isArray(countryName)
        ? countryName
        : countryName
          ? [countryName]
          : [];
      const locationName = countries.length > 0 ? countries.join(", ") : undefined;

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: `reliefweb-${item.id}`,
        rawText: body ? `${title}\n\n${body.slice(0, 1000)}` : title,
        rawData: {
          status,
          countries,
        },
        timestamp: dateCreated
          ? new Date(dateCreated).toISOString()
          : new Date().toISOString(),
        locationName,
        category,
        severity,
        confidence: this.defaultConfidence,
        title,
        summary: body ? body.slice(0, 500) : title,
        url,
        media: [],
      };

      this.emit(raw);
    }

    // Prune old IDs
    if (this.seenIds.size > 10_000) {
      const arr = Array.from(this.seenIds);
      this.seenIds = new Set(arr.slice(arr.length - 5_000));
    }
  }
}
