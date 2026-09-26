import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { chunkDocument } from "./chunker.js";
import { makeEmbedder } from "./embedder.js";
import { makeStore } from "./store.js";
import type { Chunk, Embedder, ScoredChunk, VectorStore } from "./types.js";

const DATA_DIR = new URL("../data/", import.meta.url).pathname;

export interface Pipeline {
  embedder: Embedder;
  store: VectorStore;
  ingest(): Promise<{ docs: number; chunks: number }>;
  retrieve(query: string, k: number): Promise<ScoredChunk[]>;
  close(): Promise<void>;
}

export async function makePipeline(): Promise<Pipeline> {
  const embedder = makeEmbedder();
  const store = makeStore(embedder.dimensions);

  return {
    embedder,
    store,

    async ingest() {
      const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith(".md"));
      let allChunks: Chunk[] = [];
      for (const file of files.sort()) {
        const docId = basename(file, ".md");
        const markdown = await readFile(join(DATA_DIR, file), "utf8");
        allChunks = allChunks.concat(chunkDocument(docId, markdown));
      }
      const vectors = await embedder.embed(allChunks.map((c) => c.text));
      await store.upsert(allChunks, vectors);
      return { docs: files.length, chunks: allChunks.length };
    },

    async retrieve(query: string, k: number) {
      const [vector] = await embedder.embed([query]);
      if (!vector) throw new Error("Embedding failed for query");
      return store.search(vector, k);
    },

    async close() {
      await store.close();
    },
  };
}
