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

The first shadow frontier used explicit dimensions rather than a weighted scalar:

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

## Rejected checkpoint A — estimator-first width 16

Exact implementation head:

```text
b577dc849aaa36f1b9777c9792e120e38ba2eb8c
```

Workflow run: `30091733180`  
Artifact: `8596292320`  
Artifact digest: `sha256:73b78c9d1707cc2f25230c76eced026919e88e820568bfa82d119cb206343d11`

The locked development-20 run produced exact complete-output parity on all 20 seeds. All per-seed output differences were empty, all outputs were valid, connected and exact-clue-only, and aggregate shadow runtime was `0.9825x` the off baseline.

The hypothesis failed decisively on recall:

| metric | result |
| --- | ---: |
| exact allocation calls observed | 10,321 |
| hypothetical calls removed at width 16 | 9,681 (93.80%) |
| measured allocation time represented by removed calls | 92.75% |
| Phase 10 frontier members retained | 4 / 160 (2.50%) |
| Phase 10 required parent bases retained | 4 / 101 (3.96%) |
| seeds with full Phase 10 recall | 0 / 20 |

The estimator-first truncation favored sparse states with low zero-domain and long-impossible counts. Phase 10 winners were commonly denser states with more residual estimator debt but much stronger repair potential. The projected savings were therefore unsafe and must not be promoted.

The original checkpoint aggregate incorrectly discarded parity, runtime and allocation totals when recall failed. The per-seed evidence remained intact; the harness is corrected in the next checkpoint so negative results retain all measured data.

## Hypothesis B — repair-potential-first truncation

`construction-preallocation-repair-potential-v1.js` adds a second shadow-only diagnostic over the same observations. It preserves the rejected estimator-first record and changes only the hypothetical width ordering:

```text
fewer panels
more letters, answers and crossings
better residual topology
then feasibility bounds and pressure
```

The estimator remains present as advisory dimensions and necessary-bound telemetry, but it no longer outranks the accepted Phase 10 repair-potential geometry during width truncation.

The diagnostic reports a deterministic width sweep:

```text
8, 16, 24, 32, 48, 64, 96, 128, 192, 256
```

The next locked development checkpoint must establish whether any bounded width reaches full parent and Phase 10 frontier recall while preserving meaningful allocation savings. If no useful width does, the pre-allocation estimator boundary is rejected and Phase 10 remains unchanged.

## Development gate

Run:

```bash
node tools/preallocation-structural-frontier-test-v1.cjs
node tools/preallocation-repair-potential-test-v1.cjs

SCANWORD_PREALLOCATION_CONCURRENCY=4 \
SCANWORD_PREALLOCATION_RUNTIME_RATIO=1.12 \
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH=16 \
SCANWORD_PREALLOCATION_DIAGNOSTIC_WIDTHS=8,16,24,32,48,64,96,128,192,256 \
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

If the repair-potential development sweep shows full Phase 10 frontier recall with meaningful projected savings, freeze the smallest safe width and implement a separately gated filtering mode that allocates only retained structural finalists with an explicit Phase 10 rollback. If recall remains incomplete at useful widths, preserve the negative result and reject or redesign the pre-allocation boundary before any authoritative filtering.