"use client";

import { create } from "zustand";
import { Engine } from "@lab/engine-core/src/engine";
import type { SuggestionItem } from "@lab/engine-core/src/types";

export type SentenceSuggestion = {
  id: string;
  text: string;
  source: "llm";
};

export type AISuggestionType = "sentence" | "paragraph";

const engine = new Engine();

const FALLBACK_DICT = ["hello", "help", "helium", "오늘", "오늘은", "가나다"];
const FALLBACK_NGRAM = ["오늘\t날씨가", "오늘\t기분이", "hello\tworld"];
engine.initDict(FALLBACK_DICT);
engine.initNgram(FALLBACK_NGRAM);

let corpusLoadPromise: Promise<void> | null = null;
let currentCorpusSource: "fallback" | "public" = "fallback";
let currentCorpusDictSize = FALLBACK_DICT.length;
let currentCorpusNgramSize = FALLBACK_NGRAM.length;

function parseLines(input: string): string[] {
  return input
    .split(/\r?\n/g)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

async function loadCorpusIfAvailable(): Promise<void> {
  if (!corpusLoadPromise) {
    corpusLoadPromise = (async () => {
      try {
        const [dictRes, ngramRes] = await Promise.all([
          fetch("/corpus/dict_large.txt", { cache: "no-store" }),
          fetch("/corpus/ngram_large.jsonl", { cache: "no-store" })
        ]);
        if (!dictRes.ok || !ngramRes.ok) return;
        const [dictText, ngramText] = await Promise.all([dictRes.text(), ngramRes.text()]);
        const dict = parseLines(dictText);
        const ngram = parseLines(ngramText);
        if (dict.length === 0) return;
        engine.reset();
        engine.initDict(dict);
        engine.initNgram(ngram);
        currentCorpusSource = "public";
        currentCorpusDictSize = dict.length;
        currentCorpusNgramSize = ngram.length;
      } catch {
        // Keep fallback in-memory corpus when fetch is unavailable.
        currentCorpusSource = "fallback";
        currentCorpusDictSize = FALLBACK_DICT.length;
        currentCorpusNgramSize = FALLBACK_NGRAM.length;
      }
    })();
  }
  await corpusLoadPromise;
}

type Store = {
  committedBeforeCursor: string;
  preedit: string;
  suggestions: SuggestionItem[];
  selectedSuggestionIndex: number;
  sentenceSuggestions: SentenceSuggestion[];
  aiSuggestionType: AISuggestionType;
  selectedSentenceIndex: number;
  sentenceLoading: boolean;
  sentenceError: string | null;
  storylinePrompt: string;
  storylineOpen: boolean;
  ghostLeadText: string;
  ghostText: string;
  corpusSource: "fallback" | "public";
  corpusDictSize: number;
  corpusNgramSize: number;
  mode: "prefix" | "boundary" | "none";
  prefix: string;
  latencyMs: number;
  lastSuggestion: SuggestionItem | null;
  setCommitted: (t: string) => void;
  setPreedit: (t: string) => void;
  setStorylinePrompt: (t: string) => void;
  setStorylineOpen: (open: boolean) => void;
  cycleSuggestion: (dir: 1 | -1) => void;
  selectSuggestion: (index: number) => void;
  cycleSentenceSuggestion: (dir: 1 | -1) => void;
  selectSentenceSuggestion: (index: number) => void;
  requestSentenceSuggestions: (contextBeforeCursor: string, suggestionType?: AISuggestionType, variationHint?: string) => Promise<void>;
  bootstrap: () => void;
  requestSuggest: () => void;
  applySelectedSuggestion: (el: HTMLDivElement, caretOffset: number) => number | null;
  applySelectedSentence: (el: HTMLDivElement, caretOffset: number) => number | null;
};

function computeGhost(
  committedBeforeCursor: string,
  suggestions: SuggestionItem[],
  selectedSuggestionIndex: number
): { ghostLeadText: string; ghostText: string } {
  const item = suggestions[selectedSuggestionIndex];
  if (!item) {
    return { ghostLeadText: committedBeforeCursor, ghostText: "" };
  }
  const safeStart = Math.max(0, Math.min(item.replaceRange.start, committedBeforeCursor.length));
  return {
    ghostLeadText: committedBeforeCursor.slice(0, safeStart),
    ghostText: item.insertText
  };
}

function shouldAutoAppendPeriod(appliedText: string, afterCursor: string): boolean {
  const trimmed = appliedText.trim();
  if (!trimmed) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  if (afterCursor.length > 0 && !/^\s*$/.test(afterCursor)) return false;
  return /(다|요|죠|네|까|니다|습니다)$/.test(trimmed);
}

function normalizeOverlapToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/^[\s"'`“”‘’.,!?()[\]{}<>-]+/g, "")
    .replace(/[\s"'`“”‘’.,!?()[\]{}<>-]+$/g, "");
}

function dedupeOverlapPrefix(beforeCursor: string, paragraph: string): { text: string; overlap: number } {
  const beforeTrimmed = beforeCursor.trim();
  const paragraphTrimmed = paragraph.trim();
  const beforeTokens = beforeTrimmed.split(/\s+/).filter((x) => x.length > 0);
  const paraTokens = paragraphTrimmed.split(/\s+/).filter((x) => x.length > 0);
  if (beforeTokens.length === 0 || paraTokens.length === 0) return { text: paragraphTrimmed, overlap: 0 };

  const maxOverlap = Math.min(12, beforeTokens.length, paraTokens.length);
  for (let k = maxOverlap; k >= 1; k--) {
    let same = true;
    for (let i = 0; i < k; i++) {
      const a = normalizeOverlapToken(beforeTokens[beforeTokens.length - k + i]);
      const b = normalizeOverlapToken(paraTokens[i]);
      if (a !== b) {
        same = false;
        break;
      }
    }
    if (same) {
      const remaining = paraTokens.slice(k).join(" ").trim();
      return { text: remaining, overlap: k };
    }
  }

  // Fallback: char-level overlap for punctuation/spacing variants.
  // Example: "...좋은 마음에" + "좋은 마음에 그녀는 ..."
  const beforeNorm = beforeTrimmed.toLowerCase().replace(/\s+/g, " ");
  const paraNorm = paragraphTrimmed.toLowerCase().replace(/\s+/g, " ");
  const maxCharOverlap = Math.min(60, beforeNorm.length, paraNorm.length);
  for (let n = maxCharOverlap; n >= 3; n--) {
    const suffix = beforeNorm.slice(-n);
    if (paraNorm.startsWith(suffix)) {
      const drop = paragraphTrimmed.slice(0, n).trim();
      if (drop.length > 0) {
        return { text: paragraphTrimmed.slice(n).trim(), overlap: 1 };
      }
    }
  }

  return { text: paragraphTrimmed, overlap: 0 };
}

export const useEngineStore = create<Store>((set, get) => ({
  committedBeforeCursor: "",
  preedit: "",
  suggestions: [],
  selectedSuggestionIndex: 0,
  sentenceSuggestions: [],
  aiSuggestionType: "paragraph",
  selectedSentenceIndex: 0,
  sentenceLoading: false,
  sentenceError: null,
  storylinePrompt: "",
  storylineOpen: false,
  ghostLeadText: "",
  ghostText: "",
  corpusSource: "fallback",
  corpusDictSize: FALLBACK_DICT.length,
  corpusNgramSize: FALLBACK_NGRAM.length,
  mode: "none",
  prefix: "",
  latencyMs: 0,
  lastSuggestion: null,
  setCommitted: (t) => set({ committedBeforeCursor: t }),
  setPreedit: (t) => set({ preedit: t }),
  setStorylinePrompt: (t) => {
    const next = t.trim();
    set({ storylinePrompt: next });
    if (typeof window !== "undefined") {
      try {
        if (next) {
          window.localStorage.setItem("typing-assistant.storylinePrompt", next);
        } else {
          window.localStorage.removeItem("typing-assistant.storylinePrompt");
        }
      } catch {
        // Ignore localStorage failures.
      }
    }
  },
  setStorylineOpen: (open) => set({ storylineOpen: open }),
  cycleSuggestion: (dir) => {
    const s = get();
    if (s.suggestions.length <= 1) return;
    const len = s.suggestions.length;
    const nextIndex = (s.selectedSuggestionIndex + dir + len) % len;
    const ghost = computeGhost(s.committedBeforeCursor, s.suggestions, nextIndex);
    set({
      selectedSuggestionIndex: nextIndex,
      ghostLeadText: ghost.ghostLeadText,
      ghostText: ghost.ghostText
    });
  },
  selectSuggestion: (index) => {
    const s = get();
    if (s.suggestions.length === 0) return;
    const nextIndex = Math.max(0, Math.min(index, s.suggestions.length - 1));
    const ghost = computeGhost(s.committedBeforeCursor, s.suggestions, nextIndex);
    set({
      selectedSuggestionIndex: nextIndex,
      ghostLeadText: ghost.ghostLeadText,
      ghostText: ghost.ghostText
    });
  },
  cycleSentenceSuggestion: (dir) => {
    const s = get();
    if (s.sentenceSuggestions.length <= 1) return;
    const len = s.sentenceSuggestions.length;
    const nextIndex = (s.selectedSentenceIndex + dir + len) % len;
    set({ selectedSentenceIndex: nextIndex });
  },
  selectSentenceSuggestion: (index) => {
    const s = get();
    if (s.sentenceSuggestions.length === 0) return;
    const nextIndex = Math.max(0, Math.min(index, s.sentenceSuggestions.length - 1));
    set({ selectedSentenceIndex: nextIndex });
  },
  requestSentenceSuggestions: async (contextBeforeCursor, suggestionType = "paragraph", variationHint) => {
    const trimmedContext = contextBeforeCursor.trim();
    const storylinePrompt = get().storylinePrompt.trim();
    const effectiveContext = trimmedContext || storylinePrompt;
    if (!effectiveContext) {
      set({
        sentenceSuggestions: [],
        selectedSentenceIndex: 0,
        sentenceLoading: false,
        sentenceError: "커서 앞 문맥 또는 스토리라인을 먼저 입력해 주세요."
      });
      return;
    }
    set({ sentenceLoading: true, sentenceError: null });
    try {
      const res = await fetch("/api/sentence-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextBeforeCursor: effectiveContext,
          maxCandidates: 5,
          variationHint,
          suggestionType,
          storylinePrompt
        })
      });
      const data = (await res.json()) as { items?: SentenceSuggestion[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `sentence suggest failed: ${res.status}`);
      const items = Array.isArray(data.items) ? data.items : [];
      set({
        sentenceSuggestions: items.slice(0, 5),
        aiSuggestionType: suggestionType,
        selectedSentenceIndex: 0,
        sentenceLoading: false,
        sentenceError: null
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      set({ sentenceSuggestions: [], selectedSentenceIndex: 0, sentenceLoading: false, sentenceError: message });
    }
  },
  bootstrap: () => {
    if (typeof window !== "undefined") {
      try {
        const savedStorylinePrompt = window.localStorage.getItem("typing-assistant.storylinePrompt") ?? "";
        if (savedStorylinePrompt.trim().length > 0) {
          set({ storylinePrompt: savedStorylinePrompt.trim() });
        }
      } catch {
        // Ignore localStorage failures.
      }
    }
    void loadCorpusIfAvailable().then(() => {
      get().requestSuggest();
    });
  },
  requestSuggest: () => {
    void loadCorpusIfAvailable();
    const s = get();
    const out = engine.suggest({ committedBeforeCursor: s.committedBeforeCursor, preedit: s.preedit });
    const selectedSuggestionIndex = 0;
    const ghost = computeGhost(s.committedBeforeCursor, out.items, selectedSuggestionIndex);
    set({
      suggestions: out.items,
      selectedSuggestionIndex,
      ghostLeadText: ghost.ghostLeadText,
      ghostText: ghost.ghostText,
      mode: out.mode,
      prefix: out.prefix,
      latencyMs: out.latencyMs,
      corpusSource: currentCorpusSource,
      corpusDictSize: currentCorpusDictSize,
      corpusNgramSize: currentCorpusNgramSize
    });
  },
  applySelectedSuggestion: (el, caretOffset) => {
    void loadCorpusIfAvailable();
    const s = get();
    const fullText = el.textContent ?? "";
    const safeCaret = Math.max(0, Math.min(caretOffset, fullText.length));
    const beforeCursor = fullText.slice(0, safeCaret);
    const afterCursor = fullText.slice(safeCaret);
    const out = engine.suggest({ committedBeforeCursor: beforeCursor, preedit: s.preedit });
    const item = out.items[s.selectedSuggestionIndex] ?? out.items[0];
    if (!item) return null;
    const nextBeforeRaw =
      beforeCursor.slice(0, item.replaceRange.start) +
      item.insertText +
      beforeCursor.slice(item.replaceRange.end);
    const nextBeforeWithPeriod = shouldAutoAppendPeriod(nextBeforeRaw, afterCursor) ? `${nextBeforeRaw}.` : nextBeforeRaw;
    const shouldAppendSpace =
      nextBeforeWithPeriod.length > 0 && !/\s$/.test(nextBeforeWithPeriod) && !/^\s/.test(afterCursor);
    const nextBefore = shouldAppendSpace ? `${nextBeforeWithPeriod} ` : nextBeforeWithPeriod;
    const next = nextBefore + afterCursor;
    el.textContent = next;
    engine.accept(item);
    set({ committedBeforeCursor: nextBefore, preedit: "", lastSuggestion: item, selectedSuggestionIndex: 0 });
    return nextBefore.length;
  },
  applySelectedSentence: (el, caretOffset) => {
    const s = get();
    const item = s.sentenceSuggestions[s.selectedSentenceIndex];
    if (!item) return null;
    const fullText = el.textContent ?? "";
    const safeCaret = Math.max(0, Math.min(caretOffset, fullText.length));
    const beforeCursor = fullText.slice(0, safeCaret);
    const afterCursor = fullText.slice(safeCaret);
    const rawParagraph = item.text.trim();
    const deduped = dedupeOverlapPrefix(beforeCursor, rawParagraph);
    const paragraph = deduped.text.length > 0 ? deduped.text : rawParagraph;
    const needsInlineSpace = beforeCursor.length > 0 && !/\s$/.test(beforeCursor);
    const inserted = `${needsInlineSpace ? " " : ""}${paragraph}`;
    const nextBefore = beforeCursor + inserted;
    const next = nextBefore + afterCursor;
    el.textContent = next;
    set({ committedBeforeCursor: nextBefore, preedit: "" });
    return nextBefore.length;
  }
}));
