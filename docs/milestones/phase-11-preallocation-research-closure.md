# Phase 11 research closure — pre-allocation structural frontier

Date: 2026-07-25

Status: closed investigation; not a production milestone.

## Decision

Retain the Phase 11 instrumentation, deterministic selectors, authoritative filter implementation, tests and benchmark harness on `main` as default-off research. Do not promote the width-96 filter to the browser default.

Canonical production remains milestone 1.3 / Phase 10:

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=on
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off
```

## Evidence boundary

Frozen implementation:

```text
5f8fb8dcb446d1dcf13e1ef5fc1cee0c151906e4
refs/heads/research/archive-phase-11-preallocation-structural-filter-evidence-2026-07-25
```

Final locked workflow:

```text
30149057113
```

| seed set | exact parity | allocation reduction | runtime ratio | decision |
| --- | ---: | ---: | ---: | --- |
| development-20 | 20/20 | 48.46% | 0.9146 | pass |
| promotion-50 | 50/50 | 48.79% | 0.9306 | pass |
| stability-100 | 99/100 | 48.98% | 0.9442 | reject |

Artifacts:

```text
development 8617096214 sha256:a0448c2f9d314681c64a3ce99c150000309848aa99ac7d8a531d393b528137b5
promotion   8617263647 sha256:c9330ec4e2b7bccddec1a5dc407525d7dd09a82921ed2b405bb12aae6034ae5b
stability   8617578520 sha256:f95bc60317f3f777db40ba7dfece3adc99abd5cc851183680aef022c5e7117d5
```

## Rejection case

`v8-stability-058` changed from the Phase 10 4-panel result to a valid but canonically worse 7-panel result. The complete objective prioritizes residual panels before answers, crossings and editorial penalty. This is a hard regression and blocks production promotion.

The width must not be retuned using the stability seed. Promotion and stability sets are holdouts, not optimization data.

## Retained value

Phase 11 established that:

- exact clue allocation is a major and measurable cost center;
- a bounded rank-only frontier can remove about half of allocation calls on most seeds;
- pre-allocation Pareto dominance is unsafe;
- structural ranking alone cannot guarantee exact complete-pipeline parity;
- direct process-wide allocation instrumentation is now available;
- fail-open rollback to Phase 10 is implemented and tested.

## Next phase

Phase 12 should optimize `assignClueTextCellsV2` internally rather than skip candidate states:

```text
exact allocator profiling
-> immutable geometry/domain caching
-> deterministic restart reuse
-> admissible branch-and-bound pruning
-> exact output parity
-> fresh development/promotion/stability seed sets
```

The accepted output must remain byte-identical. Do not weaken the validator, change the canonical comparison, or tune against the Phase 11 stability failure.

The detailed experiment chronology, rejected variants, harness defects and reproduction commands are in `research/preallocation-structural-frontier/README.md`.
