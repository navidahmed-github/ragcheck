# ADR-0002: Retrieval quality is a release gate, not a dashboard

Status: accepted

## Context

Retrieval regressions are silent. A RAG system returns something plausible on
every query, so a chunking tweak, a prompt change, or an embedder upgrade that
quietly degrades recall ships cleanly and surfaces weeks later as "the answers
feel worse", with no way to bisect when it happened.

Observability dashboards do not solve this: they tell you quality dropped
after users already saw it.

## Decision

A golden set of query -> expected-document cases lives in the repo
(`eval/golden.json`). CI runs the set on every pull request and fails the
build if recall@k drops below the committed baseline at all, or MRR drops
beyond a small ordering tolerance. Improvements pass and are re-baselined in
the same PR, so the baseline diff is reviewed next to the change that earned
it.

## Rationale

- The quality bar becomes a number, enforced where changes happen, before
  they ship. This is the same posture as type checking and unit tests:
  deterministic gates ahead of human review, so humans review judgement
  instead of catching silent drift.
- Every production retrieval failure becomes a golden case before it is
  fixed, exactly like a bug becoming a regression test. The set grows in the
  direction real usage stresses the system.

## Costs accepted

- The golden set is a sample, not the distribution. It catches regressions on
  known-important queries, not novel ones; production monitoring is still
  needed for discovery, and feeds new cases back into the set.
- A deterministic local embedder keeps CI keyless and reproducible; provider
  evals run the same harness with `EMBEDDER=openai` before a provider change
  is merged.
