import { NextResponse } from "next/server";
import { buildAiPrompt } from "../../../lib/aiPrompt";

type SentenceSuggestRequest = {
  contextBeforeCursor?: string;
  maxCandidates?: number;
  variationHint?: string;
  suggestionType?: "sentence" | "paragraph";
  storylinePrompt?: string;
};

function startsWithPrefix(text: string, prefix: string): boolean {
  if (!prefix) return true;
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/^[\s"'\-.,!?]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return normalize(text).startsWith(normalize(prefix));
}

function forcePrefix(text: string, prefix: string): string {
  const t = text.trim();
  if (!prefix) return t;
  if (startsWithPrefix(t, prefix)) return t;
  return `${prefix} ${t}`.trim();
}

function parseCandidates(raw: string, maxCandidates: number): string[] {
  const text = raw.trim();
  if (!text) return [];

  const parseRows = (input: string): string[] => {
    const parsed = JSON.parse(input) as { candidates?: unknown; paragraphs?: unknown };
    const rows = Array.isArray(parsed.paragraphs)
      ? parsed.paragraphs
      : Array.isArray(parsed.candidates)
        ? parsed.candidates
        : [];
    if (rows.length === 0) return [];
    return rows
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((x) => x.length > 0)
      .slice(0, maxCandidates);
  };

  let unfenced = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Some models return JSON as an escaped string (e.g. "{\"paragraphs\":[...]}").
  // Normalize one or two layers so downstream parsers can read it.
  for (let i = 0; i < 2; i++) {
    const looksQuoted = unfenced.startsWith("\"") && unfenced.endsWith("\"");
    if (looksQuoted) {
      try {
        const decoded = JSON.parse(unfenced) as unknown;
        if (typeof decoded === "string") {
          unfenced = decoded.trim();
          continue;
        }
        if (decoded && typeof decoded === "object") {
          unfenced = JSON.stringify(decoded);
          break;
        }
      } catch {
        // keep current text
      }
    }
    if (unfenced.includes('\\"paragraphs\\"') || unfenced.includes('\\"candidates\\"')) {
      unfenced = unfenced.replace(/\\"/g, "\"").trim();
      continue;
    }
    break;
  }

  const extractJsonObjects = (input: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaping = false;

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }
        if (ch === "\\") {
          escaping = true;
          continue;
        }
        if (ch === "\"") {
          inString = false;
        }
        continue;
      }

      if (ch === "\"") {
        inString = true;
        continue;
      }

      if (ch === "{") {
        if (depth === 0) start = i;
        depth += 1;
        continue;
      }

      if (ch === "}" && depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          out.push(input.slice(start, i + 1));
          start = -1;
        }
      }
    }

    return out;
  };

  const extractQuotedArrayForKey = (input: string, key: "paragraphs" | "candidates"): string[] => {
    const keyPos = input.indexOf(`"${key}"`);
    if (keyPos < 0) return [];
    const arrStart = input.indexOf("[", keyPos);
    if (arrStart < 0) return [];

    let depth = 0;
    let end = -1;
    let inString = false;
    let escaping = false;
    for (let i = arrStart; i < input.length; i++) {
      const ch = input[i];
      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }
        if (ch === "\\") {
          escaping = true;
          continue;
        }
        if (ch === "\"") inString = false;
        continue;
      }
      if (ch === "\"") {
        inString = true;
        continue;
      }
      if (ch === "[") depth += 1;
      if (ch === "]") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end <= arrStart) return [];

    const arrSlice = input.slice(arrStart, end + 1);
    const out: string[] = [];
    const quoted = /"((?:\\.|[^"\\])*)"/g;
    let match: RegExpExecArray | null = quoted.exec(arrSlice);
    while (match) {
      try {
        const decoded = JSON.parse(`"${match[1]}"`) as string;
        const trimmed = decoded.trim();
        if (trimmed.length > 0) out.push(trimmed);
      } catch {
        // ignore invalid escaped chunk
      }
      if (out.length >= maxCandidates) break;
      match = quoted.exec(arrSlice);
    }
    return out;
  };

  try {
    const direct = parseRows(unfenced);
    if (direct.length > 0) return direct;
  } catch {
    // Fall through to JSON substring parsing.
  }

  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const jsonSlice = unfenced.slice(firstBrace, lastBrace + 1);
    try {
      const fromSlice = parseRows(jsonSlice);
      if (fromSlice.length > 0) return fromSlice;
    } catch {
      // Fall through to line parsing.
    }
  }

  // Robust fallback: parse all balanced JSON objects embedded in free text.
  const objects = extractJsonObjects(unfenced);
  for (const obj of objects) {
    try {
      const rows = parseRows(obj);
      if (rows.length > 0) return rows;
    } catch {
      // continue
    }
  }

  // Recovery for partially malformed JSON that still contains a quoted array.
  const extractedParagraphs = extractQuotedArrayForKey(unfenced, "paragraphs");
  if (extractedParagraphs.length > 0) return extractedParagraphs.slice(0, maxCandidates);
  const extractedCandidates = extractQuotedArrayForKey(unfenced, "candidates");
  if (extractedCandidates.length > 0) return extractedCandidates.slice(0, maxCandidates);

  return unfenced
    .split(/\n\s*\n/g)
    .map((block) => block.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter((block) => block.length > 0)
    .filter((block) => !(block.includes("{") && /"(paragraphs|candidates)"\s*:/.test(block)))
    .slice(0, maxCandidates);
}

function mergeUnique(base: string[], incoming: string[], maxCandidates: number): string[] {
  const seen = new Set(base.map((x) => x.trim()));
  const out = [...base];
  for (const item of incoming) {
    const key = item.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= maxCandidates) break;
  }
  return out;
}

function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”‘’"']/g, "")
    .trim();
}

function leaksIntentDirective(text: string, intentDirectives: string[]): boolean {
  const target = normalizeForMatch(text);
  if (!target) return false;
  if (/^\s*-\s+/.test(text)) return true;
  for (const directive of intentDirectives) {
    const d = normalizeForMatch(directive);
    if (!d) continue;
    if (d.length >= 5 && target.includes(d)) return true;
  }
  return false;
}

function extractIntentKeywords(intentDirectives: string[]): string[] {
  const stop = new Set([
    "그리고",
    "그러나",
    "하지만",
    "정도로",
    "내용으로",
    "느낌으로",
    "같은",
    "같이",
    "해서",
    "하면",
    "좋겠어",
    "해주세요",
    "해줘",
    "표현",
    "내용"
  ]);
  const out = new Set<string>();
  for (const directive of intentDirectives) {
    const tokens = directive
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((x) => x.trim())
      .filter((x) => x.length >= 2 && !stop.has(x));
    for (const t of tokens) out.add(t);
  }
  return Array.from(out);
}

function intentCoverageScore(text: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const normalized = normalizeForMatch(text);
  let hits = 0;
  for (const kw of keywords) {
    if (normalized.includes(kw)) hits += 1;
  }
  return hits;
}

function filterIntentCoverage(items: string[], intentDirectives: string[]): string[] {
  if (intentDirectives.length === 0) return items;
  const keywords = extractIntentKeywords(intentDirectives);
  if (keywords.length === 0) return items;
  const minHits = Math.min(2, keywords.length);
  return items.filter((x) => intentCoverageScore(x, keywords) >= minHits);
}

function filterIntentLeakage(items: string[], intentDirectives: string[]): string[] {
  if (intentDirectives.length === 0) return items;
  return items.filter((x) => !leaksIntentDirective(x, intentDirectives));
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
  if (chunks.length > 0) return chunks.join("\n");

  // Fallback: scan serialized JSON for any "text":"..." payloads.
  // This catches occasional schema drifts where text is nested differently.
  try {
    const serialized = JSON.stringify(json);
    const out: string[] = [];
    const re = /"text"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    let m: RegExpExecArray | null = re.exec(serialized);
    while (m) {
      try {
        const decoded = JSON.parse(`"${m[1]}"`) as string;
        const trimmed = decoded.trim();
        if (trimmed.length > 0) out.push(trimmed);
      } catch {
        // ignore malformed escape sequence
      }
      m = re.exec(serialized);
    }
    return out.join("\n").trim();
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SentenceSuggestRequest;
    const context = (body.contextBeforeCursor ?? "").trim();
    const maxCandidates = Math.max(1, Math.min(5, Number(body.maxCandidates) || 5));
    const variationHint = (body.variationHint ?? "").trim();
    const suggestionType = body.suggestionType === "sentence" ? "sentence" : "paragraph";
    const storylinePrompt = (body.storylinePrompt ?? "").trim();
    if (!context) return NextResponse.json({ items: [] });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ items: [], error: "missing_openai_api_key" }, { status: 500 });
    const model = process.env.OPENAI_MODEL ?? "gpt-5-nano";

    const { system, user, leadPrefix, intentDirectives } = buildAiPrompt({
      contextBeforeCursor: context,
      suggestionType,
      storylinePrompt,
      variationHint
    });

    const callOpenAI = async (userText: string): Promise<{ ok: true; outputText: string } | { ok: false; status: number; detail: string }> => {
      const requestBody: Record<string, unknown> = {
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: [{ type: "input_text", text: userText }] }
        ],
        max_output_tokens: 1200
      };

      if (model.startsWith("gpt-5")) {
        requestBody.reasoning = { effort: "low" };
        requestBody.text = { verbosity: "low" };
      } else if (model.startsWith("gpt-4.1")) {
        requestBody.text = { format: { type: "text" } };
        requestBody.temperature = 1;
        requestBody.top_p = 1;
      } else {
        requestBody.text = { verbosity: "low" };
      }

      const openaiRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        return { ok: false, status: openaiRes.status, detail: errText.slice(0, 800) };
      }

      const json = (await openaiRes.json()) as unknown;
      return { ok: true, outputText: extractResponseText(json) };
    };

    const first = await callOpenAI(user);
    if (!first.ok) {
      return NextResponse.json(
        { items: [], error: `openai_http_${first.status}`, detail: first.detail },
        { status: 502 }
      );
    }

    let candidates = parseCandidates(first.outputText, maxCandidates).map((c) => forcePrefix(c, leadPrefix));
    candidates = filterIntentLeakage(candidates, intentDirectives);
    candidates = filterIntentCoverage(candidates, intentDirectives);

    if (candidates.length === 0) {
      const retryUser = [
        user,
        "",
        "If JSON output fails, return exactly 5 plain text candidates only.",
        "Do not include JSON, code block, labels, or explanations.",
        "Separate each candidate with a blank line."
      ].join("\n");
      const second = await callOpenAI(retryUser);
      if (second.ok) {
        candidates = parseCandidates(second.outputText, maxCandidates).map((c) => forcePrefix(c, leadPrefix));
        candidates = filterIntentLeakage(candidates, intentDirectives);
        candidates = filterIntentCoverage(candidates, intentDirectives);
      }
    }

    // Top-up: sometimes model returns fewer than requested (e.g., 1 or 4).
    // Retry with diversity hint and merge unique rows until we reach maxCandidates.
    let topupTry = 0;
    while (candidates.length < maxCandidates && topupTry < 2) {
      topupTry += 1;
      const missing = maxCandidates - candidates.length;
      const topupUser = [
        user,
        "",
        `Return at least ${missing} additional candidates different from previous ones.`,
        "Avoid repeating wording of prior candidates.",
        "Strictly satisfy all intent directives in each candidate.",
        "Output plain text candidates separated by a blank line."
      ].join("\n");
      const extra = await callOpenAI(topupUser);
      if (!extra.ok) break;
      const parsed = filterIntentCoverage(
        filterIntentLeakage(
          parseCandidates(extra.outputText, maxCandidates).map((c) => forcePrefix(c, leadPrefix)),
          intentDirectives
        ),
        intentDirectives
      );
      const merged = mergeUnique(candidates, parsed, maxCandidates);
      if (merged.length === candidates.length) break;
      candidates = merged;
    }

    if (candidates.length === 0) {
      const detail = first.outputText && first.outputText.trim().length > 0 ? first.outputText.slice(0, 500) : "empty_or_unparsed_model_output";
      return NextResponse.json({ items: [], error: "openai_empty_text", detail }, { status: 502 });
    }
    const items = candidates.map((text, i) => ({ id: `llm-${i + 1}`, text, source: "llm" as const }));
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [], error: "sentence_suggest_exception" }, { status: 500 });
  }
}
