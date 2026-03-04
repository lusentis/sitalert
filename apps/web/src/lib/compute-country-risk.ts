import type { AdvisoryData } from "./api-client";

/**
 * Build a Map of country code -> advisory level from advisory data.
 * Used by ChoroplethLayer to color countries.
 */
export function buildAdvisoryScores(
  advisories: AdvisoryData[],
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const a of advisories) {
    scores.set(a.countryCode.toUpperCase(), a.level);
  }
  return scores;
}

/** Advisory level colors (hex for MapLibre GL compatibility) */
const ADVISORY_COLORS: Record<number, string> = {
  1: "transparent",       // Exercise Normal Precautions — no fill
  2: "#E2B553",           // Exercise Increased Caution — faint amber
  3: "#D48A2E",           // Reconsider Travel — orange
  4: "#8B2D15",           // Do Not Travel — deep red
};

/** Map an advisory level (1-4) to a fill color string. */
export function advisoryColor(level: number): string {
  return ADVISORY_COLORS[level] ?? "transparent";
}

/** Exported for legend rendering. */
export const ADVISORY_LEVELS = [
  { label: "Caution", level: 2, color: ADVISORY_COLORS[2] },
  { label: "Reconsider", level: 3, color: ADVISORY_COLORS[3] },
  { label: "Do Not Travel", level: 4, color: ADVISORY_COLORS[4] },
] as const;
