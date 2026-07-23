# Phase 10 — bounded complete-pipeline frontier

## Question

Can a small non-dominated set of construction candidates survive the complete downstream repair and editorial chain and produce a better final grid than the current early single-candidate selection?

## Baseline

Phase 9 makes the explicit orchestrator the canonical production owner. Within each active vocabulary set, `construction-portfolio.js` performs construction, clue allocation and pre-layout victim repair, ranks complete checkpoint-passing candidates, and returns one local winner. `construction-stage-runtime-v2.js` then runs polish, clue-footprint repairs, targeted residual-victim repair, the preserved legacy guard and same-geometry editorial repair only for that winner.

That boundary can delete a candidate whose current complete metrics are worse but whose residual topology has more downstream repair potential.

## Feature controls

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=on
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4
```

Browser default remains:

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=off
```

The exact Phase 9 winner is immutable frontier member zero. The historical guard candidate is generated once and cloned for each finalist. Frontier width multiplies only the downstream chain, not unrestricted construction restarts or legacy guard generation.

## Retained construction frontier

The accepted development candidate uses complete metrics plus explicit repair-potential topology:

```text
minimize residual panels
maximize letter cells
minimize weak fill
minimize clue-text cells
maximize external clue capacity
maximize crossings
maximize answers
minimize residual panel regions
minimize isolated panels
maximize residual concentration = largest panel region / residual panels
```

A candidate with a small current panel disadvantage may therefore survive when its residual cells are more concentrated or less fragmented and can be repaired more effectively downstream.

The frontier is bounded to four candidates by deterministic canonical order. Every dominance and width rejection records its vector and provenance.

## Downstream finalist chain

```text
portfolio polish
-> clue-footprint repack
-> adaptive clue repack
-> clue-tail absorption
-> single-footprint reflow
-> pair-footprint reflow
-> targeted residual-victim repair
-> shared exact legacy guard
-> same-geometry editorial repair
-> complete final validation and comparison
```

## Final comparison

Only candidates that are valid, connected and exact-clue-only are eligible. Final selection uses the canonical lexicographic objective:

1. fewer residual panels;
2. more answers;
3. more crossings;
4. greater raw-letter coverage;
5. fewer formulaic short answers;
6. lower editorial penalty;
7. lower selected-grid clue debt;
8. higher solver score;
9. exact Phase 9 baseline preference on complete ties.

No weighted scalar score is used to hide the frontier.

## Harness defect preserved

Two early green runs were invalid as frontier evidence because `tools/complete-pipeline-frontier-checkpoint-v1.cjs` did not load the locked browser-equivalent environment. `SCANWORD_CONSTRUCTION_MODE` therefore defaulted to `legacy`, and both A/B sides bypassed `construction-portfolio.js`.

```text
runs:        30040602957, 30041156501
old head:    e212992d3d2a915a2c41d963b918d19ad89fb035
archive ref: refs/heads/research/archive-phase-10-complete-candidate-frontier-negative-2026-07-23
```

Those runs produced identical output and no frontier telemetry. They are retained only as evidence of the benchmark defect, not as an algorithmic negative result. The checkpoint now imports `research/baselines/v8-production-1.1/config.json`, requires `SCANWORD_CONSTRUCTION_MODE=portfolio`, and fails when frontier telemetry is absent.

The archive branch name was created before the harness defect was diagnosed; the ledger supersedes that label.

## Frozen development candidate

```text
implementation head: df537dd5f47712062fb6224d4e42cb67e41876b3
archive ref:         refs/heads/research/archive-phase-10-complete-pipeline-frontier-evidence-2026-07-23
workflow run:        30041412327
artifact ID:         8577595347
artifact digest:     sha256:4fb0d6398cfdf5bd2f16f990969aa712242a68ec7dec9539d5600f54ba895429
baseline:            v8-production-1.1-explicit-browser-equivalent
```

## Valid development-20 result

| metric | Phase 9 | frontier | result |
| --- | ---: | ---: | ---: |
| complete pairs | 20 | 20 | 20/20 |
| invalid / disconnected / non-exact | 0 | 0 | green |
| canonical wins | — | — | **16** |
| canonical ties | — | — | 4 |
| canonical regressions | — | — | **0** |
| output changes | — | — | 16 |
| downstream selection changes | — | — | 16 |
| average residual panels | 5.30 | **4.65** | -0.65 |
| average answers | 47.45 | **48.35** | +0.90 |
| average crossings | 51.70 | **52.00** | +0.30 |
| average raw-letter coverage | 0.5063 | 0.5041 | -0.0023 |
| average formulaic short count | 0.00 | 0.05 | +0.05 |
| average editorial penalty | 408.9 | 424.6 | +15.7 |
| aggregate elapsed | 903.752 s | 1,055.255 s | ratio **1.1676** |

All twenty seeds considered between 77 and 129 checkpoint-passing construction candidates and retained exactly four bounded frontier members. Final selected member distribution was:

```text
member 0: 4 seeds
member 1: 5 seeds
member 2: 4 seeds
member 3: 7 seeds
```

The structural hierarchy explains the disclosed editorial trade-offs: candidates with fewer panels, or equal panels with more answers/crossings, may legitimately outrank a lower editorial penalty. Per-seed comparison still reports every editorial change. No seed regressed under the complete canonical objective.

Notable examples:

- `v8-dev-017`: 6 → 2 panels, 47 → 48 answers;
- `v8-dev-013` and `v8-dev-014`: two-panel reductions;
- `v8-dev-003`: equal 3 panels, 47 → 48 answers and 52 → 53 crossings;
- `v8-dev-019`: equal 4 panels and answer/crossing counts, but better raw coverage and editorial penalty.

## Development decision

Freeze the repair-potential frontier candidate and proceed to locked promotion-50 and stability-100. The development gate is decisively satisfied:

- complete validity, connectivity and exact clues;
- zero canonical regressions;
- sixteen reproducible retained-alternative wins;
- bounded width four;
- exact Phase 9 fallback preserved;
- runtime ratio below the phase cap.

The browser default remains off until promotion and stability are green.

## Telemetry

The selected result records:

- construction frontier vectors and provenance;
- every dominance or width rejection;
- residual-region topology and repair-potential dimensions;
- per-finalist downstream stages and elapsed time;
- final dominance relationships;
- selected frontier index;
- whether selection changed from member zero;
- shared legacy-guard cost.

The heavy transient candidate set is non-enumerable and is not serialized into normal production result payloads.

## Promotion protocol

The locked seed sets run sequentially:

```text
development-20
-> promotion-50
-> stability-100
```

Every set requires:

- all runs complete;
- 100% validity;
- one connected component;
- exact clues only;
- zero regression under the canonical complete objective;
- at least one retained-alternative win;
- deterministic bounded frontier telemetry;
- aggregate runtime ratio no greater than 1.35.

## Reproduction

```bash
node tools/complete-pipeline-frontier-test-v1.cjs
node tools/construction-stage-runtime-test-v2.cjs

SCANWORD_FRONTIER_CONCURRENCY=4 \
SCANWORD_FRONTIER_RUNTIME_RATIO=1.35 \
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4 \
SCANWORD_FRONTIER_REQUIRE_WIN=1 \
  node tools/complete-pipeline-frontier-checkpoint-v1.cjs \
  research/baselines/seed-sets/development-20.json \
  research-output/complete-pipeline-frontier/development-20.jsonl
```

## Known limitation

The current frontier boundary retains candidates after exact clue allocation and construction-level victim repair. It solves measured downstream candidate deletion, but it does **not yet** move exact clue allocation to only bounded structural finalists. The more efficient long-term sequence remains:

```text
structural alternatives
-> cheap feasibility
-> bounded frontier
-> exact clue allocation only for finalists
```

That optimization is not part of the frozen Phase 10 candidate and must not be claimed without separate parity and cost evidence.

## Status

Development candidate frozen. Promotion-50 and stability-100 are pending on the exact documentation head. The feature remains off by default and is not yet merged.
