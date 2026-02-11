import { describe, it, expect } from "vitest";
import { Engine } from "@lab/engine-core/src/engine";

// Minimal contract test without actual Worker runtime

describe("worker contract", () => {
  it("init + suggest", () => {
    const e = new Engine();
    e.initDict(["hello", "help"]);
    const out = e.suggest({ committedBeforeCursor: "he", preedit: "" });
    expect(out.items.length).toBeGreaterThan(0);
  });
});
