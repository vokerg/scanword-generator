# Phase 12 — exact allocator occupancy index

Status: **development and promotion accepted; stability running**

Source main:

```text
125177d5fecdcb1e7a6930bd8f257427093ae7e2
```

Frozen implementation:

```text
implementation head: a5826b4e250ce39da71edfa0aa715c12146c7992
module Git blob:    c755c2148e8e4039b9de4fb0c96b3cb7f900d401
archive ref:        research/archive-phase-12-exact-occupancy-index-implementation-2026-07-31
```

No implementation tuning occurred after the one-seed smoke, during development-20 or after promotion-50.

## Motivation

The accepted Phase 12 profile observed 442,103,640 candidate availability checks across development-20. Exact linear top-three selection reduced ranking cost and is now the production default, but candidate compatibility was still recomputed by scanning every footprint key against the occupied-cell set during every restart.

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

The implementation preserves:

- item and candidate order;
- candidate scores and signatures;
- restart order;
- jitter RNG draws and final selection draws;
- stable top-three comparator behavior;
- strict first-best restart selection;
- final layout, grid, clue, placed-answer and geometry digests;
- validator, ownership and rollback behavior.

Validated index-build errors fail open to the current exact production selector before any allocator RNG draw is consumed.

## Research control

```text
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=indexed
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY_DETAIL=summary|full
```

Browser and Node defaults remain `off`. Runtime order is:

```text
accepted linear top-three selector
-> default-off occupancy candidate
-> independent shadow profiler
```

## Primitive evidence

Exact-head workflow run:

```text
30607535216
```

| check | result |
| --- | ---: |
| synthetic candidates | 12,288 |
| arbitrary assignments | 912 |
| complete allocator fixtures | 48 |
| ordered candidate lookups | 55,968 |
| overlap invalidations | 40,185 |
| layout mismatches | 0 |
| grid mismatches | 0 |
| RNG-draw mismatches | 0 |
| fallbacks / errors | 0 / 0 |

## One-seed smoke

```text
workflow run:    30607677892
artifact:        8784452207
artifact sha256: 50f7f4db34f8dcfa4957ac53ff4d5290c7944bc4f648411e32d583d4bf55193e
```

| metric | result |
| --- | ---: |
| exact output parity | 1 / 1 |
| independent audit parity | 1 / 1 |
| exact allocation calls | 531 |
| allocator runtime ratio | 0.7137 |
| total runtime ratio | 0.9618 |
| fallbacks / errors | 0 / 0 |

## Development-20 evidence

```text
workflow run:    30608459402
artifact:        8784837298
artifact sha256: 8484e49e764e18f2cae1cbc5e661a6d21db44e3db9301bfb7de3cc8911af34c4
seed manifest:   sha256:389647aadef2a55df6f8f7ba3e5dd6c3f26ad86cd9b53030a22f58a9e754d2e9
```

| metric | result |
| --- | ---: |
| exact output parity | 20 / 20 |
| independent audit parity | 20 / 20 |
| valid occupancy telemetry | 20 / 20 |
| valid shadow profile | 20 / 20 |
| exact allocation calls | 10,648 |
| canonical allocator time | 112,317.045 ms |
| indexed allocator time | 99,346.651 ms |
| aggregate allocator ratio | **0.8845** |
| median allocator ratio | 0.8853 |
| aggregate total-runtime ratio | **0.9937** |
| median total-runtime ratio | 0.9948 |
| fallbacks / index errors | 0 / 0 |
| profiler parity / RNG / errors | 0 / 0 / 0 |
| indexed candidate references | 7,080,138 |

Allocator improvement occurred on all 20 seeds. Per-seed allocator ratios ranged from 0.8325 to 0.9148. Total runtime improved on 11/20 seeds, while aggregate total runtime remained below parity.

## Promotion-50 evidence

```text
workflow run:    30609555514
artifact:        8785624567
artifact sha256: 92545f20c92dba054760b1c0be6c1202a62d28eb8c1ea4f955401d1c3b9bfdcf
seed manifest:   sha256:389647aadef2a55df6f8f7ba3e5dd6c3f26ad86cd9b53030a22f58a9e754d2e9
```

| metric | result |
| --- | ---: |
| exact output parity | 50 / 50 |
| independent audit parity | 50 / 50 |
| valid occupancy telemetry | 50 / 50 |
| valid shadow profile | 50 / 50 |
| exact allocation calls | 26,521 |
| canonical allocator time | 282,323.361 ms |
| indexed allocator time | 248,829.023 ms |
| aggregate allocator ratio | **0.8814** |
| median allocator ratio | 0.8871 |
| aggregate total-runtime ratio | **0.9856** |
| median total-runtime ratio | 0.9923 |
| fallbacks / index errors | 0 / 0 |
| profiler parity / RNG / errors | 0 / 0 / 0 |
| indexed candidate references | 17,711,548 |

Promotion preserved every output and independent per-call audit. The indexed allocator reduced aggregate allocator time by 11.86% and aggregate total runtime by 1.44%.

## Stability-100 execution

```text
workflow run: 30880073579
source head:  caca0dfb336d82041a29400c3d235b6173d599c8
module blob:  c755c2148e8e4039b9de4fb0c96b3cb7f900d401
```

The exact-head primitive gate passed. Promotion-50 is manual-only and skipped on this run. Stability-100 is the sole active holdout job.

## Decision

The frozen candidate is in the final stability-100 holdout without implementation changes. Stability must preserve exact output and independent audit parity, retain zero fallback/error counts and remain within the predeclared 1.10 allocator and total-runtime gates.

This is the final Phase 12 experiment. After its acceptance or rejection, algorithm experimentation stops and the repository moves to production hardening and release.
