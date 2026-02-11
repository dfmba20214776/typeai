import { describe, it, expect } from "vitest";
import { Engine } from "../src/engine";

const dict = ["hello", "help", "helium", "오늘", "오늘은", "가나다"];
const ngram = ["오늘\t날씨가", "오늘\t기분이", "hello\tworld"];

describe("engine end-to-end", () => {
  it("suggests prefix completion", () => {
    const e = new Engine();
    e.initDict(dict);
    const out = e.suggest({ committedBeforeCursor: "he", preedit: "" });
    expect(out.mode).toBe("prefix");
    expect(out.items.length).toBeGreaterThan(0);
  });

  it("suggests next word on boundary", () => {
    const e = new Engine();
    e.initDict(dict);
    e.initNgram(ngram);
    const out = e.suggest({ committedBeforeCursor: "오늘 ", preedit: "" });
    expect(out.mode).toBe("boundary");
    expect(out.items[0].type).toBe("next_word");
  });

  it("does not suggest the exact same word on prefix", () => {
    const e = new Engine();
    e.initDict(["오늘", "오늘은", "오늘도"]);
    const out = e.suggest({ committedBeforeCursor: "오늘", preedit: "" });
    expect(out.mode).toBe("prefix");
    expect(out.items.some((x) => x.displayText === "오늘")).toBe(false);
  });

  it("uses dictionary frequency from corpus rows", () => {
    const e = new Engine();
    e.initDict(["가방\t100", "가게\t3"]);
    const out = e.suggest({ committedBeforeCursor: "가", preedit: "" });
    expect(out.items[0]?.displayText).toBe("가방");
  });

  it("prioritizes ngram candidates on prefix when previous token exists", () => {
    const e = new Engine();
    e.initDict(["날씨가", "날씨는", "날짜"]);
    e.initNgram(["오늘\t날씨가\t50", "오늘\t날씨는\t10"]);
    const out = e.suggest({ committedBeforeCursor: "오늘 날", preedit: "" });
    expect(out.mode).toBe("prefix");
    expect(out.items[0]?.displayText).toBe("날씨가");
    expect(out.items[0]?.source).toBe("ngram");
  });
});
