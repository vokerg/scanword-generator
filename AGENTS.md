# AGENTS.md

This file is the canonical operating guide for the repository root and every subdirectory unless a more specific `AGENTS.md` exists.

Read `CONTINUATION.md` before starting a new phase or substantial product change.

## Source of truth

- `main` is the only long-lived development branch.
- Current production behavior is defined by `index.html`, Node bootstrap order, explicit feature flags and the latest accepted production/closure records.
- Accepted layout baseline: `docs/milestones/v1.3-complete-pipeline-frontier.md`.
- Phase 11 closure: `docs/milestones/phase-11-preallocation-research-closure.md`.
- Phase 12 closure: `docs/milestones/phase-12-exact-allocator-research-closure.md`.
- Experiments, harness defects and negative results live in `research/` and remain reproducible.
- Never weaken the complete validator or canonical comparison to make an experiment pass.

## Current production baseline

```text
40,966-entry attributed corpus v8
-> deterministic active sets at 2,500 and 3,500 entries
-> indexed construction
-> exact clue allocation with linear top-three selection
-> width-four repair-potential complete-pipeline frontier
-> directly ordered clue, repair and editorial runtime per finalist
-> complete validation
-> canonical panel-first comparison
```

Canonical browser defaults:

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
SCANWORD_EXACT_ALLOCATOR_SELECTOR=linear-top-three
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
SCANWORD_EXACT_ALLOCATOR_PROFILE=off
```

Exact allocator rollback:

```text
SCANWORD_EXACT_ALLOCATOR_SELECTOR=off
```

Exact Phase 9 frontier rollback:

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=off
```

Historical wrapper-chain rollback:

```text
SCANWORD_EXPLICIT_PIPELINE=off
```

Node benchmarks must set historical feature modes explicitly. Do not silently rewrite locked configurations.

## Phase 11 closure

Phase 11's width-96 pre-allocation filter remains default-off research.

Frozen implementation:

```text
5f8fb8dcb446d1dcf13e1ef5fc1cee0c151906e4
refs/heads/research/archive-phase-11-preallocation-structural-filter-evidence-2026-07-25
```

Final locked results:

| seed set | exact parity | allocation reduction | runtime ratio |
| --- | ---: | ---: | ---: |
| development-20 | 20/20 | 48.46% | 0.9146 |
| promotion-50 | 50/50 | 48.79% | 0.9306 |
| stability-100 | 99/100 | 48.98% | 0.9442 |

`v8-stability-058` regressed from 4 to 7 panels. Production promotion is rejected. Do not tune width, ordering or thresholds against that seed or any locked promotion/stability seed.

Retain the Phase 11 modules, tests and harness on `main`, but keep:

```text
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off
```

## Phase 12 closure

Phase 12 optimized exact allocator internals while preserving byte-identical outputs and deterministic RNG behavior.

The accepted exact linear top-three selector is the production default. Its frozen implementation is:

```text
5db8d25de2422ce1f62d21d4ffa2da7bb3cafb3e
refs/heads/research/archive-phase-12-linear-top-three-selector-2026-07-30
```

Its production-promotion head is:

```text
77616780d11377f1fe44bcd74d17ba8f0adb5cae
refs/heads/research/archive-phase-12-exact-selector-default-promotion-2026-07-31
```

Stability-100 preserved 100/100 final-output and independent allocator-audit parity with zero fallbacks/errors. Aggregate allocator ratio was `0.9562`; aggregate total-runtime ratio was `0.9891`.

The exact occupancy compatibility index is accepted but remains default-off. Frozen implementation and stability heads:

```text
a5826b4e250ce39da71edfa0aa715c12146c7992
refs/heads/research/archive-phase-12-exact-occupancy-index-implementation-2026-07-31

2036baa507a829abd6966a74911d0aee06054984
refs/heads/research/archive-phase-12-exact-occupancy-index-stability-2026-08-04
```

Its stability-100 result preserved 100/100 output/audit parity, reduced aggregate allocator time by 9.88%, reduced aggregate total runtime by 1.70%, and had zero fallbacks, index errors or RNG mismatches.

Keep:

```text
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
```

Phase 12 experimentation is closed. Expensive Phase 12 checkpoints are manual-only. Do not open a Phase 13 algorithm experiment without a concrete measured production/product requirement.

## Production ownership

After initialization:

```text
active generateBest owner: construction-pipeline-v1
execution owner:            direct-production-stage-runtime-v2
rollback owner:             legacy-wrapper-chain
```

`construction-pipeline-v1.js` is the sole active global production owner. No later module may replace `ScanwordSolver.generateBest`.

New algorithms must enter through an explicit stage or an existing explicitly owned production module. Do not add another global wrapper.

## Accepted complete-pipeline frontier

`construction-portfolio.js` retains at most four checkpoint-passing candidates after exact clue allocation. The exact Phase 9 local winner is immutable member zero.

Retention uses deterministic repair-potential metrics:

```text
residual panels and regions
isolated panels and concentration
letter cells, crossings and answers
weak fill, clue-text cells and external capacity
```

Every retained finalist executes the complete repair and editorial chain. Only valid, connected, exact-clue candidates are eligible. Complete ties select the lowest frontier index, preserving member zero.

Do not multiply unrestricted construction attempts or legacy guard generation by frontier width.

## Exact allocator contracts

The production linear top-three selector must preserve:

- original candidate iteration order;
- one jitter RNG draw per available candidate in the original order;
- existing comparator and signature tie-break semantics;
- stable input order for equal comparator keys;
- the final top-three RNG choice;
- strict first-best restart behavior;
- byte-identical grid, placed-answer, clue and geometry digests.

`SCANWORD_EXACT_ALLOCATOR_SELECTOR=off` is the exact stable full-sort rollback.

The default-off occupancy index must additionally preserve candidate availability order and fail open before allocator RNG consumption on validated index-build failure.

Do not change these contracts incidentally during product work.

## Explicit stage boundary

CandidateState contracts should use:

```text
CandidateState -> CandidateState
CandidateState -> CandidateState[]
CandidateState[] -> CandidateState[]
```

Preserve copy-on-write, explicit cloning or otherwise auditable state ownership. No hidden cross-candidate mutation.

Conceptual production stages:

```text
production-stage-source
-> base construction
-> clue allocation
-> repair chain
-> validation
-> comparison
```

## Browser and Node load order

Changing script order is architectural. Required conceptual order:

```text
base dictionaries and corpus
-> core and dictionary policy
-> lexical policy and full-corpus pattern index
-> solver and construction runtime
-> clue-feasibility and bounded-search research
-> construction portfolio
-> Phase 11 pre-allocation research modules
-> repair algorithms
-> editorial algorithms
-> direct stage source and runtime
-> vocabulary portfolio
-> CandidateState, telemetry and explicit pipeline
-> exact allocator selector
-> default-off occupancy index
-> default-off exact allocator profiler
-> wrapper-retirement audit
-> renderer and UI
```

The Node benchmark bootstrap must mirror browser ownership and module order.

## Two-level vocabulary retrieval

The 2,500/3,500 hot working sets are construction priors, not universal legal-domain boundaries. Full-corpus access is allowed only through bounded constrained searches with fixed pattern letters, admitted exact clues, deterministic ranking, used-answer exclusion and complete hot-only versus enhanced-chain comparison.

Never expose the complete corpus to unconstrained uniform sampling.

## Clue feasibility and partial search

- `SCANWORD_CLUE_FEASIBILITY=shadow` is diagnostic only.
- Rejected local `rank` and unpromoted `guard` policies are not accepted defaults.
- `SCANWORD_PARTIAL_SEARCH=beam` remains opt-in because its quality gain is too expensive.
- Search replacements must preserve the exact baseline candidate and expose fallback ancestry.
- Partial estimates may guide exploration but never replace complete final comparison.

## Structural invariants

Every accepted grid must satisfy:

1. every contiguous letter run of length two or more is exactly one assigned answer;
2. every letter belongs to an assigned answer;
3. crossing letters agree;
4. every clue footprint resolves to a real arrow and answer start;
5. every used answer has an admitted exact clue;
6. the answer graph has exactly one connected component;
7. no accidental runs, orphan letters, duplicate directional occupancy or clue conflicts exist;
8. residual areas are explicit panel cells.

## Complete candidate objective

Compare complete valid candidates lexicographically:

1. fewer residual panels;
2. more answers;
3. more crossings;
4. greater raw-letter coverage;
5. fewer formulaic short answers;
6. lower editorial penalty;
7. lower selected-grid clue debt when measured;
8. higher existing solver score;
9. deterministic tie-breakers with exact member-zero preference.

Do not replace this boundary with an opaque weighted score.

## Required checks

For production/frontier or stage changes:

```bash
node tools/complete-pipeline-frontier-test-v1.cjs
node tools/construction-stage-runtime-test-v2.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/wrapper-retirement-test-v1.cjs
```

For exact allocator behavior:

```bash
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-top-three-test-v1.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-occupancy-index-test-v1.cjs
```

For retained Phase 11 modules:

```bash
node tools/preallocation-structural-frontier-test-v1.cjs
node tools/preallocation-repair-potential-test-v1.cjs
node tools/preallocation-ranked-frontier-test-v1.cjs
node tools/preallocation-filter-test-v1.cjs
```

Minimum release checks:

```bash
node tools/bulk-lexicon-audit.cjs
node tools/dictionary-count-v3.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/vocabulary-release-checkpoint.cjs 20
```

Run `node --check` for every changed JavaScript/CommonJS file and the matching deterministic primitive test for every bounded algorithm.

## Research discipline

Every substantive experiment must record:

- question and hypothesis;
- exact baseline and candidate modes;
- source commit, corpus/config/seed digests and budgets;
- acceptance criteria;
- aggregate and per-seed regressions;
- runtime median, p95 and max where meaningful;
- examples, counterexamples and failure modes;
- workflow run, artifact ID, digest and reproduction command;
- explicit promotion, rejection or deferral decision.

Keep negative results and harness defects. Do not rewrite them out of history.

Development data is for iteration. Promotion and stability data are holdouts. A failure on a holdout rejects the frozen candidate; it is not permission to tune on that holdout.

## Archive and integration policy

1. Branch from current `main`.
2. Keep one logical phase or product block per PR.
3. Run the relevant gate on the exact implementation head.
4. Preserve exact research implementations under immutable `research/archive-*` refs before documentation-only closure commits.
5. Update the research ledger, archive manifest, root handoff, README, AGENTS and decision record when closing research.
6. Confirm browser defaults, Node benchmark flags and production ownership.
7. Run exact final-head CI.
8. Squash-merge to `main`.
9. Verify the squash commit and post-merge checks.
10. Archive superseded unmerged branches before closing their PRs.
11. Start subsequent work from updated `main`.

Archive refs are immutable evidence. They are not active development branches.

## Current work boundary

There is no automatic next algorithm phase.

Prioritize productization unless a measured requirement establishes a new research problem:

```text
release robustness and regression coverage
-> user-facing generation and failure handling
-> export/print/A5 quality
-> packaging/deployment
-> measure remaining product bottlenecks
-> only then define a new algorithm phase if required
```

Any future research phase must declare its concrete product problem, acceptance metric, fresh development/promote/stability data boundary and rollback contract before tuning begins.
