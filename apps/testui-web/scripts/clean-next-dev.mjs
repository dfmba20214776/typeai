import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const targets = [".next-dev"];

for (const dir of targets) {
  const full = resolve(root, dir);
  try {
    rmSync(full, { recursive: true, force: true });
    console.log(`[clean-next-dev] removed ${dir}`);
  } catch (err) {
    console.warn(`[clean-next-dev] failed to remove ${dir}:`, err);
  }
}
