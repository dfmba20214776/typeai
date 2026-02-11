export type TokenizeResult = {
  tokens: string[];
  lastToken: string;
  boundary: boolean;
};

const wordRe = (() => {
  try {
    return new RegExp("[\\p{L}\\p{N}_]+", "gu");
  } catch {
    // Fallback for environments without Unicode property escape support.
    return /[A-Za-z0-9_]+/g;
  }
})();

export function tokenize(committed: string, preedit: string): TokenizeResult {
  const full = (committed + preedit).replace(/\u200B/g, "");
  const tokens = full.match(wordRe) ?? [];
  const boundary = full.length === 0 ? false : /\s$/.test(full);
  const lastToken = tokens.length ? tokens[tokens.length - 1] : "";
  return { tokens, lastToken, boundary };
}
