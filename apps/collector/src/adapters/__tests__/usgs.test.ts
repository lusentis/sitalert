import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UsgsAdapter, magnitudeToSeverity } from "../usgs.js";
import type { RawEvent } from "@sitalert/shared";

describe("magnitudeToSeverity", () => {
  it("should return 1 for magnitude 2.5-3.9", () => {
    expect(magnitudeToSeverity(2.5)).toBe(1);
    expect(magnitudeToSeverity(3.0)).toBe(1);
    expect(magnitudeToSeverity(3.9)).toBe(1);
  });

  it("should return 2 for magnitude 4-4.9", () => {
    expect(magnitudeToSeverity(4.0)).toBe(2);
    expect(magnitudeToSeverity(4.5)).toBe(2);
    expect(magnitudeToSeverity(4.9)).toBe(2);
  });

  it("should return 3 for magnitude 5-5.9", () => {
    expect(magnitudeToSeverity(5.0)).toBe(3);
    expect(magnitudeToSeverity(5.9)).toBe(3);
  });

  it("should return 4 for magnitude 6-6.9", () => {
    expect(magnitudeToSeverity(6.0)).toBe(4);
    expect(magnitudeToSeverity(6.9)).toBe(4);
  });

  it("should return 5 for magnitude 7+", () => {
    expect(magnitudeToSeverity(7.0)).toBe(5);
    expect(magnitudeToSeverity(8.5)).toBe(5);
    expect(magnitudeToSeverity(9.0)).toBe(5);
  });
});

const SAMPLE_USGS_RESPONSE = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      properties: {
        mag: 5.2,
        place: "10km NE of TestCity",
        time: 1700000000000,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/test1",
        title: "M 5.2 - 10km NE of TestCity",
        type: "earthquake",
        ids: ",test1,",
      },
      geometry: {
        type: "Point" as const,
        coordinates: [-120.5, 35.7, 10.0] as [number, number, number],
      },
      id: "test1",
    },
    {
      type: "Feature" as const,
      properties: {
        mag: 3.1,
        place: "5km SW of OtherPlace",
        time: 1700001000000,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/test2",
        title: "M 3.1 - 5km SW of OtherPlace",
        type: "earthquake",
        ids: ",test2,",
      },
      geometry: {
        type: "Point" as const,
        coordinates: [130.2, -5.3, 50.0] as [number, number, number],
      },
      id: "test2",
    },
  ],
};

describe("UsgsAdapter", () => {
  let adapter: UsgsAdapter;
  let emittedEvents: RawEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new UsgsAdapter(60_000);
    emittedEvents = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(SAMPLE_USGS_RESPONSE),
      }),
    );
  });

  afterEach(async () => {
    await adapter.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should transform GeoJSON features into RawEvents", async () => {
    await adapter.start((event: RawEvent) => {
      emittedEvents.push(event);
    });

    // Advance timers to trigger the first poll
    await vi.advanceTimersByTimeAsync(60_001);

    expect(emittedEvents.length).toBe(2);

    const event1 = emittedEvents.find((e) => e.externalId === "test1");
    expect(event1).toBeDefined();
    expect(event1!.title).toBe("M5.2 Earthquake - 10km NE of TestCity");
    expect(event1!.severity).toBe(3); // 5.2 -> severity 3
    expect(event1!.category).toBe("natural_disaster");
    expect(event1!.confidence).toBe(1.0);
    expect(event1!.location).toEqual({ lat: 35.7, lng: -120.5 });
    expect(event1!.platform).toBe("api");

    const event2 = emittedEvents.find((e) => e.externalId === "test2");
    expect(event2).toBeDefined();
    expect(event2!.severity).toBe(1); // 3.1 -> severity 1
    expect(event2!.location).toEqual({ lat: -5.3, lng: 130.2 });
  });

  it("should not re-emit already seen events", async () => {
    await adapter.start((event: RawEvent) => {
      emittedEvents.push(event);
    });

    // First poll
    await vi.advanceTimersByTimeAsync(60_001);
    expect(emittedEvents.length).toBe(2);

    // Second poll with same data
    emittedEvents = [];
    await vi.advanceTimersByTimeAsync(60_001);

    // Should not have re-emitted the same events
    expect(emittedEvents.length).toBe(0);
  });

  it("should handle fetch errors gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await adapter.start((event: RawEvent) => {
      emittedEvents.push(event);
    });

    await vi.advanceTimersByTimeAsync(60_001);

    expect(emittedEvents.length).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[usgs] Poll error"),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });
});
