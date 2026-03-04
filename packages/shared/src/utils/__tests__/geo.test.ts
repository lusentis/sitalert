import { describe, it, expect } from "vitest";
import { haversineDistance, isWithinBBox } from "../geo";

describe("haversineDistance", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistance(0, 0, 0, 0)).toBe(0);
  });

  it("calculates distance between New York and London (~5570 km)", () => {
    const distance = haversineDistance(40.7128, -74.006, 51.5074, -0.1278);
    expect(distance).toBeGreaterThan(5500);
    expect(distance).toBeLessThan(5600);
  });

  it("calculates distance between nearby points (< 1km)", () => {
    // Two points ~111m apart (0.001 degree latitude)
    const distance = haversineDistance(45.0, 9.0, 45.001, 9.0);
    expect(distance).toBeGreaterThan(0.1);
    expect(distance).toBeLessThan(0.2);
  });

  it("calculates antipodal distance (~20000 km)", () => {
    const distance = haversineDistance(0, 0, 0, 180);
    expect(distance).toBeGreaterThan(20000);
    expect(distance).toBeLessThan(20100);
  });
});

describe("isWithinBBox", () => {
  const bbox = { west: -10, south: -10, east: 10, north: 10 };

  it("returns true for point inside bbox", () => {
    expect(isWithinBBox(0, 0, bbox)).toBe(true);
  });

  it("returns true for point on boundary", () => {
    expect(isWithinBBox(10, 10, bbox)).toBe(true);
    expect(isWithinBBox(-10, -10, bbox)).toBe(true);
  });

  it("returns false for point outside bbox", () => {
    expect(isWithinBBox(15, 0, bbox)).toBe(false);
    expect(isWithinBBox(0, 15, bbox)).toBe(false);
  });
});
