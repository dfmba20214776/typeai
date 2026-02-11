import type { EngineInput, EngineOutput, SuggestionItem } from "@lab/engine-core/src/types";

export class EngineWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, (data: any) => void>();

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (e: MessageEvent) => {
      const { id, payload } = e.data as { id: number; payload: any };
      const cb = this.pending.get(id);
      if (cb) {
        this.pending.delete(id);
        cb(payload);
      }
    };
  }

  async init(dict: string[], ngram: string[]): Promise<void> {
    await this.rpc("init", { dict, ngram });
  }

  async suggest(input: EngineInput): Promise<EngineOutput> {
    return this.rpc("suggest", input);
  }

  async accept(item: SuggestionItem): Promise<void> {
    await this.rpc("accept", item);
  }

  private rpc<T>(type: string, payload: any): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ id, type, payload });
    });
  }
}
