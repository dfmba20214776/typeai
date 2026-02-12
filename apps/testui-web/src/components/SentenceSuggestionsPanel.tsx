"use client";

import { useEngineStore } from "../state";

export default function SentenceSuggestionsPanel() {
  const {
    sentenceSuggestions,
    aiSuggestionType,
    selectedSentenceIndex,
    selectSentenceSuggestion,
    sentenceLoading,
    sentenceError,
    committedBeforeCursor,
    requestSentenceSuggestions
  } = useEngineStore();

  return (
    <div className="panel sentence-panel">
      <div className="sentence-header">
        <h3>AI Suggestions (5)</h3>
        <div className="sentence-actions">
          <button
            type="button"
            className={`regen-btn ${aiSuggestionType === "sentence" ? "regen-btn-active" : ""}`}
            disabled={sentenceLoading}
            onClick={() => {
              const hint = `regen-sentence-${Date.now()}`;
              void requestSentenceSuggestions(committedBeforeCursor, "sentence", hint);
            }}
          >
            문장 추천
          </button>
          <button
            type="button"
            className={`regen-btn ${aiSuggestionType === "paragraph" ? "regen-btn-active" : ""}`}
            disabled={sentenceLoading}
            onClick={() => {
              const hint = `regen-paragraph-${Date.now()}`;
              void requestSentenceSuggestions(committedBeforeCursor, "paragraph", hint);
            }}
          >
            문단 추천
          </button>
        </div>
      </div>
      {sentenceLoading ? <div>loading...</div> : null}
      {sentenceError ? <div className="sentence-error">{sentenceError}</div> : null}
      <ol>
        {sentenceSuggestions.map((s, i) => (
          <li
            key={s.id}
            className={i === selectedSentenceIndex ? "suggestion-active" : ""}
            onMouseDown={(e) => {
              e.preventDefault();
              selectSentenceSuggestion(i);
            }}
            onDoubleClick={() => {
              window.dispatchEvent(new CustomEvent<number>("apply-sentence-suggestion", { detail: i }));
            }}
          >
            {s.text} ({s.source})
          </li>
        ))}
      </ol>
    </div>
  );
}
