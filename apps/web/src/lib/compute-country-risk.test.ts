import { describe, it, expect } from "vitest";
import { buildAdvisoryScores, advisoryColor, ADVISORY_LEVELS } from "./compute-country-risk";

describe("buildAdvisoryScores", () => {
  it("builds map from advisory data", () => {
    const advisories = [
      { countryCode: "SY", level: 4, title: "", summary: "", sourceUrl: "", sourceName: "", updatedAt: "" },
      { countryCode: "FR", level: 1, title: "", summary: "", sourceUrl: "", sourceName: "", updatedAt: "" },
    ];
    const scores = buildAdvisoryScores(advisories);
    expect(scores.get("SY")).toBe(4);
    expect(scores.get("FR")).toBe(1);
    expect(scores.size).toBe(2);
  });

  it("uppercases country codes", () => {
    const advisories = [
      { countryCode: "sy", level: 4, title: "", summary: "", sourceUrl: "", sourceName: "", updatedAt: "" },
    ];
    const scores = buildAdvisoryScores(advisories);
    expect(scores.get("SY")).toBe(4);
  });
});

describe("advisoryColor", () => {
  it("returns transparent for level 1", () => {
    expect(advisoryColor(1)).toBe("transparent");
  });

  it("returns amber for level 2", () => {
    expect(advisoryColor(2)).toBe("#E2B553");
  });

  it("returns orange for level 3", () => {
    expect(advisoryColor(3)).toBe("#D48A2E");
  });

  it("returns deep red for level 4", () => {
    expect(advisoryColor(4)).toBe("#8B2D15");
  });

  it("returns transparent for unknown levels", () => {
    expect(advisoryColor(0)).toBe("transparent");
    expect(advisoryColor(5)).toBe("transparent");
  });
});

describe("ADVISORY_LEVELS", () => {
  it("has 3 visible levels for legend (excludes level 1)", () => {
    expect(ADVISORY_LEVELS).toHaveLength(3);
    expect(ADVISORY_LEVELS[0].level).toBe(2);
  });
});
