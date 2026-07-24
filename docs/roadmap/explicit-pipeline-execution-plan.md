# Explicit Pipeline Execution Plan

Status: **active implementation runbook**  
Last audited: **2026-07-23**  
Baseline branch: `main`  
Accepted main through Phase 9: `8ae6f69df60eba4a0fc36399a42ab3418c77edae`  
Current research branch: `r-and-d/phase-10-complete-pipeline-frontier`

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
Phase 10  bounded complete-pipeline frontier
```

The original complete-pipeline frontier phase was deferred until wrapper ownership was resolved. It is now active as Phase 10. The first implementation boundary retains already clue-allocated complete construction candidates through downstream repair and editorial stages; delaying exact clue allocation until after frontier selection remains a later optimization unless this boundary proves useful.

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
| 9. Wrapper retirement | MERGED TO MAIN | #21 | Explicit direct runtime is canonical; wrapper chain rollback-only | `research/explicit-default/` |
| 10. Complete-pipeline frontier | IN PROGRESS | draft | Bounded downstream finalist retention | `research/complete-pipeline-frontier/` |
| Selected-grid editorial pipeline | NOT STARTED | — | After frontier decision | — |
| Release validation | NOT STARTED | — | After density/editorial gates | — |

## Phase 9 accepted boundary

Phase 9 was squash-merged to `main` at:

```text
8ae6f69df60eba4a0fc36399a42ab3418c77edae
```

Accepted implementation evidence remains preserved at:

```text
refs/heads/research/archive-phase-9-explicit-default-evidence-2026-07-23
```

Locked promotion result:

| set | exact pairs | failures | runtime ratio |
| --- | ---: | ---: | ---: |
| development-20 | 20/20 | 0 | 0.9692 |
| promotion-50 | 50/50 | 0 | 0.9850 |
| stability-100 | 100/100 | 0 | 0.9915 |

Canonical defaults:

```text
SCANWORD_EXPLICIT_PIPELINE=on
SCANWORD_PIPELINE_STAGE_RUNTIME=explicit
SCANWORD_WRAPPER_INSTALLATION_LOCK=explicit-pipeline-v1
```

Rollback remains:

```text
SCANWORD_EXPLICIT_PIPELINE=off
```

## Phase 10 — complete-pipeline frontier

Goal: retain a bounded non-dominated set of complete candidates so promising topology is not deleted before downstream repair and editorial cleanup reveal the final trade-offs.

Initial feature controls:

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=on
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4
```

Browser default remains off until evidence supports promotion.

Initial construction-frontier dimensions:

```text
residual panels
letter cells
weak fill
clue-text cells
external clue capacity
crossings
answer count
```

Final complete comparison dimensions:

```text
validity and connectivity
exact clues
residual panels
answer count
crossings
raw-letter coverage
formulaic short fill
editorial penalty
selected-grid clue debt
solver score
```

Required implementation rules:

1. Preserve the exact Phase 9 construction winner as immutable frontier member zero and fallback.
2. Add only bounded finalists from existing construction results; do not multiply unrestricted whole-grid reruns.
3. Run downstream structural repair and same-geometry editorial repair independently for every retained finalist.
4. Generate the historical legacy guard candidate once and share it without mutable cross-candidate state.
5. Compare only complete valid connected exact-clue results.
6. Record candidate provenance, dominance reason, stage cost and selected ancestry.
7. Keep deterministic tie-breakers and exact-baseline preference on complete ties.
8. Do not hide a weighted scalar score behind the frontier.
9. Keep the browser default off during research.

Development diagnostic gate:

- 20/20 validity, connectivity and exact clues;
- no regression under the canonical complete objective;
- bounded frontier size;
- aggregate runtime ratio no greater than 2.50;
- telemetry proving retained alternatives and selection ancestry.

Promotion gate:

- every diagnostic requirement;
- at least one reproducible complete-grid win over Phase 9 early selection;
- the win must come from a retained alternative rather than extra unrestricted construction work.

Rejection condition:

If the frontier merely reproduces a more expensive restart portfolio, never changes complete selection, or cannot remain within a bounded runtime, preserve the negative result and do not increase width without a new hypothesis.

Known first-boundary limitation:

The initial implementation retains candidates after exact clue allocation and construction-level victim repair. It tests downstream candidate deletion directly, but it does not yet perform exact clue allocation only for bounded structural finalists. That optimization must not be claimed until separately implemented and measured.

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

Run the exact-head Phase 10 deterministic contract and development-20 diagnostic gates. Accept, redesign or reject the bounded frontier from measured downstream selection evidence. Do not begin broad editorial or release work before this phase has an explicit boundary.
