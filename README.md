# ragcheck

A RAG pipeline where **retrieval quality is a release gate, not a vibe**.

Golden-set evals run in CI on every pull request and block the merge if
retrieval regresses. The quality bar is a number.

This repo is a public, small-scale rebuild of the approach I run in
production: pgvector behind a swappable store interface, heading-aware
chunking, and an eval harness wired into the release process. The corpus here
is construction safety documentation; the shape is domain-agnostic.

## Why

Retrieval regressions are silent. The system returns something plausible on
every query, so a chunking tweak or an embedder upgrade that quietly degrades
recall ships cleanly and surfaces weeks later as "the answers feel worse."

Model output is a draft. **Verification is the product.** So verification
lives where code changes happen:

```
PR opened -> typecheck -> golden-set eval -> gate vs baseline -> merge
                                                  |
                                          recall drops: RED BUILD
```

## Quick start (zero infrastructure, no API keys)

```bash
npm install
npm run ingest          # chunk + embed + load the corpus
npm run ask -- "how often does a harness need a detailed inspection?"
npm run eval            # run the golden set, print recall@3 and MRR
npm run gate            # compare against committed baseline; non-zero exit on regression
```

The default embedder is a deterministic local hasher (no key, reproducible to
the digit) and the default store is in-memory. That is a deliberate choice so
the gate runs on every PR with zero secrets and zero infra - see ADR-0002.

## Watch it fail (the point of the repo)

Introduce the classic silent regression - truncating the text that gets
embedded "to save on embedding costs":

```bash
sed -i 's|c.text));|c.text.slice(0, 80)));|' src/pipeline.ts
npm run gate
# GATE FAILED: recall@3 dropped 1 -> 0.9
#   failing case notifiable-incident: expected [incident-reporting], got [electrical-safety, ...]
# exit code 1 - in CI this is a red build and the PR does not merge
git checkout src/pipeline.ts
```

Without the gate, that change ships: every query still returns plausible
results, and nobody notices until users do.

## Production shape

```bash
docker compose up -d    # Postgres 16 + pgvector on :5433
STORE=pgvector npm run ingest
STORE=pgvector npm run ask -- "when must a trench be re-inspected?"

# real embeddings (any OpenAI-compatible endpoint):
EMBEDDER=openai OPENAI_API_KEY=sk-... npm run eval
```

Both axes are independently swappable. The pipeline code does not know which
embedder or store is active - which is exactly what lets the eval harness
score a provider migration the same way it scores a one-line chunker change.

## Layout

```
src/
  types.ts      Embedder / VectorStore interfaces (the swap points)
  chunker.ts    heading-aware markdown chunking (ADR-0003)
  embedder.ts   local deterministic + OpenAI-compatible providers
  store.ts      MemoryStore + PgVectorStore (ADR-0001)
  pipeline.ts   ingest + retrieve, provider-agnostic
eval/
  golden.json   query -> expected-doc cases, grown from real failures
  run.ts        recall@k + MRR against the live pipeline
  gate.ts       fails CI when quality drops below baseline (ADR-0002)
  baseline.json committed quality bar; re-baselining is a reviewed diff
docs/adr/       decision log: what was chosen, what it cost, the escape hatch
data/           sample corpus (construction safety procedures)
```

## The rules this repo runs by

1. **Every retrieval failure becomes a golden case before it is fixed** -
   the same discipline as a bug becoming a regression test.
2. **Any recall drop is a red build.** MRR gets a small ordering tolerance;
   recall gets none.
3. **Re-baselining is a reviewed act.** The baseline diff appears in the PR
   next to the change that earned it.
4. **Decisions get ADRs**, including the costs accepted and the escape hatch.

## Author

Navid Ahmed - admin@navidahmed.com.au
