import type { SuggestionItem } from "@lab/engine-core/src/types";

export function applySuggestionToElement(el: HTMLElement, item: SuggestionItem) {
  const text = el.innerText ?? "";
  const next = text.slice(0, item.replaceRange.start) + item.insertText + text.slice(item.replaceRange.end);
  el.innerText = next;
}
