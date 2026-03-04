import { describe, it, expect } from "vitest";
import { judgmentSchema } from "../judgment";

describe("judgmentSchema", () => {
  it("accepts a duplicate result", () => {
    const result = judgmentSchema.parse({
      duplicateOf: "evt-123",
      situationId: null,
      newSituation: null,
    });
    expect(result.duplicateOf).toBe("evt-123");
    expect(result.situationId).toBeNull();
    expect(result.newSituation).toBeNull();
  });

  it("accepts an existing situation result", () => {
    const result = judgmentSchema.parse({
      duplicateOf: null,
      situationId: "sit-456",
      newSituation: null,
    });
    expect(result.duplicateOf).toBeNull();
    expect(result.situationId).toBe("sit-456");
    expect(result.newSituation).toBeNull();
  });

  it("accepts a new situation result", () => {
    const result = judgmentSchema.parse({
      duplicateOf: null,
      situationId: null,
      newSituation: {
        title: "Major earthquake in Turkey",
        summary: "A 7.2 magnitude earthquake struck eastern Turkey",
      },
    });
    expect(result.duplicateOf).toBeNull();
    expect(result.situationId).toBeNull();
    expect(result.newSituation).toEqual({
      title: "Major earthquake in Turkey",
      summary: "A 7.2 magnitude earthquake struck eastern Turkey",
    });
  });

  it("accepts a standalone result (all null)", () => {
    const result = judgmentSchema.parse({
      duplicateOf: null,
      situationId: null,
      newSituation: null,
    });
    expect(result.duplicateOf).toBeNull();
    expect(result.situationId).toBeNull();
    expect(result.newSituation).toBeNull();
  });

  it("rejects title exceeding 120 characters", () => {
    expect(() =>
      judgmentSchema.parse({
        duplicateOf: null,
        situationId: null,
        newSituation: {
          title: "A".repeat(121),
          summary: "Valid summary",
        },
      }),
    ).toThrow();
  });

  it("rejects summary exceeding 500 characters", () => {
    expect(() =>
      judgmentSchema.parse({
        duplicateOf: null,
        situationId: null,
        newSituation: {
          title: "Valid title",
          summary: "A".repeat(501),
        },
      }),
    ).toThrow();
  });
});
