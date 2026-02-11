export class MRU {
  private freq = new Map<string, number>();

  bump(word: string): void {
    this.freq.set(word, (this.freq.get(word) ?? 0) + 1);
  }

  get(word: string): number {
    return this.freq.get(word) ?? 0;
  }

  top(prefix: string, k: number): string[] {
    const out: Array<{ word: string; score: number }> = [];
    for (const [w, s] of this.freq) {
      if (w.startsWith(prefix)) out.push({ word: w, score: s });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, k).map(x => x.word);
  }
}
