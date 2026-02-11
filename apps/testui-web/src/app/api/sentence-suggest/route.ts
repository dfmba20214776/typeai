import { NextResponse } from "next/server";

type SentenceSuggestRequest = {
  contextBeforeCursor?: string;
  maxCandidates?: number;
  variationHint?: string;
};

function parseCandidates(raw: string, maxCandidates: number): string[] {
  const text = raw.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as { candidates?: unknown };
    if (Array.isArray(parsed.candidates)) {
      return parsed.candidates
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter((x) => x.length > 0)
        .slice(0, maxCandidates);
    }
  } catch {
    // Fall through to line parsing.
  }

  return text
    .split(/\r?\n/g)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, maxCandidates);
}

function extractResponseText(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const obj = json as Record<string, unknown>;
  if (typeof obj.output_text === "string" && obj.output_text.trim().length > 0) {
    return obj.output_text;
  }

  const output = obj.output;
  if (!Array.isArray(output)) return "";
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const partObj = part as Record<string, unknown>;
      if (typeof partObj.text === "string" && partObj.text.trim()) {
        chunks.push(partObj.text);
      }
    }
  }
  return chunks.join("\n");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SentenceSuggestRequest;
    const context = (body.contextBeforeCursor ?? "").trim();
    const maxCandidates = Math.max(1, Math.min(5, Number(body.maxCandidates) || 5));
    const variationHint = (body.variationHint ?? "").trim();
    if (!context) return NextResponse.json({ items: [] });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ items: [], error: "missing_openai_api_key" }, { status: 500 });
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    const promptContext = context.slice(-1200);
    const system = "You are a Korean fiction writing assistant that suggests natural next-sentence candidates.";
    const user = [
      "Generate 5 Korean next-sentence candidates from the context below.",
      "Rules:",
      "- Keep viewpoint, tone, and narrative continuity",
      "- Allow mild variation only, avoid unrelated jumps",
      "- Produce subtle nuance differences between candidates",
      "- Each candidate must be a single sentence",
      "- Output JSON only: {\"candidates\":[\"...\",\"...\",\"...\",\"...\",\"...\"]}",
      variationHint ? `- Variation hint: ${variationHint}` : "",
      "",
      "[Context]",
      promptContext
    ].join("\n");

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: [{ type: "input_text", text: user }] }
        ],
        max_output_tokens: 400
      })
    });

    if (!openaiRes.ok) {
      return NextResponse.json({ items: [], error: `openai_http_${openaiRes.status}` }, { status: 502 });
    }
    const json = (await openaiRes.json()) as unknown;
    const outputText = extractResponseText(json);
    const candidates = parseCandidates(outputText, maxCandidates);
    const items = candidates.map((text, i) => ({ id: `llm-${i + 1}`, text, source: "llm" as const }));
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [], error: "sentence_suggest_exception" }, { status: 500 });
  }
}
