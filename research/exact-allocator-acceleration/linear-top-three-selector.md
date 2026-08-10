# Phase 12 experiment — exact linear top-three selection

Status: **accepted; promoted to production default**

Source baseline:

```text
e270e07e4747c18d3d59a5a9c26a6d68b43e8a5e
```

Original research branch:

```text
agent/phase-12-linear-top-three-selector
```

## Hypothesis

The exact clue allocator assigns one RNG jitter to every available footprint candidate, fully sorts the jitter-ranked candidates, and then chooses one of the first three with one additional RNG draw.

Because only the first three sorted elements can affect the selected candidate, a linear bounded selector can preserve the exact result while avoiding full `O(n log n)` sorting work.

## Required equivalence

The experiment preserves:

- one jitter RNG draw for every available candidate, in original iteration order;
- the existing descending-rank comparator;
- the existing lexicographic signature tie-break;
- stable input-order behavior when comparator keys are equal;
- the final `Math.floor(random() * Math.min(3, length))` draw and choice;
- strict first-best restart behavior;
- byte-identical layout, grid, placed-answer, clue and geometry digests.

## Controls and production contract

The research implementation originally landed default-off. It was subsequently promoted unchanged to the browser and Node default:

```text
absent SCANWORD_EXACT_ALLOCATOR_SELECTOR -> linear-top-three
SCANWORD_EXACT_ALLOCATOR_SELECTOR=linear-top-three -> linear-top-three
SCANWORD_EXACT_ALLOCATOR_SELECTOR=off -> canonical stable full-sort rollback
SCANWORD_EXACT_ALLOCATOR_SELECTOR_DETAIL=summary|full
```

A selector-domain failure falls back to the canonical stable full sort for that domain. Summary mode avoids hot-path diagnostic counters; full detail is reserved for deterministic primitive tests.

## Primitive validation

The deterministic primitive test covers:

- 1,552 synthetic ranked domains from size 0 through 96;
- exact comparator ties and duplicate signatures;
- stable input-order preservation;
- input-array non-mutation;
- 48 complete allocator fixtures across restart counts 1, 2, 7 and 12;
- exact layout, grid and RNG-draw parity.

## Preserved measurement defects

### Hot-path instrumentation defect

The first production smoke recorded every selector RNG draw and comparison. Exact parity passed, and the selector was faster than the same-run canonical replay, but instrumentation made the independent runtime comparison invalid. Summary mode removed those counters from the authoritative hot path.

### Profile-boundary runtime defect

The first development-20 harness timed the shadow-profiled selector against an unprofiled canonical baseline. The corrected harness used three isolated runs per seed:

```text
canonical, profiler off       -> baseline runtime
selector, profiler off        -> candidate runtime and final parity
selector, shadow profiler on  -> independent per-call layout and RNG audit
```

These defects remain part of the evidence history and are not acceptance data.

## Exact implementation head

The selector implementation was frozen before the accepted corpus sequence at:

```text
5db8d25de2422ce1f62d21d4ffa2da7bb3cafb3e
```

Archived accepted research head:

```text
5efa28f684e9ab605acc8fe1c8b46a1c47a89a29
refs/heads/research/archive-phase-12-linear-top-three-selector-2026-07-30
```

Later research-branch commits changed evidence documentation and workflow boundaries, not the selector algorithm.

## Accepted development-20 checkpoint

```text
workflow run:    30517578909
artifact:        8749748555
artifact sha256: ccb42dd41e5a26bf28f7743cb3712da4e4bd5c322b79b01eb3bd8cfb3a3c21c5
```

| metric | result |
| --- | ---: |
| exact final-output parity | 20 / 20 |
| independent audit parity | 20 / 20 |
| exact allocator calls | 10,648 |
| aggregate allocator runtime ratio | 0.9590 |
| aggregate total runtime ratio | 0.9940 |
| selector fallbacks / errors | 0 / 0 |

Decision: development checkpoint passed.

## Accepted promotion-50 checkpoint

```text
workflow run:    30518444936
artifact:        8750320665
artifact sha256: 2d7008cff5455d8321b4babde8b36ff1580ea3db8e6815c3fe166040c40cf74e
```

| metric | result |
| --- | ---: |
| exact final-output parity | 50 / 50 |
| independent audit parity | 50 / 50 |
| exact allocator calls | 26,521 |
| aggregate allocator runtime ratio | 0.9500 |
| aggregate total runtime ratio | 0.9900 |
| selector fallbacks / errors | 0 / 0 |

Decision: promotion checkpoint passed.

## Accepted stability-100 checkpoint

```text
workflow run:    30520073731
artifact:        8752036962
artifact sha256: f54cad7882f25cf63a0412febf75a501e0620b195f44ce1a16bf7dce09a4d6d4
```

| metric | result |
| --- | ---: |
| exact final-output parity | 100 / 100 |
| independent audit parity | 100 / 100 |
| exact allocator calls | 53,622 |
| aggregate allocator runtime ratio | 0.9562 |
| aggregate total runtime ratio | 0.9891 |
| selector fallbacks / errors | 0 / 0 |

Decision: stability checkpoint passed. Exact-allocation time fell 4.38% aggregate and total runtime fell 1.09% aggregate over the locked 100-seed holdout. Every final digest and every independent allocator audit remained identical.

## Production promotion outcome

The accepted implementation was promoted unchanged through PR `#29`.

Frozen promotion head:

```text
77616780d11377f1fe44bcd74d17ba8f0adb5cae
refs/heads/research/archive-phase-12-exact-selector-default-promotion-2026-07-31
```

Integrated production-default merge:

```text
125177d5fecdcb1e7a6930bd8f257427093ae7e2
```

The separate promotion gate passed rollback parity and independent audit parity on development-20, promotion-50 and stability-100 with zero fallbacks/errors.

## Conclusion

The exact linear top-three selector passed the complete 20/50/100 research sequence without tuning, output drift, RNG drift, fallback or error and was promoted unchanged to the production default.

Explicit `SCANWORD_EXACT_ALLOCATOR_SELECTOR=off` remains the exact canonical stable full-sort rollback.

Phase 12 continued with the occupancy-index experiment and concluded after its stability-100 checkpoint. See `occupancy-index.md` and the Phase 12 closure milestone for the final research decision.
