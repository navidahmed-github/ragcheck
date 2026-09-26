import { createHash } from "node:crypto";
import type { Embedder } from "./types.js";

/**
 * Deterministic local embedder: hashed bag-of-words with sublinear term
 * weighting, L2-normalised. No API key, no network, same vector for the same
 * text every run.
 *
 * This is NOT a semantic embedding model and is not pretending to be one. It
 * exists so that the pipeline, the eval harness and the CI gate are fully
 * exercisable offline, and so that eval numbers are reproducible to the digit.
 * Swap in a real provider via EMBEDDER=openai and re-baseline; the gate then
 * scores the provider change the same way it scores a code change.
 */
export class LocalHashEmbedder implements Embedder {
  readonly name = "local-hash-v1";
  readonly dimensions = 512;

  private tokenise(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((t) => t.length > 2);
  }

  private bucket(token: string): number {
    const h = createHash("sha1").update(token).digest();
    return h.readUInt32BE(0) % this.dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vec = new Array<number>(this.dimensions).fill(0);
      const counts = new Map<string, number>();
      for (const tok of this.tokenise(text)) {
        counts.set(tok, (counts.get(tok) ?? 0) + 1);
      }
      for (const [tok, count] of counts) {
        const i = this.bucket(tok);
        vec[i] = (vec[i] ?? 0) + 1 + Math.log(count);
      }
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
      return vec.map((v) => v / norm);
    });
  }
}

/**
 * OpenAI-compatible embedding provider (works with any endpoint that speaks
 * the /v1/embeddings shape). Selected with EMBEDDER=openai.
 */
export class OpenAIEmbedder implements Embedder {
  readonly name: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    const key = process.env["OPENAI_API_KEY"];
    if (!key) throw new Error("EMBEDDER=openai requires OPENAI_API_KEY");
    this.apiKey = key;
    this.baseUrl = process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com";
    this.model = process.env["EMBEDDING_MODEL"] ?? "text-embedding-3-small";
    this.dimensions = Number(process.env["EMBEDDING_DIMENSIONS"] ?? 1536);
    this.name = `openai:${this.model}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`Embedding request failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    return body.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

export function makeEmbedder(): Embedder {
  const which = process.env["EMBEDDER"] ?? "local";
  if (which === "openai") return new OpenAIEmbedder();
  return new LocalHashEmbedder();
}
