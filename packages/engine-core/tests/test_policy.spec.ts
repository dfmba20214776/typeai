import { describe, it, expect } from "vitest";
import { decideMode } from "../src/policy";

describe("policy", () => {
  it("prefix when not boundary", () => {
    expect(decideMode(false)).toBe("prefix");
  });
  it("boundary when boundary", () => {
    expect(decideMode(true)).toBe("boundary");
  });
});
