import { describe, it, expect } from "vitest";
import {
  findActiveSituations,
  createSituation,
  updateSituation,
  resolveExpiredSituations,
} from "../situations";

describe("situations queries", () => {
  it("exports findActiveSituations", () => {
    expect(typeof findActiveSituations).toBe("function");
  });
  it("exports createSituation", () => {
    expect(typeof createSituation).toBe("function");
  });
  it("exports updateSituation", () => {
    expect(typeof updateSituation).toBe("function");
  });
  it("exports resolveExpiredSituations", () => {
    expect(typeof resolveExpiredSituations).toBe("function");
  });
});
