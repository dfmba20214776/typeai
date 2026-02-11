import { Engine } from "@lab/engine-core/src/engine";
import type { EngineInput, EngineOutput, SuggestionItem } from "@lab/engine-core/src/types";

const engine = new Engine();

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data as { type: string; payload: any };
  if (type === "init") {
    engine.initDict(payload.dict ?? []);
    engine.initNgram(payload.ngram ?? []);
    self.postMessage({ type: "init:ok" });
  }
  if (type === "suggest") {
    const out: EngineOutput = engine.suggest(payload as EngineInput);
    self.postMessage({ type: "suggest:ok", payload: out });
  }
  if (type === "accept") {
    engine.accept(payload as SuggestionItem);
    self.postMessage({ type: "accept:ok" });
  }
};
