# Canonical continuation handoff

Last updated: 2026-07-25

This file is the first handoff to read in a new chat or coding session. All accepted production code, retained research code, evidence ledgers, tests, rollback controls and the next plan are on `main`. Phase 11 was squash-merged through PR #24 as commit `9e79abb50f3b360e8a7a07292557cecb7f516174`.

## Current production baseline

Production remains Phase 10 / complete frontier 1.3.

```text
40,966-entry attributed corpus v8
-> deterministic 2,500/3,500 working sets
-> indexed construction and exact clue allocation
-> width-four repair-potential complete-pipeline frontier
-> full clue, repair and editorial chain per finalist
-> complete validation
-> canonical panel-first comparison
```

Canonical flags:

```text
SCANWORD_EXPLICIT_PIPELINE=on
SCANWORD_PIPELINE_STAGE_RUNTIME=explicit
SCANWORD_WRAPPER_INSTALLATION_LOCK=explicit-pipeline-v1
SCANWORD_COMPLETE_PIPELINE_FRONTIER=on
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off
SCANWORD_FULL_CORPUS_RETRIEVAL=off
SCANWORD_CLUE_FEASIBILITY=off
SCANWORD_PARTIAL_SEARCH=off
```

Production ownership:

```text
active generateBest owner: construction-pipeline-v1
execution owner:            direct-production-stage-runtime-v2
rollback owner:             legacy-wrapper-chain
```

## Phase 11 closure

Phase 11 investigated a structural frontier before exact clue allocation. Its implementation and diagnostics are retained, but production promotion is rejected.

Frozen implementation:

```text
5f8fb8dcb446d1dcf13e1ef5fc1cee0c151906e4
refs/heads/research/archive-phase-11-preallocation-structural-filter-evidence-2026-07-25
```

Final evidence run:

```text
30149057113
```

| seed set | exact parity | total call reduction | runtime ratio |
| --- | ---: | ---: | ---: |
| development-20 | 20/20 | 48.46% | 0.9146 |
| promotion-50 | 50/50 | 48.79% | 0.9306 |
| stability-100 | 99/100 | 48.98% | 0.9442 |

The stability failure is genuine:

```text
v8-stability-058: 4 panels -> 7 panels
```

Do not widen or tune the filter using that seed. The Phase 11 feature remains default-off:

```text
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off
```

Detailed ledger:

```text
research/preallocation-structural-frontier/README.md
docs/milestones/phase-11-preallocation-research-closure.md
```

## Next phase: exact allocator acceleration

The next investigation should optimize exact clue allocation internally, not skip candidate states.

Working title:

```text
Phase 12 — exact allocator acceleration
```

Required direction:

```text
profile assignClueTextCellsV2
-> cache immutable geometry-derived domains and compatibility data
-> reuse safe work across deterministic restarts
-> add admissible branch-and-bound pruning
-> preserve RNG sequence and exact winning layout
-> validate byte-identical output
```

Acceptance hierarchy:

1. byte-identical grid, placed-answer, clue and geometry digests;
2. valid, connected, exact-clue-only outputs;
3. no ownership, rollback or validator change;
4. lower allocator time and total runtime;
5. fresh development/promotion/stability holdouts.

Do not use `v8-stability-058` or any Phase 11 promotion/stability seed for tuning. Create new Phase 12 seed sets before optimization.

Suggested first steps:

```text
1. branch from current main;
2. profile allocation time by geometry, restart and matching stage;
3. identify immutable computations repeated across restarts;
4. add default-off telemetry only;
5. prove exact parity on new development seeds before enabling any optimization;
6. archive the exact implementation head before documentation-only commits;
7. squash-merge one logical Phase 12 block.
```

## Required commands before a Phase 12 PR

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

## Archive and branch state

Accepted Phase 0–10 implementations are already preserved by immutable refs in `research/archive-manifest.json`.

Phase 11 and superseded unmerged lines are preserved at:

```text
research/archive-phase-11-preallocation-structural-filter-evidence-2026-07-25
research/archive-phase-11-preallocation-structural-filter-closure-2026-07-25
research/archive-phase-11-preallocation-structural-filter-final-2026-07-25
research/archive-phase-11-integration-main-2026-07-25
research/archive-superseded-explicit-pipeline-roadmap-2026-07-25
research/archive-superseded-phase-8-explicit-stage-migration-2026-07-25
research/archive-superseded-selected-grid-editorial-quality-1.2-2026-07-25
research/archive-superseded-vocabulary-greatness-1.1-2026-07-25
```

The old planning PR #11 is closed as superseded. PR #24 was squash-merged into `main` as `9e79abb50f3b360e8a7a07292557cecb7f516174`. Start Phase 12 only from the current `main` head.

## Non-negotiable rules

- `main` is the only long-lived development branch.
- Archive refs are immutable evidence, not active development lines.
- Do not weaken complete validation.
- Do not replace the canonical lexicographic objective with a weighted score.
- Do not tune on promotion or stability seeds.
- Preserve negative results and harness defects.
- Every merge to `main` must be a squash representing one logical phase or documentation block.
