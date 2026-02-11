export type NgramModel = Map<string, Array<{ next: string; count: number }>>;

export function loadNgramFromLines(lines: string[]): NgramModel {
  const tmp = new Map<string, Map<string, number>>();
  for (const line of lines) {
    const [prevRaw, nextRaw, countRaw] = line.split("\t");
    const prev = prevRaw?.trim();
    const next = nextRaw?.trim();
    if (!prev || !next) continue;
    const parsed = Number(countRaw);
    const count = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    const row = tmp.get(prev) ?? new Map<string, number>();
    row.set(next, (row.get(next) ?? 0) + count);
    tmp.set(prev, row);
  }
  const model: NgramModel = new Map();
  for (const [prev, row] of tmp.entries()) {
    const sorted = [...row.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([next, count]) => ({ next, count }));
    model.set(prev, sorted);
  }
  return model;
}

export function suggestNext(model: NgramModel, prev: string, k: number): string[] {
  const arr = model.get(prev) ?? [];
  return arr.slice(0, k).map((x) => x.next);
}

export function suggestNextWithPrefix(model: NgramModel, prev: string, prefix: string, k: number): string[] {
  const arr = model.get(prev) ?? [];
  const out: string[] = [];
  for (const { next } of arr) {
    if (!next.startsWith(prefix)) continue;
    out.push(next);
    if (out.length >= k) break;
  }
  return out;
}
