import { describe, it, expect } from "vitest";
import { Deduplicator } from "../deduplicator";

describe("Deduplicator.merge", () => {
  it("should keep the higher severity", () => {
    const dedup = new Deduplicator();

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
      situationId: null,
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
    const dedup = new Deduplicator();

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
      situationId: null,
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
    const dedup = new Deduplicator();

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
      situationId: null,
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
    const dedup = new Deduplicator();

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
      situationId: null,
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
