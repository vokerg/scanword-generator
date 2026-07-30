# Phase 12 experiment — exact linear top-three selection

Status: active research

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

The candidate implementation must remain default-off and fail open to the canonical allocator on any internal error.

## Evidence sequence

1. deterministic primitive equivalence, including exact ties and duplicate signatures;
2. exact replay parity and inherited Phase 10/11 contract gates;
3. frozen one-seed production-path smoke;
4. frozen development-20 runtime and digest comparison;
5. promotion or rejection before any promotion/stability holdout is opened.
