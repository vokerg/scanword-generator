# Explicit Pipeline Execution Plan

Status: **active implementation runbook**  
Last audited: **2026-07-23**  
Baseline branch: `main`  
Accepted main before Phase 9 merge: `060a05e3245a24ccf6e3408bcfb887fc390c02d5`  
Current promotion PR: **#21**, `r-and-d/phase-9-explicit-default`

This is the canonical continuation plan after vocabulary-first 1.1. Execute bounded phases from current `main`; preserve exact evidence and negative results; never weaken the complete validator.

## Executive direction

Keep:

- complete structural validation and one-component acceptance;
- deterministic identical-seed experiments;
- the attributed corpus and bounded pattern index;
- panel-first complete-candidate comparison;
- clue-footprint allocation and repair;
- same-geometry editorial repair;
- renderer, UI, SVG and JSON export;
- durable experiment ledgers, archive refs and rollback controls.

Continue replacing:

- ambiguous global `generateBest` ownership;
- duplicated whole-grid wrapper execution;
- hard vocabulary boundaries where bounded constrained retrieval is appropriate;
- greedy single-state construction as the only topology search;
- late clue-feasibility discovery;
- candidate deletion before the complete pipeline reveals final trade-offs.

Long-term construction direction:

```text
attributed source corpus
-> hot seed-specific working set + full-corpus pattern index
-> bounded partial-state structural search
-> cheap clue-feasibility estimation
-> bounded complete-pipeline frontier
-> exact clue allocation for finalists
-> bounded repair
-> same-geometry editorial repair
-> complete validation
-> final canonical selection
```

## Execution update

Phases 0–6 followed the original plan. The migration was then split into smaller accepted boundaries:

```text
Phase 7A  adaptive bounded-search budget
Phase 8A  direct explicit stage runtime
Phase 9   explicit default and wrapper retirement
```

The original complete-pipeline frontier phase was **deferred, not rejected**. The original repair-stage migration was partially satisfied by direct ordered execution, but not every historical repair implementation is yet a pure CandidateState transformation.

## Accepted progression

| phase | status | PR | decision | evidence |
| --- | --- | ---: | --- | --- |
| 0. Research preservation | MERGED TO MAIN | #12 | Durable refs and shallow-clone reproduction | `research/archive-manifest.json` |
| 1. Selected-grid clue quality | MERGED TO MAIN | #13 | Clue-only cleanup accepted | selected-grid clue ledger |
| 2. v8 baseline lock | MERGED TO MAIN | #14 | Frozen 20/50/100 protocol | `research/baselines/v8-production-1.1/` |
| 3. Explicit pipeline parity | MERGED TO MAIN | #15 | CandidateState compatibility boundary | `research/explicit-pipeline/` |
| 4. Full-corpus pattern retrieval | MERGED TO MAIN | #16 | Bounded constrained retrieval; default off | `research/full-corpus-retrieval/` |
| 5. Clue-feasibility estimator | MERGED TO MAIN | #17 | Shadow telemetry accepted; ranking rejected | `research/clue-feasibility/` |
| 6. Partial-state search | MERGED TO MAIN | #18 | Bounded beam accepted; default off | `research/bounded-partial-search/` |
| 7A. Adaptive search budget | MERGED TO MAIN | #19 | Additive probes reduced; exact baseline retained | `research/adaptive-partial-search/` |
| 8A. Direct stage runtime | MERGED TO MAIN | #20 | Direct ordered source accepted | `research/direct-stage-runtime/` |
| 9. Wrapper retirement | IN PROGRESS | #21 | 20/50/100 exact parity green | `research/explicit-default/` |
| Deferred frontier | NOT STARTED | — | Next density phase | — |
| Selected-grid editorial pipeline | NOT STARTED | — | After frontier decision | — |
| Release validation | NOT STARTED | — | After density/editorial gates | — |

## Phase 9 exit gate

The accepted implementation head is:

```text
f77be9fed8223925819830fad6956f1018717bbb
```

Durable evidence ref:

```text
refs/heads/research/archive-phase-9-explicit-default-evidence-2026-07-23
```

Required promotion result:

| set | exact pairs | failures | runtime ratio |
| --- | ---: | ---: | ---: |
| development-20 | 20/20 | 0 | 0.9692 |
| promotion-50 | 50/50 | 0 | 0.9850 |
| stability-100 | 100/100 | 0 | 0.9915 |

Every pair must preserve grid, placed-answer, clue and geometry digests, complete validity, one connected component and exact clues.

Canonical defaults after merge:

```text
SCANWORD_EXPLICIT_PIPELINE=on
SCANWORD_PIPELINE_STAGE_RUNTIME=explicit
SCANWORD_WRAPPER_INSTALLATION_LOCK=explicit-pipeline-v1
```

Rollback:

```text
SCANWORD_EXPLICIT_PIPELINE=off
```

Before merge:

- preserve the accepted implementation ref;
- commit the Phase 9 ledger and archive manifest;
- update README, AGENTS and milestone;
- run exact final-head workflows;
- mark PR #21 ready;
- squash-merge;
- verify the squash commit and post-merge gates.

## Next density phase — complete-pipeline frontier

Goal: retain a bounded non-dominated set of complete candidates so promising topology is not deleted before clue allocation, repair and editorial cleanup reveal the final trade-offs.

Minimum dimensions:

```text
residual panels
answer count
crossings
raw-letter coverage
weak/editorial fill
clue feasibility and clue area
selected-grid clue debt
runtime cost
```

Required implementation rules:

1. Preserve the exact production candidate as an immutable frontier member and fallback.
2. Add only bounded finalists from existing structural search; do not multiply unrestricted whole-grid reruns.
3. Run exact clue allocation only for bounded finalists.
4. Apply bounded structural repair and same-geometry editorial repair before dominance and final selection.
5. Compare only complete valid connected exact-clue results.
6. Record candidate provenance, dominance reason, stage cost and selected ancestry.
7. Keep deterministic tie-breakers and exact-baseline preference on complete ties.
8. Do not hide a weighted scalar score behind the frontier.

Development gate:

- 20/20 validity, connectivity and exact clues;
- no regression under the canonical complete objective;
- at least one reproducible complete-grid win over single-candidate early selection;
- bounded frontier size and runtime;
- telemetry proving the win came from retained alternatives rather than unbounded extra work.

Rejection condition:

If the frontier merely reproduces a more expensive restart portfolio or never changes complete selection, preserve the negative result and do not increase width without a new hypothesis.

## Subsequent editorial phase

After the frontier is accepted or rejected, build a selected-grid clue editorial pipeline over completed geometry. Support multiple truthful clue candidates with source, license, clue kind, factual fields, difficulty, footprint demand, answer-revealingness and review status.

Reduce:

- repeated wording;
- generic proper-name clues;
- answer-revealing hints;
- excessive clue length;
- category and source monotony;
- awkward generated prose.

Geometry must remain unchanged unless a separately documented joint clue/topology experiment is run.

## Release gate

Do not promote solely because average panels improve. Release evidence must include:

- exact commit and corpus digest;
- browser and Node defaults;
- structural validity and component rate;
- panel distribution and zero-panel rate;
- answers, crossings and coverage;
- lexical and clue metrics;
- fallback rate;
- median, p95 and maximum runtime;
- per-seed regressions;
- representative and worst-case renderings;
- known debt and rollback procedure.

## Work not to repeat without new evidence

- blindly increasing independent restarts;
- unconstrained complete-corpus sampling;
- uniformly increasing active sets to 5,000–10,000;
- strong early lexical penalties that destroy reachability;
- lexical Pareto selection before downstream stages;
- late local CSP over already fragmented singleton regions;
- straight insertion into saturated grids;
- increasing CSP node limits when domains are empty or incompatible;
- another global `generateBest` wrapper.

## Immediate next action

Complete Phase 9 only. After its squash merge, branch the deferred complete-pipeline frontier from the new `main`. Do not begin broad editorial or release work before that density phase has an explicit accepted or rejected boundary.
