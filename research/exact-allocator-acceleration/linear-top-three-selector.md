# Phase 12 experiment — exact linear top-three selection

Status: accepted research candidate; development, promotion and stability checkpoints passed

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

## Exact implementation head

The selector implementation was frozen before the accepted corpus sequence at:

```text
5db8d25de2422ce1f62d21d4ffa2da7bb3cafb3e
```

Later branch commits change only evidence documentation and workflow dispatch boundaries.

## Accepted development-20 checkpoint

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

## Accepted promotion-50 checkpoint

Evidence:

```text
workflow run:    30518444936
artifact:        8750320665
artifact sha256: 2d7008cff5455d8321b4babde8b36ff1580ea3db8e6815c3fe166040c40cf74e
```

| metric | result |
| --- | ---: |
| exact final-output parity | 50 / 50 |
| independent shadow-audit output parity | 50 / 50 |
| selector-valid seeds | 50 / 50 |
| profiler-valid seeds | 50 / 50 |
| selector fallbacks | 0 |
| selector errors | 0 |
| exact allocator calls | 26,521 |
| aggregate allocator runtime ratio | 0.9500 |
| median allocator runtime ratio | 0.9487 |
| allocator-faster seeds | 48 / 50 |
| aggregate total runtime ratio | 0.9900 |
| median total runtime ratio | 0.9945 |
| total-runtime-faster seeds | 32 / 50 |
| audit selector / canonical replay ratio | 0.7562 |

Decision: **promotion checkpoint passed**. Exact-allocation time fell 5.00% aggregate and total runtime fell 1.00% aggregate. Every final and audited allocator result remained identical.

## Accepted stability-100 checkpoint

Evidence:

```text
workflow run:    30520073731
artifact:        8752036962
artifact sha256: f54cad7882f25cf63a0412febf75a501e0620b195f44ce1a16bf7dce09a4d6d4
```

| metric | result |
| --- | ---: |
| exact final-output parity | 100 / 100 |
| independent shadow-audit output parity | 100 / 100 |
| selector-valid seeds | 100 / 100 |
| profiler-valid seeds | 100 / 100 |
| selector fallbacks | 0 |
| selector errors | 0 |
| exact allocator calls | 53,622 |
| aggregate allocator runtime ratio | 0.9562 |
| median allocator runtime ratio | 0.9606 |
| aggregate total runtime ratio | 0.9891 |
| median total runtime ratio | 0.9941 |
| audit selector / canonical replay ratio | 0.7327 |

Decision: **stability checkpoint passed**. Exact-allocation time fell 4.38% aggregate and total runtime fell 1.09% aggregate over the locked 100-seed holdout. Every final digest and every independent allocator audit remained identical.

## Conclusion

The exact linear top-three selector passed the complete 20/50/100 corpus sequence without tuning, output drift, RNG drift, fallback or error. This PR should land the default-off implementation and evidence. Production activation belongs in a separate branch with an explicit default-promotion gate and rollback contract.

## Evidence sequence

1. **passed:** deterministic primitive equivalence;
2. **passed:** exact replay parity and inherited contracts;
3. **passed:** frozen one-seed production smoke after measurement correction;
4. **passed:** frozen development-20 runtime and digest comparison;
5. **passed:** frozen promotion-50 without tuning;
6. **passed:** frozen stability-100 without tuning;
7. **next branch:** controlled production default promotion with unchanged selector implementation.