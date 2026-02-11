import type { EngineInput, EngineOutput, SuggestionItem } from "./types";
import { tokenize } from "./tokenizer";
import { createTrie, insertWord, topK } from "./trie_topk";
import { MRU } from "./mru";
import { loadNgramFromLines, suggestNext, suggestNextWithPrefix } from "./ngram";
import { decideMode } from "./policy";
import { scoreWord } from "./rank";

export class Engine {
  private trie = createTrie();
  private mru = new MRU();
  private ngram = loadNgramFromLines([]);

  reset(): void {
    this.trie = createTrie();
    this.mru = new MRU();
    this.ngram = loadNgramFromLines([]);
  }

  initDict(words: string[]): void {
    for (const row of words) {
      const [wordRaw, freqRaw] = row.split("\t");
      const word = wordRaw?.trim();
      if (!word) continue;
      const parsed = Number(freqRaw);
      const freq = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
      insertWord(this.trie, word, freq);
    }
  }

  initNgram(lines: string[]): void {
    this.ngram = loadNgramFromLines(lines);
  }

  suggest(input: EngineInput): EngineOutput {
    const t0 = performance.now();
    const tokenized = tokenize(input.committedBeforeCursor, input.preedit);
    const { lastToken, boundary } = tokenized;
    const mode = decideMode(boundary);
    const items: SuggestionItem[] = [];

    if (mode === "prefix") {
      const replaceStart = input.committedBeforeCursor.length - lastToken.length;
      const prevToken = tokenized.tokens.length >= 2 ? tokenized.tokens[tokenized.tokens.length - 2] : "";
      const ngramWords = prevToken ? suggestNextWithPrefix(this.ngram, prevToken, lastToken, 20) : [];
      const mruWords = this.mru.top(lastToken, 20);
      const dictWords = topK(this.trie, lastToken, 80);
      const seen = new Set<string>();
      const candidates: Array<{ word: string; source: "mru" | "dict" | "ngram" }> = [];

      for (const w of ngramWords) {
        if (seen.has(w)) continue;
        seen.add(w);
        candidates.push({ word: w, source: "ngram" });
      }
      for (const w of mruWords) {
        if (seen.has(w)) continue;
        seen.add(w);
        candidates.push({ word: w, source: "mru" });
      }
      for (const w of dictWords) {
        if (seen.has(w)) continue;
        seen.add(w);
        candidates.push({ word: w, source: "dict" });
      }

      const filtered = candidates
        // Keep original ranking order but avoid echoing the exact same word.
        .filter((x) => x.word !== lastToken)
        .slice(0, 5);

      for (const x of filtered) {
        items.push(this.makeItem("complete_word", x.source, lastToken, x.word, replaceStart));
      }
    } else {
      const tokens = tokenize(input.committedBeforeCursor, "").tokens;
      const prev = tokens.length ? tokens[tokens.length - 1] : "";
      const next = suggestNext(this.ngram, prev, 5);
      for (const w of next) {
        items.push(this.makeItem("next_word", "ngram", "", w, input.committedBeforeCursor.length));
      }
    }

    const latencyMs = performance.now() - t0;
    return { items, mode, latencyMs, prefix: lastToken };
  }

  accept(item: SuggestionItem): void {
    this.mru.bump(item.insertText.trim());
  }

  private makeItem(type: "complete_word" | "next_word", source: "dict" | "ngram" | "mru", prefix: string, word: string, replaceStart: number): SuggestionItem {
    const safeStart = Math.max(0, replaceStart);
    const insertText = type === "complete_word" ? word : (prefix.length ? " " + word : word);
    return {
      id: `${type}:${source}:${word}`,
      type,
      source,
      displayText: word,
      insertText,
      replaceRange: { start: safeStart, end: safeStart + prefix.length },
      score: scoreWord(1, source === "mru" ? 1 : 0)
    };
  }
}
