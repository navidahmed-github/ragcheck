import pg from "pg";
import type { Chunk, ScoredChunk, VectorStore } from "./types.js";

/** Cosine similarity on pre-normalised vectors reduces to a dot product. */
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

/**
 * In-memory store. Zero infrastructure, exact search, perfect for the eval
 * loop and CI. At demo-corpus scale, brute force beats an index anyway.
 */
export class MemoryStore implements VectorStore {
  readonly name = "memory";
  private rows: { chunk: Chunk; vector: number[] }[] = [];

  async upsert(chunks: Chunk[], vectors: number[][]): Promise<void> {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = vectors[i];
      if (!chunk || !vector) continue;
      this.rows = this.rows.filter((r) => r.chunk.id !== chunk.id);
      this.rows.push({ chunk, vector });
    }
  }

  async search(vector: number[], k: number): Promise<ScoredChunk[]> {
    return this.rows
      .map((r) => ({ ...r.chunk, score: dot(r.vector, vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  async count(): Promise<number> {
    return this.rows.length;
  }

  async close(): Promise<void> {}
}

/**
 * pgvector store: the production shape. Embeddings live in Postgres next to
 * the transactional data, inside the same backup and security boundary, and
 * can be JOINed against business tables (see ADR-0001).
 */
export class PgVectorStore implements VectorStore {
  readonly name = "pgvector";
  private pool: pg.Pool;
  private readonly dimensions: number;
  private ready = false;

  constructor(dimensions: number) {
    this.dimensions = dimensions;
    this.pool = new pg.Pool({
      connectionString:
        process.env["DATABASE_URL"] ??
        "postgres://ragcheck:ragcheck@localhost:5433/ragcheck",
    });
  }

  private async init(): Promise<void> {
    if (this.ready) return;
    await this.pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS chunks (
         id text PRIMARY KEY,
         doc_id text NOT NULL,
         heading text NOT NULL,
         text text NOT NULL,
         embedding vector(${this.dimensions}) NOT NULL
       )`
    );
    this.ready = true;
  }

  async upsert(chunks: Chunk[], vectors: number[][]): Promise<void> {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const v = vectors[i];
        if (!c || !v) continue;
        await client.query(
          `INSERT INTO chunks (id, doc_id, heading, text, embedding)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE
             SET doc_id = $2, heading = $3, text = $4, embedding = $5`,
          [c.id, c.docId, c.heading, c.text, `[${v.join(",")}]`]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async search(vector: number[], k: number): Promise<ScoredChunk[]> {
    await this.init();
    const res = await this.pool.query(
      `SELECT id, doc_id, heading, text,
              1 - (embedding <=> $1) AS score
       FROM chunks
       ORDER BY embedding <=> $1
       LIMIT $2`,
      [`[${vector.join(",")}]`, k]
    );
    return res.rows.map((r) => ({
      id: r.id,
      docId: r.doc_id,
      heading: r.heading,
      text: r.text,
      score: Number(r.score),
    }));
  }

  async count(): Promise<number> {
    await this.init();
    const res = await this.pool.query("SELECT count(*)::int AS n FROM chunks");
    return res.rows[0]?.n ?? 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function makeStore(dimensions: number): VectorStore {
  const which = process.env["STORE"] ?? "memory";
  if (which === "pgvector") return new PgVectorStore(dimensions);
  return new MemoryStore();
}
