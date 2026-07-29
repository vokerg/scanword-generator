# Phase 12 — exact allocator acceleration

Status: active research

Started: 2026-07-29

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

## Initial hypotheses

The exact allocator may repeat work that is immutable for a fixed candidate geometry across deterministic restarts:

- clue-footprint geometry and legal text-cell domains;
- pairwise overlap and compatibility checks;
- static answer-to-domain ordering inputs;
- matching-stage feasibility data;
- restart-invariant lower bounds used before or during search.

The first implementation step is telemetry only. It must identify where time and calls are spent by geometry, restart and matching/search stage without changing RNG consumption, traversal order, selected layouts or digests.

## Planned investigation

1. Locate the complete `assignClueTextCellsV2` call graph and restart boundary.
2. Add default-off allocation telemetry with deterministic counters and timing summaries.
3. Create fresh Phase 12 development, promotion and stability seed manifests before tuning.
4. Measure repeated immutable work across restarts and candidates.
5. Introduce one bounded optimization at a time behind an explicit default-off flag.
6. Require exact digest parity before considering runtime evidence.
7. Preserve the exact implementation head under an immutable `research/archive-*` ref before documentation-only closure commits.

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

No optimization has been implemented or promoted yet. Record each experiment here with:

- exact source commit and feature flags;
- corpus, configuration and seed digests;
- baseline and candidate allocator counters;
- runtime median, p95 and maximum;
- per-seed digest parity and regressions;
- workflow run, artifact ID and reproduction command;
- explicit promote, reject or defer decision.
