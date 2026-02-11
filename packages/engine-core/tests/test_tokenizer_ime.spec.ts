import { describe, it, expect } from "vitest";
import { tokenize } from "../src/tokenizer";

describe("tokenizer IME", () => {
  it("combines committed + preedit", () => {
    const r = tokenize("가", "나");
    expect(r.lastToken).toBe("가나");
  });
});
