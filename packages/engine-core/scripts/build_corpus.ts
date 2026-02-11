import { promises as fs } from "node:fs";
import path from "node:path";

type Config = {
  inputDir: string;
  outDir: string;
  minWordFreq: number;
  maxDictWords: number;
  maxNextPerPrev: number;
  topPairPerPrev: number;
};

const DEFAULT_CONFIG: Config = {
  inputDir: path.resolve("corpus/raw"),
  outDir: path.resolve("corpus/generated"),
  minWordFreq: 2,
  maxDictWords: 200_000,
  maxNextPerPrev: 200,
  topPairPerPrev: 15
};

function parseArgs(): Config {
  const cfg: Config = { ...DEFAULT_CONFIG };
  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.split("=");
    if (!key || value === undefined) continue;
    switch (key) {
      case "--input":
        cfg.inputDir = path.resolve(value);
        break;
      case "--out":
        cfg.outDir = path.resolve(value);
        break;
      case "--min-word-freq":
        cfg.minWordFreq = Number(value);
        break;
      case "--max-dict-words":
        cfg.maxDictWords = Number(value);
        break;
      case "--top-pair-per-prev":
        cfg.topPairPerPrev = Number(value);
        break;
      default:
        break;
    }
  }
  return cfg;
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (lower.endsWith(".txt") || lower.endsWith(".jsonl") || lower.endsWith(".md")) {
          out.push(full);
        }
      }
    }
  }
  await walk(root);
  return out;
}

function normalizeLine(line: string): string {
  let s = line.normalize("NFKC");
  s = s.replace(/https?:\/\/\S+/g, " ");
  s = s.replace(/\S+@\S+\.\S+/g, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/[\u0000-\u001F\u007F]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?。！？\n]/g)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function tokenize(sentence: string): string[] {
  const tokens = sentence.match(/[A-Za-z0-9가-힣]+/g) ?? [];
  return tokens.map((x) => x.toLowerCase());
}

function inc(map: Map<string, number>, key: string, delta = 1): void {
  map.set(key, (map.get(key) ?? 0) + delta);
}

async function readLinesFromFile(file: string): Promise<string[]> {
  const raw = await fs.readFile(file, "utf8");
  if (file.toLowerCase().endsWith(".jsonl")) {
    const out: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof obj.text === "string") out.push(obj.text);
        else out.push(trimmed);
      } catch {
        out.push(trimmed);
      }
    }
    return out;
  }
  return raw.split(/\r?\n/);
}

async function main(): Promise<void> {
  const cfg = parseArgs();
  await fs.mkdir(cfg.outDir, { recursive: true });

  const files = await walkFiles(cfg.inputDir);
  if (files.length === 0) {
    throw new Error(`No source files in ${cfg.inputDir}`);
  }

  const wordFreq = new Map<string, number>();
  const pairFreq = new Map<string, Map<string, number>>();
  let rawLineCount = 0;
  let normalizedLineCount = 0;
  let sentenceCount = 0;
  let tokenCount = 0;

  for (const file of files) {
    const lines = await readLinesFromFile(file);
    rawLineCount += lines.length;
    for (const line of lines) {
      const normalized = normalizeLine(line);
      if (!normalized) continue;
      normalizedLineCount += 1;
      for (const sentence of splitSentences(normalized)) {
        const tokens = tokenize(sentence);
        if (tokens.length === 0) continue;
        sentenceCount += 1;
        tokenCount += tokens.length;
        for (const w of tokens) inc(wordFreq, w);
        for (let i = 1; i < tokens.length; i++) {
          const prev = tokens[i - 1];
          const next = tokens[i];
          const row = pairFreq.get(prev) ?? new Map<string, number>();
          inc(row, next);
          pairFreq.set(prev, row);
        }
      }
    }
  }

  const dictRows = [...wordFreq.entries()]
    .filter(([, c]) => c >= cfg.minWordFreq)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, cfg.maxDictWords);
  const dictRowsWithFreq = dictRows.map(([word, count]) => `${word}\t${count}`);

  const ngramRows: string[] = [];
  const pairSummary: Array<[string, number]> = [];
  for (const [prev, row] of pairFreq.entries()) {
    const topNext = [...row.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, Math.min(cfg.maxNextPerPrev, cfg.topPairPerPrev));
    pairSummary.push([prev, topNext.length]);
    for (const [next, count] of topNext) {
      ngramRows.push(`${prev}\t${next}\t${count}`);
    }
  }

  const dictPath = path.join(cfg.outDir, "dict_large.txt");
  const ngramPath = path.join(cfg.outDir, "ngram_large.jsonl");
  const reportPath = path.join(cfg.outDir, "report.json");
  const reportMdPath = path.join(cfg.outDir, "report.md");

  await fs.writeFile(dictPath, dictRowsWithFreq.join("\n") + "\n", "utf8");
  await fs.writeFile(ngramPath, ngramRows.join("\n") + "\n", "utf8");

  const topWords = dictRows.slice(0, 30).map(([word, count]) => ({ word, count }));
  const topPrev = pairSummary
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([prev, nextKinds]) => ({ prev, nextKinds }));

  const report = {
    config: cfg,
    inputFiles: files.length,
    rawLineCount,
    normalizedLineCount,
    sentenceCount,
    tokenCount,
    dictSize: dictRowsWithFreq.length,
    ngramSize: ngramRows.length,
    topWords,
    topPrev
  };

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(
    reportMdPath,
    [
      "# Corpus Build Report",
      "",
      `- inputFiles: ${report.inputFiles}`,
      `- rawLineCount: ${report.rawLineCount}`,
      `- normalizedLineCount: ${report.normalizedLineCount}`,
      `- sentenceCount: ${report.sentenceCount}`,
      `- tokenCount: ${report.tokenCount}`,
      `- dictSize: ${report.dictSize}`,
      `- ngramSize: ${report.ngramSize}`,
      "",
      "## Top Words",
      ...topWords.map((x) => `- ${x.word}: ${x.count}`),
      "",
      "## Top Prev Tokens",
      ...topPrev.map((x) => `- ${x.prev}: ${x.nextKinds}`)
    ].join("\n"),
    "utf8"
  );

  console.log(`[corpus] input files: ${files.length}`);
  console.log(`[corpus] dict: ${dictPath} (${dictRowsWithFreq.length} words)`);
  console.log(`[corpus] ngram: ${ngramPath} (${ngramRows.length} pairs)`);
  console.log(`[corpus] report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
