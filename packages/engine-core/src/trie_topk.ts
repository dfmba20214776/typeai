export type TrieNode = {
  children: Map<string, TrieNode>;
  isWord: boolean;
  freq: number;
};

export type Trie = {
  root: TrieNode;
};

export function createTrie(): Trie {
  return { root: { children: new Map(), isWord: false, freq: 0 } };
}

export function insertWord(trie: Trie, word: string, freq = 1): void {
  let node = trie.root;
  for (const ch of word) {
    let child = node.children.get(ch);
    if (!child) {
      child = { children: new Map(), isWord: false, freq: 0 };
      node.children.set(ch, child);
    }
    node = child;
  }
  node.isWord = true;
  node.freq += freq;
}

export function topK(trie: Trie, prefix: string, k: number): string[] {
  let node = trie.root;
  for (const ch of prefix) {
    const next = node.children.get(ch);
    if (!next) return [];
    node = next;
  }
  const out: Array<{ word: string; freq: number }> = [];
  const dfs = (n: TrieNode, acc: string) => {
    if (n.isWord) out.push({ word: acc, freq: n.freq });
    for (const [ch, child] of n.children) dfs(child, acc + ch);
  };
  dfs(node, prefix);
  return out
    .sort((a, b) => b.freq - a.freq || a.word.localeCompare(b.word))
    .slice(0, k)
    .map(x => x.word);
}
