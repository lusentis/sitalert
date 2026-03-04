import { z } from "zod";
import { BaseAdapter } from "./base";
import type { Platform, RawEvent } from "@travelrisk/shared";

const UpdateItemSchema = z.object({
  id: z.string(),
  nazione: z.string(),
  tipologia: z.string(),
  titolo: z.string(),
  testo: z.string(),
  follow: z.string(),
  url: z.string(),
  tsModifica: z.coerce.number(),
});

const ApiResponseSchema = z.object({
  ultima_ora: z.array(UpdateItemSchema),
  aggiornamentiSchedaPaese: z.array(UpdateItemSchema).optional(),
});

/** ISO3 → ISO2 mapping for countries in the feed */
const ISO3_TO_ISO2: Record<string, string> = {
  AFG: "AF", ALB: "AL", DZA: "DZ", AGO: "AO", ARG: "AR",
  AUS: "AU", AUT: "AT", BGD: "BD", BEL: "BE", BFA: "BF",
  BRN: "BN", BGR: "BG", BDI: "BI", KHM: "KH", CMR: "CM",
  CAF: "CF", TCD: "TD", CHL: "CL", CHN: "CN", COL: "CO",
  COD: "CD", CRI: "CR", CIV: "CI", HRV: "HR", CUB: "CU",
  CZE: "CZ", DNK: "DK", DOM: "DO", ECU: "EC", EGY: "EG",
  ERI: "ER", ETH: "ET", FIN: "FI", FRA: "FR", GAB: "GA",
  GEO: "GE", DEU: "DE", GHA: "GH", GRC: "GR", GTM: "GT",
  GIN: "GN", HTI: "HT", HND: "HN", HUN: "HU", IND: "IN",
  IDN: "ID", IRN: "IR", IRQ: "IQ", IRL: "IE", ISR: "IL",
  ITA: "IT", JPN: "JP", JOR: "JO", KAZ: "KZ", KEN: "KE",
  PRK: "KP", KOR: "KR", KWT: "KW", LBN: "LB", LBY: "LY",
  LTU: "LT", MDG: "MG", MYS: "MY", MLI: "ML", MEX: "MX",
  MAR: "MA", MOZ: "MZ", MMR: "MM", NPL: "NP", NLD: "NL",
  NZL: "NZ", NIC: "NI", NER: "NE", NGA: "NG", NOR: "NO",
  OMN: "OM", PAK: "PK", PAN: "PA", PRY: "PY", PER: "PE",
  PHL: "PH", POL: "PL", PRT: "PT", QAT: "QA", ROU: "RO",
  RUS: "RU", RWA: "RW", SAU: "SA", SEN: "SN", SRB: "RS",
  SGP: "SG", SVK: "SK", SVN: "SI", SOM: "SO", ZAF: "ZA",
  ESP: "ES", LKA: "LK", SDN: "SD", SSD: "SS", SWE: "SE",
  CHE: "CH", SYR: "SY", TWN: "TW", TZA: "TZ", THA: "TH",
  TUN: "TN", TUR: "TR", UGA: "UG", UKR: "UA", ARE: "AE",
  GBR: "GB", USA: "US", URY: "UY", VEN: "VE", VNM: "VN",
  YEM: "YE", ZMB: "ZM", ZWE: "ZW", PSE: "PS", BLR: "BY",
  CYP: "CY", SYC: "SC", MDV: "MV", MRT: "MR", COG: "CG",
  CAN: "CA", MUS: "MU", MLT: "MT", FJI: "FJ", VUT: "VU",
  PNG: "PG", TTO: "TT", JAM: "JM", BHS: "BS", BRB: "BB",
  GUY: "GY", SUR: "SR", BOL: "BO", BRA: "BR", SLV: "SV",
  ATG: "AG", KGZ: "KG", TJK: "TJ", UZB: "UZ", TKM: "TM",
  AZE: "AZ", ARM: "AM", MNE: "ME", MKD: "MK", BIH: "BA",
  XKX: "XK", LAO: "LA", MNG: "MN", BTN: "BT",
};

/** Country names for ISO3 codes (Italian → English for geocoding) */
const ISO3_TO_NAME: Record<string, string> = {
  AFG: "Afghanistan", ALB: "Albania", DZA: "Algeria", AGO: "Angola",
  ARG: "Argentina", AUS: "Australia", AUT: "Austria", BGD: "Bangladesh",
  BEL: "Belgium", BFA: "Burkina Faso", BRN: "Brunei", BGR: "Bulgaria",
  BDI: "Burundi", KHM: "Cambodia", CMR: "Cameroon", CAF: "Central African Republic",
  TCD: "Chad", CHL: "Chile", CHN: "China", COL: "Colombia",
  COD: "DR Congo", CRI: "Costa Rica", CIV: "Ivory Coast", HRV: "Croatia",
  CUB: "Cuba", CZE: "Czech Republic", DNK: "Denmark", DOM: "Dominican Republic",
  ECU: "Ecuador", EGY: "Egypt", ERI: "Eritrea", ETH: "Ethiopia",
  FIN: "Finland", FRA: "France", GAB: "Gabon", GEO: "Georgia",
  DEU: "Germany", GHA: "Ghana", GRC: "Greece", GTM: "Guatemala",
  GIN: "Guinea", HTI: "Haiti", HND: "Honduras", HUN: "Hungary",
  IND: "India", IDN: "Indonesia", IRN: "Iran", IRQ: "Iraq",
  IRL: "Ireland", ISR: "Israel", ITA: "Italy", JPN: "Japan",
  JOR: "Jordan", KAZ: "Kazakhstan", KEN: "Kenya", PRK: "North Korea",
  KOR: "South Korea", KWT: "Kuwait", LBN: "Lebanon", LBY: "Libya",
  LTU: "Lithuania", MDG: "Madagascar", MYS: "Malaysia", MLI: "Mali",
  MEX: "Mexico", MAR: "Morocco", MOZ: "Mozambique", MMR: "Myanmar",
  NPL: "Nepal", NLD: "Netherlands", NZL: "New Zealand", NIC: "Nicaragua",
  NER: "Niger", NGA: "Nigeria", NOR: "Norway", OMN: "Oman",
  PAK: "Pakistan", PAN: "Panama", PRY: "Paraguay", PER: "Peru",
  PHL: "Philippines", POL: "Poland", PRT: "Portugal", QAT: "Qatar",
  ROU: "Romania", RUS: "Russia", RWA: "Rwanda", SAU: "Saudi Arabia",
  SEN: "Senegal", SRB: "Serbia", SGP: "Singapore", SVK: "Slovakia",
  SVN: "Slovenia", SOM: "Somalia", ZAF: "South Africa", ESP: "Spain",
  LKA: "Sri Lanka", SDN: "Sudan", SSD: "South Sudan", SWE: "Sweden",
  CHE: "Switzerland", SYR: "Syria", TWN: "Taiwan", TZA: "Tanzania",
  THA: "Thailand", TUN: "Tunisia", TUR: "Turkey", UGA: "Uganda",
  UKR: "Ukraine", ARE: "UAE", GBR: "United Kingdom", USA: "United States",
  URY: "Uruguay", VEN: "Venezuela", VNM: "Vietnam", YEM: "Yemen",
  ZMB: "Zambia", ZWE: "Zimbabwe", PSE: "Palestine", BLR: "Belarus",
  CYP: "Cyprus", SYC: "Seychelles", MDV: "Maldives", MRT: "Mauritania",
  COG: "Republic of the Congo", CAN: "Canada", MUS: "Mauritius",
  MLT: "Malta", JEY: "Jersey", GGY: "Guernsey", IMN: "Isle of Man",
  FJI: "Fiji", VUT: "Vanuatu", PNG: "Papua New Guinea",
  TTO: "Trinidad and Tobago", JAM: "Jamaica", BHS: "Bahamas",
  BRB: "Barbados", GUY: "Guyana", SUR: "Suriname", BOL: "Bolivia",
  BRA: "Brazil", SLV: "El Salvador", ATG: "Antigua and Barbuda",
  KGZ: "Kyrgyzstan", TJK: "Tajikistan", UZB: "Uzbekistan",
  TKM: "Turkmenistan", AZE: "Azerbaijan", ARM: "Armenia",
  MNE: "Montenegro", MKD: "North Macedonia", BIH: "Bosnia and Herzegovina",
  XKX: "Kosovo", LAO: "Laos", MNG: "Mongolia", BTN: "Bhutan",
};

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export class ViaggiareSicuriAdapter extends BaseAdapter {
  readonly name = "viaggiaresicuri";
  readonly platform: Platform = "api";

  private static readonly API_URL =
    "https://www.viaggiaresicuri.it/ultima_ora/totale.json";

  /** Track seen update IDs to avoid re-emitting */
  private seenIds = new Set<string>();

  constructor(pollingInterval = 1_800_000) {
    // 30 minutes default
    super({ defaultConfidence: 0.7, pollingInterval });
  }

  protected async poll(): Promise<void> {
    const res = await fetch(ViaggiareSicuriAdapter.API_URL);
    if (!res.ok) {
      throw new Error(
        `ViaggiareSicuri API returned ${res.status}: ${res.statusText}`,
      );
    }

    const data: unknown = await res.json();
    const parsed = ApiResponseSchema.parse(data);

    // Only process ultima_ora (breaking news) — aggiornamentiSchedaPaese are just
    // "section X was updated" notices with no event content, not worth LLM tokens
    const allItems = parsed.ultima_ora;

    for (const item of allItems) {
      // Dedup by ID + timestamp to detect edits
      const dedupKey = `${item.id}:${item.tsModifica}`;
      if (this.seenIds.has(dedupKey)) continue;
      this.seenIds.add(dedupKey);

      const plainText = stripHtml(item.testo);
      if (!plainText) continue;

      const countryCode = ISO3_TO_ISO2[item.nazione];
      const countryName = ISO3_TO_NAME[item.nazione];
      const title = item.titolo.trim();

      // Emit without category/severity — let the pipeline's LLM classifier handle it
      const raw: RawEvent = {
        sourceAdapter: this.name,
        platform: this.platform,
        externalId: `viaggiaresicuri-${item.id}-${item.tsModifica}`,
        rawText: `${title}\n\n${plainText}`.slice(0, 2000),
        rawData: {
          source: "ViaggiareSicuri (Italian MFA)",
          originalId: item.id,
          iso3: item.nazione,
        },
        timestamp: new Date(item.tsModifica * 1000).toISOString(),
        locationName: countryName,
        countryCode,
        confidence: this.defaultConfidence,
        title,
        summary: plainText.slice(0, 500),
        url: item.url || `https://www.viaggiaresicuri.it/country/${item.nazione}`,
        media: [],
      };

      this.emit(raw);
    }

    console.log(
      `[${this.name}] Processed ${allItems.length} items (${this.seenIds.size} total tracked)`,
    );

    // Prune old IDs
    if (this.seenIds.size > 5_000) {
      const arr = Array.from(this.seenIds);
      this.seenIds = new Set(arr.slice(arr.length - 2_500));
    }
  }
}
