# ADR-0003: Heading-aware chunking with paragraph overlap

Status: accepted

## Context

Chunking strategy dominates retrieval quality in document-heavy RAG, and
safety/compliance documents have strong internal structure: a fact's meaning
depends on which procedure it belongs to ("inspect every six months" means
nothing without knowing it is about harnesses, not scaffolds).

## Decision

Split on H2/H3 section boundaries first, so no chunk straddles two
procedures. Oversized sections split on paragraph boundaries with one
paragraph of overlap. Every chunk is prefixed with its section heading.

## Rationale

- The heading is the cheapest context injection available: it travels with
  the chunk into both the embedding and the prompt, and disambiguates
  near-identical requirements across documents (three-monthly test-and-tag
  vs six-monthly harness inspection vs 30-day scaffold inspection).
- Paragraph overlap means a fact sitting at a split boundary is retrievable
  from either side.

## Costs accepted

- Fixed character budget (1200) is crude versus token-aware splitting; good
  enough at this corpus size, and the eval harness is the instrument that
  would justify anything cleverer. No chunking change merges without moving
  the golden-set numbers or at least holding them flat.
