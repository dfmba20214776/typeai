"use client";

import { useEngineStore } from "../state";

export default function SentenceSuggestionsPanel() {
  const {
    sentenceSuggestions,
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
        <h3>Sentence Suggestions (5)</h3>
        <button
          type="button"
          className="regen-btn"
          disabled={sentenceLoading}
          onClick={() => {
            const hint = `regen-${Date.now()}`;
            void requestSentenceSuggestions(committedBeforeCursor, hint);
          }}
        >
          다시 추천
        </button>
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
