export type AISuggestionType = "sentence" | "paragraph";

export type BuildPromptInput = {
  contextBeforeCursor: string;
  suggestionType: AISuggestionType;
  storylinePrompt?: string;
  variationHint?: string;
};

export function splitIntentDirectives(context: string): { cleanContext: string; intentDirectives: string[] } {
  const lines = context.replace(/\r\n/g, "\n").split("\n");
  const intentDirectives: string[] = [];
  const bodyLines: string[] = [];
  const inlineIntentEndMarkers = ["좋겠어", "원해", "해줘", "바란다", "원한다"];

  for (const line of lines) {
    const m = line.match(/^\s*-\s*(.+)\s*$/);
    if (m && m[1]) {
      intentDirectives.push(m[1].trim());
      continue;
    }

    // Inline intent support:
    // "오늘밤 나는 ... -저녁에 ... 좋겠어 오늘도 ..."
    // -> intent: "저녁에 ... 좋겠어", body keeps before/after text.
    const hyphenPos = line.indexOf("-");
    if (hyphenPos > 0) {
      const after = line.slice(hyphenPos + 1).trim();
      const marker = inlineIntentEndMarkers
        .map((k) => ({ k, idx: after.indexOf(k) }))
        .filter((x) => x.idx >= 0)
        .sort((a, b) => a.idx - b.idx)[0];

      if (marker) {
        const intentEnd = marker.idx + marker.k.length;
        const intent = after.slice(0, intentEnd).trim();
        const before = line.slice(0, hyphenPos).trim();
        const remain = after.slice(intentEnd).trim();
        if (intent.length > 0) intentDirectives.push(intent);
        const rebuilt = [before, remain].filter((x) => x.length > 0).join(" ");
        if (rebuilt.length > 0) bodyLines.push(rebuilt);
        continue;
      }
    }

    bodyLines.push(line);
  }

  const cleanContext = bodyLines.join("\n").trim();
  return { cleanContext, intentDirectives: intentDirectives.slice(0, 10) };
}

export function extractLeadPrefix(context: string): string {
  const normalized = context.replace(/\r\n/g, "\n");
  const trimmed = normalized.trimEnd();
  if (!trimmed) return "";

  const sentenceStart = Math.max(
    trimmed.lastIndexOf("."),
    trimmed.lastIndexOf("!"),
    trimmed.lastIndexOf("?"),
    trimmed.lastIndexOf("\n")
  );
  const fragment = sentenceStart >= 0 ? trimmed.slice(sentenceStart + 1) : trimmed;
  return fragment.replace(/\s+/g, " ").trim();
}

export function buildAiPrompt(input: BuildPromptInput): {
  system: string;
  user: string;
  leadPrefix: string;
  promptContext: string;
  intentDirectives: string[];
} {
  const suggestionType = input.suggestionType;
  const rawContext = (input.contextBeforeCursor ?? "").trim();
  const parsed = splitIntentDirectives(rawContext);
  const promptContext = parsed.cleanContext.slice(-1800);
  const intentDirectives = parsed.intentDirectives;
  const variationHint = (input.variationHint ?? "").trim();
  const storylinePrompt = (input.storylinePrompt ?? "").trim();
  const leadPrefix = extractLeadPrefix(promptContext);

  const system =
    suggestionType === "sentence"
      ? "You are a Korean fiction writing assistant that suggests natural next-sentence candidates."
      : "You are a Korean fiction writing assistant that suggests natural next-paragraph candidates.";

  const user = [
    suggestionType === "sentence"
      ? "Generate 5 Korean next-sentence candidates from the context below."
      : "Generate 5 Korean next-paragraph candidates from the context below.",
    "Rules:",
    "- Intent directives are mandatory constraints, not optional hints",
    "- Keep viewpoint, tone, and narrative continuity",
    "- Allow mild variation only, avoid unrelated jumps",
    "- Produce subtle nuance differences between candidates",
    "- Treat intent directives as hidden guidance only; never output them verbatim",
    "- Each candidate must satisfy all intent directives semantically",
    "- Do not skip explicit action/emotion/relationship directives",
    storylinePrompt ? "- Follow the fixed storyline prompt as a strong guide." : "",
    suggestionType === "sentence"
      ? "- Each candidate must be a single sentence"
      : "- Each candidate must be one paragraph (2-4 sentences)",
    leadPrefix
      ? suggestionType === "sentence"
        ? `- Every sentence MUST start with this exact lead phrase: "${leadPrefix}"`
        : `- Every paragraph MUST start with this exact lead phrase: "${leadPrefix}"`
      : "",
    suggestionType === "sentence"
      ? "- Output JSON only: {\"candidates\":[\"...\",\"...\",\"...\",\"...\",\"...\"]}"
      : "- Output JSON only: {\"paragraphs\":[\"...\",\"...\",\"...\",\"...\",\"...\"]}",
    variationHint ? `- Variation hint: ${variationHint}` : "",
    intentDirectives.length > 0 ? "[Intent Directives (hidden)]" : "",
    ...intentDirectives,
    intentDirectives.length > 0 ? "- Before finalizing, verify every candidate matches all directives" : "",
    storylinePrompt ? "[Fixed Storyline Prompt]" : "",
    storylinePrompt || "",
    "",
    "[Context]",
    promptContext
  ]
    .filter((x) => x.length > 0)
    .join("\n");

  return { system, user, leadPrefix, promptContext, intentDirectives };
}
