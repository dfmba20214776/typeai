export function extractTextState(el: HTMLElement) {
  return { committedBeforeCursor: el.innerText ?? "", preedit: "" };
}
