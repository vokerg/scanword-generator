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

## Frozen Phase 12 seed boundary

Fresh seed sets were derived and committed before optimization work:

```text
development: 20
promotion:   50
stability:  100
```

Manifest:

```text
research/exact-allocator-acceleration/seed-manifest-v1.json
```

Canonical manifest digest:

```text
389647aadef2a55df6f8f7ba3e5dd6c3f26ad86cd9b53030a22f58a9e754d2e9
```

The deterministic materializer and verifier is `tools/phase-12-seed-manifest-v1.cjs`. The seed namespace, split counts, derivation and digest are frozen before any cache or pruning candidate is introduced.

## Frozen-seed profiling checkpoint

`tools/exact-allocator-profile-checkpoint-v1.cjs` runs each selected seed twice:

```text
canonical profile-off baseline
-> profile-shadow authoritative run plus exact replay
-> exact final-output digest comparison
-> per-call replay and RNG parity validation
-> aggregate immutable setup, restart search and application work
```

The checkpoint does not treat shadow overhead as an optimization result. Its purpose is to establish where authoritative allocator work is spent and to reject any profiler or wrapper behavior that changes selected output.

Reproduce the frozen development split:

```bash
node tools/exact-allocator-profile-checkpoint-v1.cjs \
  development \
  research-output/exact-allocator-acceleration/development-profile-v1.jsonl
```

The Phase 12 workflow exposes this as a manual `development-profile` job and uploads the JSONL evidence artifact.

## Planned investigation

1. **Completed:** locate the complete `assignClueTextCellsV2` call graph and restart boundary.
2. **Completed:** add default-off allocation telemetry with deterministic counters and timing summaries.
3. **Completed:** freeze fresh Phase 12 development, promotion and stability seed manifests before tuning.
4. **Ready to execute:** measure repeated immutable work across restarts and candidates on development-20.
5. Introduce one bounded optimization at a time behind an explicit default-off flag.
6. Require exact digest parity before considering runtime evidence.
7. Preserve the exact implementation head under an immutable `research/archive-*` ref before documentation-only closure commits.

## Profiler validation

Primitive validation passed in workflow run:

```text
30421463278
```

The job proved exact replayed layout/grid parity, exact random-draw consumption, full restart summaries in diagnostic mode, frozen seed-manifest integrity and zero observations when the feature is off.

Local commands:

```bash
node --check construction-exact-allocator-profile-v1.js
node --check tools/construction-pipeline-seed-v1.cjs
node --check tools/exact-allocator-profile-test-v1.cjs
node --check tools/exact-allocator-profile-checkpoint-v1.cjs
node --check tools/phase-12-seed-manifest-v1.cjs
node tools/phase-12-seed-manifest-v1.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-profile-test-v1.cjs
```

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
