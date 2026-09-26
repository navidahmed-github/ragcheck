# ADR-0001: pgvector over a dedicated vector database

Status: accepted

## Context

The pipeline needs a vector store. The default industry answer in 2025-2026 is
a dedicated vector database (Pinecone, Weaviate, Qdrant). The team is small and
already operates Postgres for transactional data.

## Decision

Use pgvector inside the existing Postgres instance, behind a `VectorStore`
interface so the store can be swapped without touching the pipeline.

## Rationale

- One backup, security and compliance boundary instead of two. No new vendor
  to assess, no second data store holding fragments of user content.
- Embeddings sit next to transactional data, so retrieval results can be
  JOINed against business tables (permissions, tenancy, record status) in a
  single query instead of a second round trip and an application-side merge.
- Operational load is the scarcest resource on a small team. A second
  database is a second thing that pages you.

## Costs accepted

- A dedicated store wins on recall/latency at large scale (100M+ vectors,
  high QPS). We are orders of magnitude below that ceiling.
- HNSW index tuning in pgvector is more manual than managed offerings.

## Escape hatch

The `VectorStore` interface is the swap point. If scale ever approaches the
ceiling, a dedicated store implements the same five methods and the eval
harness (ADR-0002) scores the migration like any other change: re-run the
golden set, compare against baseline, prove no quality regression before
cutover.
