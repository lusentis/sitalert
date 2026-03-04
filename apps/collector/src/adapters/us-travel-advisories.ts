import { z } from "zod";
import { upsertAdvisory } from "@travelrisk/db/queries";
import type { PoolClient } from "@travelrisk/db/client";

const AdvisorySchema = z.object({
  Title: z.string(),
  Category: z.array(z.string()),
  Summary: z.string(),
  Published: z.string(),
  Updated: z.string(),
  Link: z.string().url(),
  id: z.string(),
});

const ApiResponseSchema = z.array(AdvisorySchema);

function parseAdvisoryLevel(title: string): number {
  const match = title.match(/Level\s+(\d)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const API_URL = "https://cadataapi.state.gov/api/TravelAdvisories";
const SOURCE_NAME = "us-travel-advisories";

/** US State Dept uses FIPS 10-4 codes; the map GeoJSON uses ISO 3166-1 alpha-2.
 *  Only entries where FIPS !== ISO are listed — unlisted codes pass through as-is. */
const FIPS_TO_ISO: Record<string, string> = {
  AC: "AG", AG: "DZ", AJ: "AZ", AN: "AD", AS: "AU", AU: "AT", AV: "AI",
  AY: "AQ", BA: "BH", BC: "BW", BD: "BM", BF: "BS", BG: "BD", BH: "BZ",
  BK: "BA", BL: "BO", BM: "MM", BN: "BJ", BO: "BY", BP: "SB", BU: "BG",
  BX: "BN", BY: "BI", CB: "KH", CD: "TD", CE: "LK", CF: "CG", CG: "CD",
  CH: "CN", CI: "CL", CJ: "KY", CN: "KM", CS: "CR", CT: "CF", DA: "DK",
  DO: "DM", DR: "DO", EI: "IE", EK: "GQ", EN: "EE", ES: "SV", EZ: "CZ",
  FP: "PF", GA: "GM", GB: "GA", GG: "GE", GJ: "GD", GM: "DE", GV: "GN",
  HA: "HT", HO: "HN", IC: "IS", IV: "CI", IZ: "IQ", JA: "JP", KN: "KP",
  KR: "KI", KS: "KR", KU: "KW", KV: "XK", LE: "LB", LG: "LV", LH: "LT",
  LI: "LR", LO: "SK", LS: "LI", LT: "LS", MA: "MG", MC: "MO", MG: "MN",
  MH: "MS", MI: "MW", MJ: "ME", MO: "MA", MP: "MU", MU: "OM", NG: "NE",
  NH: "VU", NI: "NG", NN: "SX", NS: "SR", NU: "NI", OD: "SS", PA: "PY",
  PM: "PA", PO: "PT", PP: "PG", PS: "PW", RI: "RS", RM: "MH", RP: "PH",
  RS: "RU", SC: "KN", SE: "SC", SF: "ZA", SG: "SN", SN: "SG", SP: "ES",
  SR: "CH", ST: "LC", SU: "SD", SW: "SE", TD: "TT", TI: "TJ", TK: "TC",
  TN: "TO", TO: "TG", TP: "ST", TS: "TN", TT: "TL", TU: "TR", TX: "TM",
  UC: "CW", UK: "GB", UP: "UA", UV: "BF", VI: "VG", VM: "VN", WA: "NA",
  WZ: "SZ", YM: "YE", ZA: "ZM", ZI: "ZW",
};

export async function syncTravelAdvisories(db: PoolClient): Promise<number> {
  const res = await fetch(API_URL);
  if (!res.ok) {
    throw new Error(
      `US Travel Advisories API returned ${res.status}: ${res.statusText}`,
    );
  }

  const data: unknown = await res.json();
  const advisories = ApiResponseSchema.parse(data);
  let count = 0;

  for (const advisory of advisories) {
    const level = parseAdvisoryLevel(advisory.Title);
    if (level === 0) continue;

    const fipsCode = advisory.Category[0]?.trim().toUpperCase() ?? "";
    if (!fipsCode) continue;
    const countryCode = FIPS_TO_ISO[fipsCode] ?? fipsCode;

    const plainSummary = stripHtml(advisory.Summary);

    await upsertAdvisory(db, {
      countryCode,
      level,
      title: advisory.Title,
      summary: plainSummary.slice(0, 1000),
      sourceUrl: advisory.Link,
      sourceName: SOURCE_NAME,
      updatedAt: new Date(advisory.Updated),
    });
    count++;
  }

  console.log(`[${SOURCE_NAME}] Synced ${count} advisories`);
  return count;
}
