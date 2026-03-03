import { describe, it, expect, vi, afterEach } from "vitest";
import { formatRelativeTime, ageInMinutes, timeRangeToDate } from "../time.js";

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for timestamps less than 60 seconds ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    expect(formatRelativeTime("2024-01-01T11:59:30Z")).toBe("just now");
  });

  it("returns minutes for timestamps less than 1 hour ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    expect(formatRelativeTime("2024-01-01T11:55:00Z")).toBe("5m ago");
  });

  it("returns hours for timestamps less than 24 hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    expect(formatRelativeTime("2024-01-01T10:00:00Z")).toBe("2h ago");
  });

  it("returns days for timestamps less than 30 days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-10T12:00:00Z"));
    expect(formatRelativeTime("2024-01-05T12:00:00Z")).toBe("5d ago");
  });

  it("returns 'just now' for future timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    expect(formatRelativeTime("2024-01-01T13:00:00Z")).toBe("just now");
  });

  it("accepts Date objects", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    expect(formatRelativeTime(new Date("2024-01-01T11:55:00Z"))).toBe(
      "5m ago",
    );
  });
});

describe("ageInMinutes", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates age correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    expect(ageInMinutes("2024-01-01T11:30:00Z")).toBe(30);
  });

  it("returns 0 for future timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    expect(ageInMinutes("2024-01-01T13:00:00Z")).toBe(0);
  });
});

describe("timeRangeToDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns correct date for 1h range", () => {
    vi.useFakeTimers();
    const now = new Date("2024-01-01T12:00:00Z");
    vi.setSystemTime(now);

    const result = timeRangeToDate("1h");
    expect(result.getTime()).toBe(
      new Date("2024-01-01T11:00:00Z").getTime(),
    );
  });

  it("returns correct date for 24h range", () => {
    vi.useFakeTimers();
    const now = new Date("2024-01-01T12:00:00Z");
    vi.setSystemTime(now);

    const result = timeRangeToDate("24h");
    expect(result.getTime()).toBe(
      new Date("2023-12-31T12:00:00Z").getTime(),
    );
  });

  it("returns correct date for 7d range", () => {
    vi.useFakeTimers();
    const now = new Date("2024-01-10T12:00:00Z");
    vi.setSystemTime(now);

    const result = timeRangeToDate("7d");
    expect(result.getTime()).toBe(
      new Date("2024-01-03T12:00:00Z").getTime(),
    );
  });
});
