"use client";

import { useEngineStore } from "../state";

export default function DebugPanel() {
  const {
    committedBeforeCursor,
    preedit,
    mode,
    prefix,
    latencyMs,
    lastSuggestion,
    suggestions,
    corpusSource,
    corpusDictSize,
    corpusNgramSize,
    selectedSuggestionIndex,
    sentenceSuggestions,
    selectedSentenceIndex,
    sentenceLoading,
    sentenceError
  } = useEngineStore();
  return (
    <div className="panel debug-panel" data-testid="debug-panel">
      <h3>Debug</h3>
      <div>corpus: {corpusSource}</div>
      <div>dict size: {corpusDictSize}</div>
      <div>ngram size: {corpusNgramSize}</div>
      <div>selected idx: {selectedSuggestionIndex}</div>
      <div>selected sentence idx: {selectedSentenceIndex}</div>
      <div>committed: {committedBeforeCursor}</div>
      <div>preedit: {preedit}</div>
      <div>mode: {mode}</div>
      <div>prefix: {prefix}</div>
      <div>suggestions: {suggestions.length}</div>
      <div>sentence suggestions: {sentenceSuggestions.length}</div>
      <div>sentence loading: {sentenceLoading ? "yes" : "no"}</div>
      <div>sentence error: {sentenceError ?? "none"}</div>
      <div>latency: {latencyMs.toFixed(2)} ms</div>
      <div>last: {lastSuggestion ? `${lastSuggestion.replaceRange.start}-${lastSuggestion.replaceRange.end} ${lastSuggestion.insertText}` : "none"}</div>
    </div>
  );
}
