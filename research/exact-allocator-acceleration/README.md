# Phase 12 — exact allocator acceleration

Status: active research

Started: 2026-07-29

Draft PR: `#26`

Source branch:

```text
agent/phase-12-exact-allocator-acceleration
```

Source baseline:

```text
ab9f43f525280a674c49ecd7304f62cc4eb0c15c
```

## Question

Can `assignClueTextCellsV2` be accelerated internally while preserving byte-identical selected outputs, deterministic restart behavior, complete validation and existing production ownership?

Phase 11 showed that skipping pre-allocation candidates can reduce allocator work, but one locked stability seed changed the canonical winner. Phase 12 therefore keeps the candidate set and final comparison unchanged and focuses only on eliminating repeated exact-allocation work.

## Non-negotiable acceptance hierarchy

1. Byte-identical grid, placed-answer, clue and geometry digests.
2. Valid, connected, exact-clue-only outputs.
3. No change to production ownership, rollback controls or complete validation.
4. Lower allocator time and total runtime.
5. Promotion only after fresh development, promotion and stability holdouts.

Phase 11 promotion and stability seeds, including `v8-stability-058`, are not tuning data for this phase.

## Initial call-graph finding

The active production portfolio allocates clue text once for every structurally eligible base or fallback state and again for every generated victim-replacement finalist. Targeted downstream victim repair also invokes the same allocator. The allocator currently:

```text
build panel-region sizes once
-> enumerate up to 96 clue-footprint domains per clue item
-> run 120/160 randomized greedy restarts
-> filter every candidate footprint against occupied cells
-> rank every available candidate with RNG jitter
-> retain the strict first best score
-> apply the selected footprints
```

Phase 11 measured complete allocator calls and elapsed time at the boundary, but did not separate immutable region/domain construction from per-restart ordering, availability filtering and ranking. That is the first Phase 12 observability gap.

## Default-off shadow profiler

The first implementation is telemetry only:

```text
construction-exact-allocator-profile-v1.js
```

Controls:

```text
SCANWORD_EXACT_ALLOCATOR_PROFILE=off      # canonical default
SCANWORD_EXACT_ALLOCATOR_PROFILE=shadow   # record and replay exact allocator work
SCANWORD_EXACT_ALLOCATOR_PROFILE_DETAIL=summary
SCANWORD_EXACT_ALLOCATOR_PROFILE_DETAIL=full
```

Shadow mode records every random draw used by the authoritative allocator, returns the authoritative result unchanged, then replays the exact algorithm on a cloned pre-allocation state. The replay measures:

- panel-region and footprint-domain construction time;
- clue items, footprint candidates and zero-domain items;
- per-restart ordering, availability filtering and ranking time;
- candidate availability checks, available/ranked candidates and assignments;
- best-score updates, covered cells and assigned clues;
- application time and total replay time;
- exact layout/grid parity and random-draw parity.

Heavy observations are attached non-enumerably to the allocated grid. Compact process-wide aggregates are exposed through `ScanwordSolver.currentExactAllocatorProfileV1()`. Replay errors fail open and never replace or mutate the authoritative returned layout.

No optimization has been implemented or promoted. Browser and Node defaults remain `off`.

## Planned investigation

1. **Completed:** locate the complete `assignClueTextCellsV2` call graph and restart boundary.
2. **Implemented, validation pending:** add default-off allocation telemetry with deterministic counters and timing summaries.
3. Create fresh Phase 12 development, promotion and stability seed manifests before tuning.
4. Measure repeated immutable work across restarts and candidates.
5. Introduce one bounded optimization at a time behind an explicit default-off flag.
6. Require exact digest parity before considering runtime evidence.
7. Preserve the exact implementation head under an immutable `research/archive-*` ref before documentation-only closure commits.

## Profiler validation

```bash
node --check construction-exact-allocator-profile-v1.js
node --check tools/exact-allocator-profile-test-v1.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-profile-test-v1.cjs
```

The primitive test requires exact replayed layout/grid parity, exact random-draw consumption, full restart summaries in diagnostic mode and zero observations when the feature is off.

## Required baseline gates

```bash
node tools/preallocation-structural-frontier-test-v1.cjs
node tools/preallocation-repair-potential-test-v1.cjs
node tools/preallocation-ranked-frontier-test-v1.cjs
node tools/preallocation-filter-test-v1.cjs
node tools/complete-pipeline-frontier-test-v1.cjs
node tools/construction-stage-runtime-test-v2.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/wrapper-retirement-test-v1.cjs
```

Every changed JavaScript or CommonJS file must also pass `node --check` and its matching deterministic primitive test.

## Evidence ledger

Record each experiment here with:

- exact source commit and feature flags;
- corpus, configuration and seed digests;
- baseline and candidate allocator counters;
- runtime median, p95 and maximum;
- per-seed digest parity and regressions;
- workflow run, artifact ID and reproduction command;
- explicit promote, reject or defer decision.
