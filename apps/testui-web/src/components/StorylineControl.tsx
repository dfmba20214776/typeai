"use client";

import { useEffect, useState } from "react";
import { useEngineStore } from "../state";
import { buildAiPrompt } from "../lib/aiPrompt";

export default function StorylineControl() {
  const {
    storylinePrompt,
    storylineOpen,
    setStorylinePrompt,
    setStorylineOpen,
    committedBeforeCursor,
    aiSuggestionType
  } = useEngineStore();
  const [draft, setDraft] = useState(storylinePrompt);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState("");

  useEffect(() => {
    if (storylineOpen) {
      setDraft(storylinePrompt);
    }
  }, [storylineOpen, storylinePrompt]);

  return (
    <div className="storyline-wrap">
      <div className="storyline-top">
        <div className="storyline-buttons">
          <button
            type="button"
            className={`regen-btn ${storylineOpen ? "regen-btn-active" : ""}`}
            onClick={() => {
              const next = !storylineOpen;
              setStorylineOpen(next);
              if (next) setPreviewOpen(false);
            }}
          >
            스토리라인
          </button>
          <button
            type="button"
            className={`regen-btn ${previewOpen ? "regen-btn-active" : ""}`}
            onClick={() => {
              const next = !previewOpen;
              if (next) setStorylineOpen(false);
              if (!previewOpen) {
                const built = buildAiPrompt({
                  contextBeforeCursor: committedBeforeCursor,
                  suggestionType: aiSuggestionType,
                  storylinePrompt
                });
                setPreviewSnapshot(`[System]\n${built.system}\n\n[User]\n${built.user}`);
              }
              setPreviewOpen(next);
            }}
          >
            프롬프트 미리보기
          </button>
        </div>
        <div className="storyline-guide" aria-label="기능 안내">
          <span><code>{"`"}</code> 다음 단어 후보 순환</span>
          <span><code>Tab</code> 현재 단어 추천 확정</span>
          <span><code>-</code> 줄 시작은 작성 의도</span>
        </div>
      </div>

      {storylineOpen ? (
        <div className="storyline-popover">
          <div className="storyline-popover-head">
            <label htmlFor="storyline-input">추천용 고정 프롬프트</label>
            <button type="button" className="regen-btn" onClick={() => setStorylineOpen(false)}>
              닫기
            </button>
          </div>
          <textarea
            id="storyline-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="예: 1인칭 시점, 잔잔한 감정선, 겨울 바다 배경"
            rows={5}
          />
          <div className="storyline-actions">
            <button
              type="button"
              className="regen-btn"
              onClick={() => {
                setStorylinePrompt("");
                setDraft("");
              }}
            >
              초기화
            </button>
            <button
              type="button"
              className="regen-btn regen-btn-active"
              onClick={() => {
                setStorylinePrompt(draft);
                setStorylineOpen(false);
              }}
            >
              저장
            </button>
          </div>
        </div>
      ) : null}

      {previewOpen ? (
        <div className="storyline-popover preview-popover">
          <div className="storyline-popover-head">
            <label htmlFor="prompt-preview-input">현재 시점 전체 입력 프롬프트</label>
            <button type="button" className="regen-btn" onClick={() => setPreviewOpen(false)}>
              닫기
            </button>
          </div>
          <textarea id="prompt-preview-input" value={previewSnapshot} readOnly rows={12} />
        </div>
      ) : null}
    </div>
  );
}
