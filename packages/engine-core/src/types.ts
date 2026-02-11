export type SuggestionType = "complete_word" | "next_word";

export type SuggestionSource = "dict" | "ngram" | "mru";

export type ReplaceRange = {
  start: number; // absolute offset in committed text
  end: number;   // absolute offset in committed text
};

export type EngineInput = {
  committedBeforeCursor: string;
  preedit: string;
};

export type SuggestionItem = {
  id: string;
  type: SuggestionType;
  source: SuggestionSource;
  displayText: string;
  insertText: string;
  replaceRange: ReplaceRange;
  score: number;
};

export type EngineOutput = {
  items: SuggestionItem[];
  mode: "prefix" | "boundary" | "none";
  latencyMs: number;
  prefix: string;
};
