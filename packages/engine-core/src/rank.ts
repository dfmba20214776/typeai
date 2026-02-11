export function scoreWord(baseFreq: number, mruBoost: number): number {
  return baseFreq + mruBoost * 10;
}
