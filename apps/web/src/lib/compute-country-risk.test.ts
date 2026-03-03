import { describe, it, expect } from "vitest";
import { computeCountryRisk, riskColor } from "./compute-country-risk";
import type { GeoJSONFeatureCollection } from "@travelrisk/db";

function makeFeature(countryCode: string | null, severity: number) {
  return {
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [0, 0] as [number, number],
    },
    properties: {
      id: crypto.randomUUID(),
      title: "Test",
      summary: "",
      category: "conflict",
      severity,
      confidence: 1,
      locationName: "Test",
      countryCode,
      timestamp: new Date().toISOString(),
      ageMinutes: 0,
      sourceCount: 1,
      sources: [],
    },
  };
}

describe("computeCountryRisk", () => {
  it("sums severity per country code", () => {
    const data: GeoJSONFeatureCollection = {
      type: "FeatureCollection",
      features: [
        makeFeature("US", 3),
        makeFeature("US", 4),
        makeFeature("GB", 2),
      ],
    };
    const scores = computeCountryRisk(data);
    expect(scores.get("US")).toBe(7);
    expect(scores.get("GB")).toBe(2);
  });

  it("skips features with null countryCode", () => {
    const data: GeoJSONFeatureCollection = {
      type: "FeatureCollection",
      features: [makeFeature(null, 5), makeFeature("FR", 1)],
    };
    const scores = computeCountryRisk(data);
    expect(scores.has("")).toBe(false);
    expect(scores.get("FR")).toBe(1);
  });

  it("returns empty map for no features", () => {
    const data: GeoJSONFeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };
    expect(computeCountryRisk(data).size).toBe(0);
  });
});

describe("riskColor", () => {
  it("returns transparent for score 0", () => {
    expect(riskColor(0)).toBe("transparent");
  });

  it("returns low color for scores 1-5", () => {
    const color = riskColor(3);
    expect(color).not.toBe("transparent");
  });

  it("returns critical color for scores 31+", () => {
    const low = riskColor(1);
    const critical = riskColor(50);
    expect(critical).not.toBe(low);
  });
});
