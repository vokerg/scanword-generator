# Explicit Pipeline Execution Plan

Status: **active implementation runbook**  
Last audited: **2026-07-24**  
Baseline branch: `main`  
Accepted main through Phase 10: `43745d086c4879af69181676149ebcfb76110502`  
Current research branch: `r-and-d/phase-11-preallocation-structural-frontier`

This is the canonical continuation plan after complete frontier 1.3. Execute bounded phases from current `main`; preserve exact evidence and negative results; never weaken the complete validator.

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

- hard vocabulary boundaries where bounded constrained retrieval is appropriate;
- greedy single-state construction as the only topology search;
- late clue-feasibility discovery;
- exact clue allocation work spent on structural candidates that will be discarded;
- formulaic clue prose after the structural boundary is stable.

Long-term construction direction:

```text
attributed source corpus
-> hot seed-specific working set + full-corpus pattern index
-> bounded partial-state structural search
-> cheap clue-feasibility estimation
-> bounded pre-allocation structural frontier
-> exact clue allocation for finalists
-> accepted complete-pipeline repair frontier
-> bounded repair
-> same-geometry editorial repair
-> complete validation
-> final canonical selection
```

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
| 9. Wrapper retirement | MERGED TO MAIN | #21 | Explicit direct runtime canonical; wrapper chain rollback-only | `research/explicit-default/` |
| 10. Complete-pipeline frontier | MERGED TO MAIN | #23 | Width-four downstream finalist frontier promoted | `research/complete-pipeline-frontier/` |
| 11. Pre-allocation structural frontier | NEXT INVESTIGATION | — | Reduce exact allocation work without weakening Phase 10 | this runbook |
| Selected-grid editorial pipeline | NOT STARTED | — | After structural optimization decision | — |
| Release validation | NOT STARTED | — | After density and editorial gates | — |

## Current production baseline — complete frontier 1.3

Canonical browser defaults:

```text
SCANWORD_EXPLICIT_PIPELINE=on
SCANWORD_PIPELINE_STAGE_RUNTIME=explicit
SCANWORD_WRAPPER_INSTALLATION_LOCK=explicit-pipeline-v1
SCANWORD_COMPLETE_PIPELINE_FRONTIER=on
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4
SCANWORD_FULL_CORPUS_RETRIEVAL=off
SCANWORD_CLUE_FEASIBILITY=off
SCANWORD_PARTIAL_SEARCH=off
```

Exact Phase 9 rollback:

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=off
```

Historical wrapper-chain rollback:

```text
SCANWORD_EXPLICIT_PIPELINE=off
```

Canonical decision: `docs/milestones/v1.3-complete-pipeline-frontier.md`.

## Phase 10 accepted boundary

Phase 10 was squash-merged to `main` at:

```text
43745d086c4879af69181676149ebcfb76110502
```

It preserves the exact Phase 9 result as immutable frontier member zero, retains at most four deterministic repair-potential candidates after exact clue allocation, and runs the downstream repair/editorial chain independently per finalist.

Locked acceptance evidence:

| set | wins | ties | regressions | panels baseline -> frontier | runtime ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| development-20 | 16 | 4 | 0 | 5.30 -> 4.65 | 1.1676 |
| promotion-50 | 41 | 9 | 0 | 5.10 -> 4.60 | 1.1815 |
| stability-100 | 63 | 37 | 0 | 4.84 -> 4.37 | 1.1850 |

All 170 A/B pairs were complete, valid, connected and exact-clue-only. There were 120 retained-alternative wins and zero canonical regressions.

Frozen refs:

```text
refs/heads/research/archive-phase-10-complete-pipeline-frontier-evidence-2026-07-23
refs/heads/research/archive-phase-10-complete-pipeline-frontier-acceptance-2026-07-24
```

The full decision, harness correction, artifacts, digests, reproduction commands and limitations are in `research/complete-pipeline-frontier/README.md`.

## Phase 11 — pre-allocation structural frontier

Goal: move bounded retention before exact clue allocation so allocation work is spent only on structural finalists, while preserving the accepted Phase 10 quality boundary.

Target boundary:

```text
structural alternatives
-> cheap clue-feasibility filter
-> bounded structural frontier
-> exact clue allocation only for finalists
-> accepted complete-pipeline frontier
```

Required rules:

1. Branch from the exact Phase 10 squash commit.
2. Preserve the accepted Phase 10 path as member-zero fallback and explicit rollback.
3. Do not multiply unrestricted construction restarts.
4. Measure exact allocation calls, attempts, failures and time saved.
5. Record structural candidate provenance, filter rejection and selected ancestry.
6. Compare only complete valid connected exact-clue outputs.
7. Keep deterministic tie-breakers and exact-baseline preference on complete ties.
8. Do not promote a cheap estimator as authoritative; exact allocation and complete validation remain final.
9. Start browser-default-off until locked evidence supports promotion.

Development gate:

- 20/20 complete valid connected exact-clue pairs;
- zero regression under the accepted Phase 10 objective, or a separately documented superior objective;
- bounded structural frontier size;
- telemetry proving reduced exact allocation work;
- bounded aggregate runtime;
- no hidden unrestricted restart multiplier.

Promotion requires the same boundary on promotion-50 and stability-100, plus a reproducible allocation-work or runtime reduction. A pure telemetry change or a more expensive equivalent path is not sufficient.

Rejection condition: if pre-allocation filtering removes Phase 10 winners, fails to reduce exact allocation work, or requires unsafe optimistic assumptions, preserve the negative result and retain Phase 10 unchanged.

## Subsequent editorial phase

After Phase 11 is accepted or rejected, build a selected-grid clue editorial pipeline over completed geometry. Support multiple truthful clue candidates with source, license, clue kind, factual fields, difficulty, footprint demand, answer-revealingness and review status.

Reduce repeated wording, generic proper-name clues, answer-revealing hints, excessive clue length, category/source monotony and awkward generated prose. Geometry remains unchanged unless a separately documented joint clue/topology experiment is run.

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

## Work not to repeat without a new hypothesis

- blindly increasing independent restarts;
- unconstrained complete-corpus sampling;
- uniformly increasing active sets to 5,000-10,000;
- strong early lexical penalties that destroy reachability;
- lexical Pareto selection before downstream stages;
- late local CSP over already fragmented singleton regions;
- straight insertion into saturated grids;
- increasing CSP node limits when domains are empty or incompatible;
- another global `generateBest` wrapper;
- treating invalid harness runs as algorithm evidence.

## Immediate next action

Instrument the exact allocation boundary and identify the earliest deterministic structural candidate representation that can support a bounded frontier. Run a default-off development-20 A/B checkpoint against Phase 10 before making any production-default change.