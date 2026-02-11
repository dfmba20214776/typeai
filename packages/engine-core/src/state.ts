export type TextState = {
  committedBeforeCursor: string;
  preedit: string;
};

export function normalizeState(input: TextState): TextState {
  return {
    committedBeforeCursor: input.committedBeforeCursor ?? "",
    preedit: input.preedit ?? ""
  };
}
