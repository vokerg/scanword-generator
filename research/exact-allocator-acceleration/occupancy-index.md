# Phase 12 — exact allocator occupancy index

Status: active bounded research

Source main:

```text
125177d5fecdcb1e7a6930bd8f257427093ae7e2
```

## Motivation

The accepted Phase 12 profile observed 442,103,640 candidate availability checks across development-20. Exact linear top-three selection reduced ranking cost and is now the production default, but candidate compatibility is still recomputed by scanning every footprint key against the occupied-cell set during every restart.

## Hypothesis

Maintain exact candidate availability through a deterministic occupancy compatibility index so each assignment invalidates only candidates that overlap newly occupied cells.

The index may reduce repeated key scans, but it must not change:

- item or candidate order;
- candidate scores or signatures;
- restart order;
- jitter RNG draws or final selection draws;
- stable top-three comparator behavior;
- strict first-best restart selection;
- final layout, grid, clue, placed-answer or geometry digests;
- validator, ownership or rollback behavior.

## Research control

Planned default-off mode:

```text
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=indexed
```

`off` remains the current exact production selector path. Any index-domain error must fail open to the canonical ordered availability filter for the current allocator call.

## Initial evidence plan

1. deterministic primitive over overlapping and disjoint candidate domains;
2. exact ordered availability parity after arbitrary assignment sequences;
3. exact RNG-draw and allocator-layout parity on complete fixtures;
4. frozen development-20 measurement only after primitive parity passes;
5. no tuning on promotion-50 or stability-100;
6. archive the exact implementation head before evidence-only closure commits.

## Acceptance boundary

The candidate advances only if every tested seed preserves byte-identical output and independent per-call RNG/layout parity with zero fallback or index errors, while reducing allocator time without a material total-runtime regression.
