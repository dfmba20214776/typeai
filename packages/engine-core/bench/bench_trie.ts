import { createTrie, insertWord, topK } from "../src/trie_topk";

const t = createTrie();
for (let i = 0; i < 5000; i++) insertWord(t, "word" + i, 1);

const t0 = performance.now();
for (let i = 0; i < 1000; i++) topK(t, "wo", 3);
const dt = performance.now() - t0;
console.log(`bench_trie ms: ${dt.toFixed(2)}`);
