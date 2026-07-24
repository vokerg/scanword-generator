# Phase 11 — pre-allocation structural frontier

Status: **development shadow boundary**  
Baseline: `43745d086c4879af69181676149ebcfb76110502` (Phase 10 squash)  
Research branch: `r-and-d/phase-11-preallocation-structural-frontier`

## Question

Can a deterministic structural frontier immediately before `assignClueTextCellsV2` retain the candidates that feed the accepted Phase 10 complete-pipeline frontier while avoiding most exact clue-allocation calls?

## Initial hypothesis

The existing regional clue-feasibility estimator, combined with structural geometry and topology metrics, can identify a bounded non-dominated set before exact allocation. The estimator remains advisory: exact clue allocation, complete validation and the accepted complete-pipeline comparison remain authoritative.

## First implementation boundary

`construction-preallocation-frontier-v1.js` installs after `construction-portfolio.js` and wraps only `ScanwordSolver.generatePortfolio`. It does not replace `generateBest` or alter production ownership.

The initial mode is shadow-only:

```text
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off|shadow
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH=16
```

Browser default remains `off`.

In `shadow` mode the module:

1. observes each structural state immediately before `assignClueTextCellsV2`;
2. evaluates the existing `regional-bounds-local-delta-v1` estimator;
3. records deterministic provenance for build attempts, baseline fallbacks and victim-replacement variants;
4. constructs a bounded base-state frontier before considering victim variants;
5. admits only victim variants whose parent base survived that first stage, then constructs the final structural frontier;
6. runs every exact allocation exactly as Phase 10 does;
7. aggregates telemetry across every seed-specific vocabulary working set without changing candidate selection or output;
8. measures exact allocation calls, allocation time, projected calls/time saved, parent-base recall and final recall of the accepted Phase 10 construction frontier.

The staged model mirrors the implementable dependency chain: base structural retention must precede victim generation. It does not use a flat frontier that can retain a victim while discarding its parent. Observed victim coverage is explicitly limited to variants that Phase 10 generated; authoritative filtering would generate victim variants from the retained base frontier before the final structural decision.

Telemetry is also aggregated across the complete vocabulary portfolio, so reported allocation savings cover both canonical 2,500- and 3,500-entry working-set runs rather than only the finally selected run.

The heavy observation objects are non-enumerable. Normal result payloads contain compact vectors, provenance and rejection reasons only.

## Structural vector

The shadow frontier uses explicit dimensions rather than a weighted scalar:

```text
necessary feasibility pass
hard-impossible state and hard-failure count
zero-domain and long-impossible clue counts
panel cells and residual topology
letter cells, answers and crossings
estimated clue-text cells and external clues
panel regions, isolated panels and residual concentration
overlap and maximum-cell pressure
```

Deterministic allocation order is the final tie-breaker.

## Development gate

Run:

```bash
node tools/preallocation-structural-frontier-test-v1.cjs

SCANWORD_PREALLOCATION_CONCURRENCY=4 \
SCANWORD_PREALLOCATION_RUNTIME_RATIO=1.12 \
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH=16 \
SCANWORD_PREALLOCATION_REQUIRE_PHASE10_RECALL=1 \
  node tools/preallocation-structural-frontier-checkpoint-v1.cjs \
  research/baselines/seed-sets/development-20.json \
  research-output/preallocation-structural-frontier/development-20.jsonl
```

The shadow checkpoint requires:

- exact complete-output parity against Phase 10 off mode;
- complete, valid, connected, exact-clue outputs;
- estimator telemetry for every exact allocation call;
- a bounded hypothetical frontier;
- projected allocation-call savings;
- full recall of all parent bases required by Phase 10 victim finalists;
- full recall of all Phase 10 construction-frontier members when recall gating is enabled;
- portfolio-wide accounting across all canonical working-set runs;
- aggregate runtime ratio no greater than the configured cap.

This is not a promotion gate. A shadow result cannot reduce real work and must not be presented as a production optimization.

## Next decision

If development-20 shows full Phase 10 frontier recall with meaningful projected savings, implement a separately gated filtering mode that allocates only retained structural finalists and preserves an explicit Phase 10 rollback. If recall is incomplete, preserve the evidence and revise the vector or boundary before any authoritative filtering.
