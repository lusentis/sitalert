import type { GeoJSONFeatureCollection } from "@travelrisk/db";

/**
 * Compute per-country risk scores by summing event severity.
 * Returns a Map of uppercase ISO 3166-1 alpha-2 code -> total severity score.
 */
export function computeCountryRisk(
  data: GeoJSONFeatureCollection,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const feature of data.features) {
    const code = feature.properties.countryCode;
    if (!code) continue;
    const key = code.toUpperCase();
    scores.set(key, (scores.get(key) ?? 0) + feature.properties.severity);
  }
  return scores;
}

/** Risk thresholds and colors (hex for MapLibre GL compatibility) */
const RISK_SCALE = [
  { max: 0, color: "transparent" },
  { max: 5, color: "#E2B553" },   // Low — faint amber
  { max: 15, color: "#D48A2E" },  // Moderate — orange
  { max: 30, color: "#B74E1A" },  // High — red-orange
  { max: Infinity, color: "#8B2D15" }, // Critical — deep red
] as const;

/** Map a numeric risk score to a fill color string. */
export function riskColor(score: number): string {
  for (const level of RISK_SCALE) {
    if (score <= level.max) return level.color;
  }
  return RISK_SCALE[RISK_SCALE.length - 1].color;
}

/** The RISK_SCALE exported for legend rendering. */
export const RISK_LEVELS = [
  { label: "Low", minScore: 1, color: RISK_SCALE[1].color },
  { label: "Moderate", minScore: 6, color: RISK_SCALE[2].color },
  { label: "High", minScore: 16, color: RISK_SCALE[3].color },
  { label: "Critical", minScore: 31, color: RISK_SCALE[4].color },
] as const;
