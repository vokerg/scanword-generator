# Phase 12 — exact allocator occupancy index

Status: **accepted; Phase 12 experimentation concluded**

Source main:

```text
125177d5fecdcb1e7a6930bd8f257427093ae7e2
```

Frozen implementation and evidence:

```text
implementation head: a5826b4e250ce39da71edfa0aa715c12146c7992
module Git blob:    c755c2148e8e4039b9de4fb0c96b3cb7f900d401
implementation ref: research/archive-phase-12-exact-occupancy-index-implementation-2026-07-31
stability head:     2036baa507a829abd6966a74911d0aee06054984
stability ref:      research/archive-phase-12-exact-occupancy-index-stability-2026-08-04
```

No implementation tuning occurred after the one-seed smoke, during development-20, after promotion-50 or after stability-100.

## Motivation

The accepted Phase 12 profile observed 442,103,640 candidate availability checks across development-20. Exact linear top-three selection reduced ranking cost and became the production default, but candidate compatibility was still recomputed by scanning every footprint key against the occupied-cell set during every restart.

## Candidate

Maintain exact candidate availability through a deterministic occupancy compatibility index:

```text
build stable candidate IDs in original item/domain order
-> build one immutable cell-to-candidate reference map per allocator call
-> reuse a generation-tagged blocked vector across restarts
-> invalidate only candidates overlapping newly occupied cells
-> enumerate survivors in original candidate order
-> use the accepted exact linear top-three selector unchanged
```

The implementation preserves item and candidate order, scores, signatures, restart order, every RNG draw, stable comparison behavior, strict first-best selection, final output digests, validation, ownership and rollback behavior.

Validated index-build errors fail open to the current exact production selector before any allocator RNG draw is consumed.

## Research control

```text
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=indexed
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY_DETAIL=summary|full
```

Browser and Node defaults remain `off` in this integration PR. Runtime order is accepted selector, default-off occupancy index, then independent shadow profiler.

## Primitive evidence

```text
workflow run: 30607535216
synthetic candidates: 12,288
arbitrary assignments: 912
complete allocator fixtures: 48
ordered candidate lookups: 55,968
overlap invalidations: 40,185
layout/grid/RNG mismatches: 0/0/0
fallbacks/errors: 0/0
```

## One-seed smoke

```text
workflow run:    30607677892
artifact:        8784452207
artifact sha256: 50f7f4db34f8dcfa4957ac53ff4d5290c7944bc4f648411e32d583d4bf55193e
allocator ratio: 0.7137
total ratio:     0.9618
```

## Development-20 evidence

```text
workflow run:    30608459402
artifact:        8784837298
artifact sha256: 8484e49e764e18f2cae1cbc5e661a6d21db44e3db9301bfb7de3cc8911af34c4
```

| metric | result |
| --- | ---: |
| exact output parity | 20 / 20 |
| independent audit parity | 20 / 20 |
| exact allocation calls | 10,648 |
| aggregate allocator ratio | **0.8845** |
| median allocator ratio | 0.8853 |
| aggregate total-runtime ratio | **0.9937** |
| median total-runtime ratio | 0.9948 |
| fallbacks / index errors | 0 / 0 |
| profiler parity / RNG / errors | 0 / 0 / 0 |

## Promotion-50 evidence

```text
workflow run:    30609555514
artifact:        8785624567
artifact sha256: 92545f20c92dba054760b1c0be6c1202a62d28eb8c1ea4f955401d1c3b9bfdcf
```

| metric | result |
| --- | ---: |
| exact output parity | 50 / 50 |
| independent audit parity | 50 / 50 |
| exact allocation calls | 26,521 |
| aggregate allocator ratio | **0.8814** |
| median allocator ratio | 0.8871 |
| aggregate total-runtime ratio | **0.9856** |
| median total-runtime ratio | 0.9923 |
| fallbacks / index errors | 0 / 0 |
| profiler parity / RNG / errors | 0 / 0 / 0 |

Promotion preserved every output and independent per-call audit. The indexed allocator reduced aggregate allocator time by 11.86% and aggregate total runtime by 1.44%.

## Stability-100 evidence

```text
workflow run:    30880501195
source head:     2036baa507a829abd6966a74911d0aee06054984
artifact:        8882662669
artifact sha256: d7d66c6c4c9edb8d7c9402b2f9c1d70ec72050e9cfd8c8d11bcaabcedd878366
```

| metric | result |
| --- | ---: |
| exact output parity | 100 / 100 |
| independent audit parity | 100 / 100 |
| valid selector / occupancy / profile telemetry | 100 / 100 |
| canonical occupancy absent | 100 / 100 |
| exact allocation calls | 53,622 |
| canonical allocator time | 567,950.101 ms |
| indexed allocator time | 511,834.919 ms |
| aggregate allocator ratio | **0.9012** |
| median allocator ratio | 0.9038 |
| canonical total runtime | 5,147,075 ms |
| indexed total runtime | 5,059,637 ms |
| aggregate total-runtime ratio | **0.9830** |
| median total-runtime ratio | 0.9855 |
| indexed candidate references | 35,772,881 |
| fallbacks / index errors | 0 / 0 |
| profiler parity / RNG / errors | 0 / 0 / 0 |

Stability preserved every final output and independent per-call audit across all 100 holdout seeds. The indexed allocator reduced aggregate allocator time by 9.88% and aggregate total runtime by 1.70%.

## Decision

The frozen occupancy index is accepted as an exact, reversible, default-off implementation. Development-20, promotion-50 and stability-100 all met the predeclared exactness and 1.10 runtime gates with no fallback, error, parity or RNG failures.

Stability-100 concludes Phase 12 experimentation. Expensive promotion and stability checkpoints are manual-only; normal pull requests retain the lightweight exact primitive and parity gate. Further algorithm experimentation is out of scope unless a concrete production defect or measured product requirement establishes a new need.
