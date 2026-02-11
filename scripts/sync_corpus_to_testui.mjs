import { promises as fs } from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const srcDir = path.join(root, "packages", "engine-core", "corpus", "generated");
const dstDir = path.join(root, "apps", "testui-web", "public", "corpus");

const files = ["dict_large.txt", "ngram_large.jsonl", "report.json", "report.md"];

async function main() {
  await fs.mkdir(dstDir, { recursive: true });
  for (const name of files) {
    const src = path.join(srcDir, name);
    const dst = path.join(dstDir, name);
    await fs.copyFile(src, dst);
    const stat = await fs.stat(dst);
    console.log(`[sync] ${name} -> ${dst} (${stat.size} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

