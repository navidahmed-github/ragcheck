export interface Chunk {
  id: string;
  docId: string;
  heading: string;
  text: string;
}

export interface ScoredChunk extends Chunk {
  score: number;
}

/**
 * Embedders are pluggable. The rest of the pipeline never knows which one is
 * active, which is what lets the eval harness compare providers like for like.
 */
export interface Embedder {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Vector stores are pluggable for the same reason. MemoryStore keeps the demo
 * runnable with zero infrastructure; PgVectorStore is the production shape,
 * where embeddings live next to transactional data in Postgres.
 */
export interface VectorStore {
  readonly name: string;
  upsert(chunks: Chunk[], vectors: number[][]): Promise<void>;
  search(vector: number[], k: number): Promise<ScoredChunk[]>;
  count(): Promise<number>;
  close(): Promise<void>;
}
