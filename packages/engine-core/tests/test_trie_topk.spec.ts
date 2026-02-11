import { describe, it, expect } from "vitest";
import { createTrie, insertWord, topK } from "../src/trie_topk";

describe("trie topK", () => {
  it("returns top words", () => {
    const t = createTrie();
    insertWord(t, "hello", 2);
    insertWord(t, "help", 1);
    expect(topK(t, "he", 2)).toEqual(["hello", "help"]);
  });
});
