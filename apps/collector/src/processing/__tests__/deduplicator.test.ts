import { describe, it, expect } from "vitest";
import { jaccardSimilarity, Deduplicator } from "../deduplicator.js";

describe("jaccardSimilarity", () => {
  it("should return 1 for identical strings", () => {
    expect(jaccardSimilarity("hello world", "hello world")).toBe(1);
  });

  it("should return 0 for completely different strings", () => {
    expect(jaccardSimilarity("hello world", "foo bar")).toBe(0);
  });

  it("should return correct similarity for overlapping word sets", () => {
    // "earthquake hits turkey" vs "earthquake in turkey"
    // Set A: {earthquake, hits, turkey} -> 3 words
    // Set B: {earthquake, in, turkey} -> 3 words
    // Intersection: {earthquake, turkey} -> 2
    // Union: 3 + 3 - 2 = 4
    // Similarity: 2/4 = 0.5
    const sim = jaccardSimilarity(
      "earthquake hits turkey",
      "earthquake in turkey",
    );
    expect(sim).toBeCloseTo(0.5, 2);
  });

  it("should be case insensitive", () => {
    expect(
      jaccardSimilarity("EARTHQUAKE TURKEY", "earthquake turkey"),
    ).toBe(1);
  });

  it("should handle empty strings", () => {
    expect(jaccardSimilarity("", "")).toBe(1);
    expect(jaccardSimilarity("hello", "")).toBe(0);
    expect(jaccardSimilarity("", "world")).toBe(0);
  });

  it("should handle strings with extra whitespace", () => {
    expect(
      jaccardSimilarity("  hello   world  ", "hello world"),
    ).toBe(1);
  });

  it("should return high similarity for nearly identical event titles", () => {
    const sim = jaccardSimilarity(
      "M5.2 Earthquake - 10km NE of Istanbul, Turkey",
      "M5.3 Earthquake - 15km NE of Istanbul, Turkey",
    );
    // Many overlapping words
    expect(sim).toBeGreaterThanOrEqual(0.6);
  });

  it("should return low similarity for different events", () => {
    const sim = jaccardSimilarity(
      "M5.2 Earthquake - Istanbul, Turkey",
      "Wildfire destroys homes in California",
    );
    expect(sim).toBeLessThan(0.2);
  });
});

describe("Deduplicator.merge", () => {
  it("should keep the higher severity", () => {
    // Create a mock Deduplicator — we only need the merge method
    // which doesn't use the db, so we can pass null
    const dedup = new Deduplicator(null as never, 0.6);

    const existingEvent = {
      id: "existing-id",
      title: "M5.2 Earthquake",
      summary: "test",
      category: "natural_disaster" as const,
      severity: 3,
      confidence: 0.9,
      location: "",
      locationName: "Turkey",
      countryCode: "TR",
      timestamp: new Date(),
      sources: [{ platform: "api" as const, name: "usgs", retrievedAt: "2023-01-01T00:00:00Z" }],
      media: [],
      rawText: "test",
      clusterId: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lat: 38.42,
      lng: 26.13,
    };

    const result = dedup.merge(existingEvent, 4, [
      { platform: "api", name: "emsc", retrievedAt: "2023-01-01T00:00:00Z" },
    ]);

    expect(result.existingId).toBe("existing-id");
    expect(result.severity).toBe(4); // new severity is higher
    expect(result.sources).toHaveLength(2); // merged sources
  });

  it("should keep existing severity if higher", () => {
    const dedup = new Deduplicator(null as never, 0.6);

    const existingEvent = {
      id: "existing-id",
      title: "M7.0 Earthquake",
      summary: "test",
      category: "natural_disaster" as const,
      severity: 5,
      confidence: 1.0,
      location: "",
      locationName: "Japan",
      countryCode: "JP",
      timestamp: new Date(),
      sources: [{ platform: "api" as const, name: "usgs", retrievedAt: "2023-01-01T00:00:00Z" }],
      media: [],
      rawText: "test",
      clusterId: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lat: 36.0,
      lng: 140.0,
    };

    const result = dedup.merge(existingEvent, 3, [
      { platform: "api", name: "emsc", retrievedAt: "2023-01-01T00:00:00Z" },
    ]);

    expect(result.severity).toBe(5); // existing severity is higher
  });

  it("should aggregate sources from different adapters", () => {
    const dedup = new Deduplicator(null as never, 0.6);

    const existingEvent = {
      id: "existing-id",
      title: "Test",
      summary: "test",
      category: "natural_disaster" as const,
      severity: 3,
      confidence: 0.9,
      location: "",
      locationName: "Test",
      countryCode: null,
      timestamp: new Date(),
      sources: [
        { platform: "api" as const, name: "source1", retrievedAt: "2023-01-01T00:00:00Z" },
        { platform: "api" as const, name: "source2", retrievedAt: "2023-01-01T00:00:00Z" },
      ],
      media: [],
      rawText: null,
      clusterId: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lat: 0,
      lng: 0,
    };

    const result = dedup.merge(existingEvent, 3, [
      { platform: "rss", name: "source3", retrievedAt: "2023-01-01T00:00:00Z" },
    ]);

    expect(result.sources).toHaveLength(3);
  });

  it("should deduplicate sources from the same adapter", () => {
    const dedup = new Deduplicator(null as never, 0.6);

    const existingEvent = {
      id: "existing-id",
      title: "Test",
      summary: "test",
      category: "natural_disaster" as const,
      severity: 3,
      confidence: 0.9,
      location: "",
      locationName: "Test",
      countryCode: null,
      timestamp: new Date(),
      sources: [
        { platform: "api" as const, name: "emsc", retrievedAt: "2023-01-01T00:00:00Z" },
      ],
      media: [],
      rawText: null,
      clusterId: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lat: 0,
      lng: 0,
    };

    const result = dedup.merge(existingEvent, 3, [
      { platform: "api", name: "emsc", retrievedAt: "2023-01-01T01:00:00Z" },
    ]);

    // Should NOT add a second "emsc" entry — just update retrievedAt
    expect(result.sources).toHaveLength(1);
    expect((result.sources[0] as Record<string, unknown>).retrievedAt).toBe("2023-01-01T01:00:00Z");
  });
});
