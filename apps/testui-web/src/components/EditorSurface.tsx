"use client";

import { useEffect, useRef } from "react";
import { useEngineStore } from "../state";

function getCaretTextOffset(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return (root.textContent ?? "").length;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.endContainer)) return (root.textContent ?? "").length;
  const preRange = range.cloneRange();
  preRange.selectNodeContents(root);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}

function placeCaretAtTextOffset(root: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  let remaining = offset;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const text = node.textContent ?? "";
    if (remaining <= text.length) {
      range.setStart(node, Math.max(0, remaining));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      root.focus();
      return;
    }
    remaining -= text.length;
    node = walker.nextNode();
  }

  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  root.focus();
}

function ensureCaretVisible(root: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.endContainer)) return;

  const caretRange = range.cloneRange();
  caretRange.collapse(true);
  let caretRect = caretRange.getBoundingClientRect();

  // If collapsed range has no box, insert a temporary marker.
  if (caretRect.width === 0 && caretRect.height === 0) {
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    marker.style.position = "relative";
    marker.style.display = "inline-block";
    caretRange.insertNode(marker);
    caretRect = marker.getBoundingClientRect();
    marker.parentNode?.removeChild(marker);
  }

  const rootRect = root.getBoundingClientRect();
  const topPadding = 24;
  const bottomPadding = 24;

  if (caretRect.top < rootRect.top + topPadding) {
    root.scrollTop -= rootRect.top + topPadding - caretRect.top;
  } else if (caretRect.bottom > rootRect.bottom - bottomPadding) {
    root.scrollTop += caretRect.bottom - (rootRect.bottom - bottomPadding);
  }
}

function splitCommittedAndPreedit(textBeforeCaret: string, preedit: string): string {
  if (!preedit) return textBeforeCaret;
  if (textBeforeCaret.endsWith(preedit)) {
    return textBeforeCaret.slice(0, textBeforeCaret.length - preedit.length);
  }
  return textBeforeCaret;
}

function insertTextAtCaret(root: HTMLElement, text: string): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return;
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export default function EditorSurface() {
  const ref = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const preeditRef = useRef("");
  const spaceAcceptArmedRef = useRef(false);
  const {
    setCommitted,
    setPreedit,
    requestSuggest,
    applySelectedSuggestion,
    cycleSuggestion,
    bootstrap,
    cycleSentenceSuggestion,
    applySelectedSentence,
    selectSentenceSuggestion
  } = useEngineStore();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const syncCommittedThenSuggest = () => {
      spaceAcceptArmedRef.current = false;
      const text = el.textContent ?? "";
      const caret = getCaretTextOffset(el);
      setCommitted(text.slice(0, Math.max(0, Math.min(caret, text.length))));
      setPreedit(preeditRef.current);
      queueMicrotask(() => requestSuggest());
      requestAnimationFrame(() => ensureCaretVisible(el));
    };

    const syncFromCaretMove = () => {
      const text = el.textContent ?? "";
      const caret = getCaretTextOffset(el);
      setCommitted(text.slice(0, Math.max(0, Math.min(caret, text.length))));
      setPreedit(preeditRef.current);
      queueMicrotask(() => requestSuggest());
      requestAnimationFrame(() => ensureCaretVisible(el));
    };

    const syncComposingThenSuggest = (data?: string | null) => {
      spaceAcceptArmedRef.current = false;
      if (typeof data === "string") preeditRef.current = data;
      const text = el.textContent ?? "";
      const caret = getCaretTextOffset(el);
      const textBeforeCaret = text.slice(0, Math.max(0, Math.min(caret, text.length)));
      // In contenteditable, composing text can already be included in DOM.
      // Keep committed text separate from preedit to avoid duplicated prefix.
      setCommitted(splitCommittedAndPreedit(textBeforeCaret, preeditRef.current));
      setPreedit(preeditRef.current);
      queueMicrotask(() => requestSuggest());
      requestAnimationFrame(() => ensureCaretVisible(el));
    };

    const onBeforeInput = (e: InputEvent) => {
      if (composingRef.current || e.isComposing || e.inputType.includes("Composition")) {
        syncComposingThenSuggest(e.data);
        return;
      }
      syncCommittedThenSuggest();
    };

    const onInput = () => {
      if (composingRef.current) {
        syncComposingThenSuggest();
        return;
      }
      syncCommittedThenSuggest();
    };

    const onCompositionStart = (e: CompositionEvent) => {
      composingRef.current = true;
      preeditRef.current = e.data ?? "";
      syncComposingThenSuggest(e.data);
    };

    const onCompositionUpdate = (e: CompositionEvent) => {
      composingRef.current = true;
      syncComposingThenSuggest(e.data);
    };

    const onCompositionEnd = () => {
      composingRef.current = false;
      preeditRef.current = "";
      setPreedit("");
      syncCommittedThenSuggest();
    };

    const onFocus = () => {
      syncCommittedThenSuggest();
    };

    const onMouseUp = () => {
      syncFromCaretMove();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (composingRef.current) return;
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "Home" ||
        e.key === "End"
      ) {
        syncFromCaretMove();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (composingRef.current) return;
      const acceptSuggestion = () => {
        const nextCaret = applySelectedSuggestion(el, getCaretTextOffset(el));
        if (nextCaret === null) return false;
        queueMicrotask(() => {
          placeCaretAtTextOffset(el, nextCaret);
          syncCommittedThenSuggest();
        });
        return true;
      };
      const applyCurrentSentence = () => {
        const nextCaret = applySelectedSentence(el, getCaretTextOffset(el));
        if (nextCaret !== null) {
          queueMicrotask(() => {
            placeCaretAtTextOffset(el, nextCaret);
            syncCommittedThenSuggest();
          });
        }
      };
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        applyCurrentSentence();
        return;
      }
      if (e.key === "`") {
        e.preventDefault();
        cycleSuggestion(1);
        spaceAcceptArmedRef.current = true;
        return;
      }
      if (e.key === "\\" || e.code === "Backslash") {
        e.preventDefault();
        cycleSentenceSuggestion(1);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        acceptSuggestion();
        spaceAcceptArmedRef.current = false;
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (spaceAcceptArmedRef.current) {
          const applied = acceptSuggestion();
          if (applied) {
            spaceAcceptArmedRef.current = false;
            return;
          }
        }
        insertTextAtCaret(el, "\n");
        syncCommittedThenSuggest();
        return;
      }
      if (e.key === " " || e.code === "Space") {
        if (!spaceAcceptArmedRef.current) return;
        const applied = acceptSuggestion();
        if (applied) {
          e.preventDefault();
          spaceAcceptArmedRef.current = false;
        }
      }
    };

    const onApplySentenceSuggestion = (evt: Event) => {
      const custom = evt as CustomEvent<number>;
      if (typeof custom.detail === "number") {
        selectSentenceSuggestion(custom.detail);
      }
      queueMicrotask(() => {
        const nextCaret = applySelectedSentence(el, getCaretTextOffset(el));
        if (nextCaret !== null) {
          placeCaretAtTextOffset(el, nextCaret);
          syncCommittedThenSuggest();
        }
      });
    };

    el.addEventListener("beforeinput", onBeforeInput);
    el.addEventListener("input", onInput);
    el.addEventListener("compositionstart", onCompositionStart);
    el.addEventListener("compositionupdate", onCompositionUpdate);
    el.addEventListener("compositionend", onCompositionEnd);
    el.addEventListener("focus", onFocus);
    el.addEventListener("mouseup", onMouseUp);
    el.addEventListener("keyup", onKeyUp);
    el.addEventListener("keydown", onKeyDown);
    window.addEventListener("apply-sentence-suggestion", onApplySentenceSuggestion as EventListener);
    bootstrap();
    syncCommittedThenSuggest();

    return () => {
      el.removeEventListener("beforeinput", onBeforeInput);
      el.removeEventListener("input", onInput);
      el.removeEventListener("compositionstart", onCompositionStart);
      el.removeEventListener("compositionupdate", onCompositionUpdate);
      el.removeEventListener("compositionend", onCompositionEnd);
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("keyup", onKeyUp);
      el.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("apply-sentence-suggestion", onApplySentenceSuggestion as EventListener);
    };
  }, [
    setCommitted,
    setPreedit,
    requestSuggest,
    applySelectedSuggestion,
    cycleSuggestion,
    bootstrap,
    cycleSentenceSuggestion,
    applySelectedSentence,
    selectSentenceSuggestion
  ]);

  return <div ref={ref} className="editor" contentEditable suppressContentEditableWarning />;
}
