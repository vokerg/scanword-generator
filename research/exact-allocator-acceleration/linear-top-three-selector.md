# Phase 12 experiment — exact linear top-three selection

Status: active research; development checkpoint passed

Source baseline:

```text
e270e07e4747c18d3d59a5a9c26a6d68b43e8a5e
```

Branch:

```text
agent/phase-12-linear-top-three-selector
```

## Hypothesis

The exact clue allocator currently assigns one RNG jitter to every available footprint candidate, fully sorts the jitter-ranked candidates, and then chooses one of the first three with one additional RNG draw.

Because only the first three sorted elements can affect the selected candidate, a linear bounded selector may preserve the exact result while avoiding full `O(n log n)` sorting work.

## Required equivalence

The experiment must preserve:

- one jitter RNG draw for every available candidate, in original iteration order;
- the existing descending-rank comparator;
- the existing lexicographic signature tie-break;
- stable input-order behavior when comparator keys are equal;
- the final `Math.floor(random() * Math.min(3, length))` draw and choice;
- strict first-best restart behavior;
- byte-identical layout, grid, placed-answer, clue and geometry digests.

## Controls

The implementation is default-off:

```text
SCANWORD_EXACT_ALLOCATOR_SELECTOR=off
SCANWORD_EXACT_ALLOCATOR_SELECTOR=linear-top-three
SCANWORD_EXACT_ALLOCATOR_SELECTOR_DETAIL=summary|full
```

A selector failure falls back to the canonical stable full sort for that domain. Summary mode avoids hot-path diagnostic counters; full detail is reserved for deterministic primitive tests.

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

The first production smoke recorded every selector RNG draw and comparison. Exact parity passed, and the selector was faster than the same-run canonical replay, but instrumentation made the independent runtime comparison invalid. Summary mode now removes those counters from the authoritative hot path.

### Profile-boundary runtime defect

The first development-20 harness timed the shadow-profiled selector against an unprofiled canonical baseline. The profiler's RNG recorder made the candidate appear 8.44% slower even though it was 24.11% faster than the canonical replay in the same process.

The corrected harness uses three isolated runs per seed:

```text
canonical, profiler off       -> baseline runtime
selector, profiler off        -> candidate runtime and final parity
selector, shadow profiler on  -> independent per-call layout and RNG audit
```

## Accepted development-20 checkpoint

Exact candidate head:

```text
5db8d25de2422ce1f62d21d4ffa2da7bb3cafb3e
```

Evidence:

```text
workflow run:    30517578909
artifact:        8749748555
artifact sha256: ccb42dd41e5a26bf28f7743cb3712da4e4bd5c322b79b01eb3bd8cfb3a3c21c5
```

| metric | result |
| --- | ---: |
| exact final-output parity | 20 / 20 |
| independent shadow-audit output parity | 20 / 20 |
| selector-valid seeds | 20 / 20 |
| profiler-valid seeds | 20 / 20 |
| selector fallbacks | 0 |
| selector errors | 0 |
| exact allocator calls | 10,648 |
| aggregate allocator runtime ratio | 0.9590 |
| median allocator runtime ratio | 0.9551 |
| aggregate total runtime ratio | 0.9940 |
| median total runtime ratio | 0.9935 |
| audit selector / canonical replay ratio | 0.7297 |

Decision: **development checkpoint passed**. The selector reduced measured exact-allocation time by 4.10% aggregate and total runtime by 0.60% while preserving every final digest and every audited allocator result.

## Evidence sequence

1. **passed:** deterministic primitive equivalence;
2. **passed:** exact replay parity and inherited contracts;
3. **passed:** frozen one-seed production smoke after measurement correction;
4. **passed:** frozen development-20 runtime and digest comparison;
5. **next:** frozen promotion-50;
6. stability-100 opens only if promotion passes without tuning.
