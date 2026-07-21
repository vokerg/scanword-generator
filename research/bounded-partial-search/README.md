# Phase 6 — bounded partial-state search

## Status

`IN PROGRESS`

## Goal

Replace part of the independent greedy restart budget with one bounded deterministic search over competing placement states before dense-tail topology decisions become irreversible.

The browser default remains unchanged while this work is evaluated:

```text
SCANWORD_PARTIAL_SEARCH=off
```

## Initial decision

The first search family is a **late-placement beam with baseline fallback**. It must:

- retain the unchanged greedy state as a candidate;
- clone states explicitly before committing alternative placements;
- use deterministic signatures and tie-breakers;
- enforce beam width, branching, node and depth limits;
- run the unchanged clue allocator and complete validator on returned finalists;
- expose per-state ancestry and pruning telemetry;
- compare fewer greedy attempts plus bounded search against the locked `development-20` baseline;
- avoid another global `generateBest` wrapper.

The historical `construction-v2.js` beam is not the Phase 6 implementation. It starts from a completed greedy grid, searches residual slots and owns a legacy `generateBest` wrapper. It remains a comparison artifact.

## Acceptance boundary

Development iteration only. A candidate is not promotable unless all seeds remain valid, connected and exact-clue; per-seed panel and editorial regressions are reported; runtime is bounded; and telemetry proves that retained alternatives, rather than merely extra restarts, produced any gain.
