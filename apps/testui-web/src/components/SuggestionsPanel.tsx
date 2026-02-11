"use client";

import { useEngineStore } from "../state";

export default function SuggestionsPanel() {
  const { suggestions, selectedSuggestionIndex, selectSuggestion } = useEngineStore();
  return (
    <div className="panel">
      <h3>Word Suggestions</h3>
      <ol>
        {suggestions.map((s, i) => (
          <li
            key={s.id}
            className={i === selectedSuggestionIndex ? "suggestion-active" : ""}
            onMouseDown={(e) => {
              e.preventDefault();
              selectSuggestion(i);
            }}
          >
            {s.displayText} ({s.type}/{s.source})
          </li>
        ))}
      </ol>
    </div>
  );
}
