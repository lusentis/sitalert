import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EmscAdapter } from "../emsc.js";
import { magnitudeToSeverity } from "../usgs.js";
import type { RawEvent } from "@sitalert/shared";

const SAMPLE_EMSC_RESPONSE = {
  features: [
    {
      type: "Feature" as const,
      id: "20231114_0000123",
      properties: {
        unid: "20231114_0000123",
        lat: 38.42,
        lon: 26.13,
        mag: 4.7,
        flynn_region: "Western Turkey",
        time: "2023-11-14T10:30:00Z",
        depth: 15,
        source_id: "EMSC",
      },
      geometry: {
        type: "Point" as const,
        coordinates: [26.13, 38.42] as [number, number],
      },
    },
    {
      type: "Feature" as const,
      id: "20231114_0000456",
      properties: {
        unid: "20231114_0000456",
        lat: -33.5,
        lon: -70.2,
        mag: 6.3,
        flynn_region: "Central Chile",
        time: "2023-11-14T12:00:00Z",
        depth: 45,
        source_id: "EMSC",
      },
      geometry: {
        type: "Point" as const,
        coordinates: [-70.2, -33.5] as [number, number],
      },
    },
  ],
};

describe("EmscAdapter", () => {
  let adapter: EmscAdapter;
  let emittedEvents: RawEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new EmscAdapter(60_000);
    emittedEvents = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(SAMPLE_EMSC_RESPONSE),
      }),
    );
  });

  afterEach(async () => {
    await adapter.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should transform EMSC features into RawEvents", async () => {
    await adapter.start((event: RawEvent) => {
      emittedEvents.push(event);
    });

    await vi.advanceTimersByTimeAsync(60_001);

    expect(emittedEvents.length).toBe(2);

    const event1 = emittedEvents.find(
      (e) => e.externalId === "20231114_0000123",
    );
    expect(event1).toBeDefined();
    expect(event1!.title).toBe("M4.7 Earthquake - Western Turkey");
    expect(event1!.severity).toBe(2); // 4.7 -> severity 2
    expect(event1!.category).toBe("natural_disaster");
    expect(event1!.location).toEqual({ lat: 38.42, lng: 26.13 });

    const event2 = emittedEvents.find(
      (e) => e.externalId === "20231114_0000456",
    );
    expect(event2).toBeDefined();
    expect(event2!.title).toBe("M6.3 Earthquake - Central Chile");
    expect(event2!.severity).toBe(4); // 6.3 -> severity 4
    expect(event2!.location).toEqual({ lat: -33.5, lng: -70.2 });
  });

  it("should use the same magnitude-to-severity mapping as USGS", () => {
    expect(magnitudeToSeverity(3.5)).toBe(1);
    expect(magnitudeToSeverity(4.2)).toBe(2);
    expect(magnitudeToSeverity(5.5)).toBe(3);
    expect(magnitudeToSeverity(6.8)).toBe(4);
    expect(magnitudeToSeverity(7.5)).toBe(5);
  });

  it("should not re-emit seen events", async () => {
    await adapter.start((event: RawEvent) => {
      emittedEvents.push(event);
    });

    await vi.advanceTimersByTimeAsync(60_001);
    expect(emittedEvents.length).toBe(2);

    emittedEvents = [];
    await vi.advanceTimersByTimeAsync(60_001);

    expect(emittedEvents.length).toBe(0);
  });
});
