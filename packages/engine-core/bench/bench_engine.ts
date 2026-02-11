import { Engine } from "../src/engine";

const e = new Engine();
e.initDict(["hello", "help", "helium", "¿À´Ã", "¿À´ÃÀº", "°¡³ª´Ù"]);

const t0 = performance.now();
for (let i = 0; i < 1000; i++) e.suggest({ committedBeforeCursor: "he", preedit: "" });
const dt = performance.now() - t0;
console.log(`bench_engine ms: ${dt.toFixed(2)}`);
