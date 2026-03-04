import { z } from "zod";
import type Redis from "ioredis";
import { BaseAdapter } from "./base";
import type { Platform, RawEvent } from "@travelrisk/shared";

const ElevatedVolcanoSchema = z.object({
  vnum: z.string(),
  volcano_name: z.string(),
  alert_level: z.string(),
  color_code: z.string(),
  notice_identifier: z.string().optional(),
  notice_data: z.string().url().optional(),
});

const ElevatedVolcanoesResponseSchema = z.array(ElevatedVolcanoSchema);

const NoticeSectionSchema = z.object({
  vName: z.string().optional(),
  vnum: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  summary: z.string().optional(),
  synopsis: z.string().optional(),
  alertLevel: z.string().optional(),
  colorCode: z.string().optional(),
});

const NoticeDataSchema = z.object({
  notice_sections: z.array(NoticeSectionSchema).optional(),
});

const ALERT_LEVEL_SEVERITY: Record<string, number> = {
  NORMAL: 1,
  ADVISORY: 2,
  WATCH: 3,
  WARNING: 5,
};

const TTL_7D = 7 * 24 * 60 * 60;

export class UsgsVolcanoesAdapter extends BaseAdapter {
  readonly name = "usgs-volcanoes";
  readonly platform: Platform = "api";

  private static readonly FEED_URL =
    "https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes";

  constructor(pollingInterval = 3_600_000, redis?: Redis) {
    super({ defaultConfidence: 1.0, pollingInterval, redis });
  }

  protected async poll(): Promise<void> {
    const response = await fetch(UsgsVolcanoesAdapter.FEED_URL);
    if (!response.ok) {
      throw new Error(`USGS Volcanoes API returned ${response.status}`);
    }

    const json: unknown = await response.json();
    const volcanoes = ElevatedVolcanoesResponseSchema.parse(json);

    const seen = this.getSeenSet(TTL_7D);

    for (const volcano of volcanoes) {
      if (await seen.has(volcano.vnum)) continue;
      await seen.add(volcano.vnum);

      const severity =
        ALERT_LEVEL_SEVERITY[volcano.alert_level.toUpperCase()] ?? 2;

      let lat: number | undefined;
      let lng: number | undefined;
      let summary = `${volcano.volcano_name}: Alert level ${volcano.alert_level}, aviation color code ${volcano.color_code}.`;

      // Fetch notice data for coordinates and details from notice_sections
      if (volcano.notice_data) {
        try {
          const noticeResp = await fetch(volcano.notice_data);
          if (noticeResp.ok) {
            const noticeJson: unknown = await noticeResp.json();
            const notice = NoticeDataSchema.safeParse(noticeJson);
            if (notice.success && notice.data.notice_sections) {
              // Find the section matching this volcano's vnum
              const section = notice.data.notice_sections.find(
                (s) => s.vnum === volcano.vnum,
              );
              if (section) {
                lat = section.lat;
                lng = section.lng;
                if (section.synopsis) {
                  summary = section.synopsis;
                }
              }
            }
          }
        } catch {
          // Use fallback data without notice details
        }
      }

      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: `usgs-volcano-${volcano.vnum}`,
        rawText: `Volcano alert: ${volcano.volcano_name} - ${volcano.alert_level}`,
        rawData: {
          vnum: volcano.vnum,
          alertLevel: volcano.alert_level,
          colorCode: volcano.color_code,
        },
        timestamp: new Date().toISOString(),
        location:
          lat !== undefined && lng !== undefined ? { lat, lng } : undefined,
        locationName: volcano.volcano_name,
        category: "natural_disaster",
        severity,
        confidence: this.defaultConfidence,
        title: `Volcano Alert: ${volcano.volcano_name} - ${volcano.alert_level}`,
        summary,
        url: `https://volcanoes.usgs.gov/hans2/view/notice/${volcano.notice_identifier ?? volcano.vnum}`,
        media: [],
      };

      this.emit(raw);
    }
  }
}
