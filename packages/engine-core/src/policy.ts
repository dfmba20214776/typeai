import type { SuggestionType } from "./types";

export function decideMode(boundary: boolean): "prefix" | "boundary" | "none" {
  if (boundary) return "boundary";
  return "prefix";
}

export function allowedTypes(mode: "prefix" | "boundary"): SuggestionType[] {
  return mode === "prefix" ? ["complete_word"] : ["next_word"];
}
