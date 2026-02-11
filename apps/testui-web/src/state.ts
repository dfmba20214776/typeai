"use client";

import { create } from "zustand";
import { Engine } from "@lab/engine-core/src/engine";
import type { SuggestionItem } from "@lab/engine-core/src/types";

export type SentenceSuggestion = {
  id: string;
  text: string;
  source: "llm";
};

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
  selectedSentenceIndex: number;
  sentenceLoading: boolean;
  sentenceError: string | null;
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
  cycleSuggestion: (dir: 1 | -1) => void;
  selectSuggestion: (index: number) => void;
  cycleSentenceSuggestion: (dir: 1 | -1) => void;
  selectSentenceSuggestion: (index: number) => void;
  requestSentenceSuggestions: (contextBeforeCursor: string, variationHint?: string) => Promise<void>;
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

export const useEngineStore = create<Store>((set, get) => ({
  committedBeforeCursor: "",
  preedit: "",
  suggestions: [],
  selectedSuggestionIndex: 0,
  sentenceSuggestions: [],
  selectedSentenceIndex: 0,
  sentenceLoading: false,
  sentenceError: null,
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
  requestSentenceSuggestions: async (contextBeforeCursor, variationHint) => {
    const trimmedContext = contextBeforeCursor.trim();
    if (!trimmedContext) {
      set({ sentenceSuggestions: [], selectedSentenceIndex: 0, sentenceLoading: false, sentenceError: null });
      return;
    }
    set({ sentenceLoading: true, sentenceError: null });
    try {
      const res = await fetch("/api/sentence-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contextBeforeCursor: trimmedContext, maxCandidates: 5, variationHint })
      });
      const data = (await res.json()) as { items?: SentenceSuggestion[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `sentence suggest failed: ${res.status}`);
      const items = Array.isArray(data.items) ? data.items : [];
      set({
        sentenceSuggestions: items.slice(0, 5),
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
    const needsPrefixSpace = beforeCursor.length > 0 && !/\s$/.test(beforeCursor);
    const sentence = item.text.trim();
    const inserted = `${needsPrefixSpace ? " " : ""}${sentence}`;
    const nextBefore = beforeCursor + inserted;
    const next = nextBefore + afterCursor;
    el.textContent = next;
    set({ committedBeforeCursor: nextBefore, preedit: "" });
    return nextBefore.length;
  }
}));
