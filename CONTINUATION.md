# Canonical continuation handoff

Last updated: 2026-08-10

This file is the first handoff to read in a new chat or coding session. Phase 12 algorithm experimentation is complete. Do not treat the old Phase 12 plan as pending work.

Current `main` before this documentation closure:

```text
c9bbef05dfe038adf21f684a81abc87d999fbbcc
```

That squash merge integrated the accepted exact occupancy compatibility index and explicitly concluded Phase 12 experimentation.

## Current production baseline

Production retains the complete-frontier layout baseline and now uses the accepted exact linear top-three allocator selector by default:

```text
40,966-entry attributed corpus v8
-> deterministic 2,500/3,500 working sets
-> indexed construction
-> exact clue allocation with linear top-three selection
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
SCANWORD_EXACT_ALLOCATOR_SELECTOR=linear-top-three
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
SCANWORD_EXACT_ALLOCATOR_PROFILE=off
```

Production ownership remains:

```text
active generateBest owner: construction-pipeline-v1
execution owner:            direct-production-stage-runtime-v2
rollback owner:             legacy-wrapper-chain
```

## Phase 11 closure remains unchanged

Phase 11's width-96 pre-allocation structural filter remains retained, reproducible and default-off. Its stability holdout had one canonical regression:

```text
v8-stability-058: 4 panels -> 7 panels
```

Do not tune against that seed or any locked Phase 11 promotion/stability seed.

```text
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off
```

Frozen Phase 11 implementation:

```text
5f8fb8dcb446d1dcf13e1ef5fc1cee0c151906e4
refs/heads/research/archive-phase-11-preallocation-structural-filter-evidence-2026-07-25
```

## Phase 12 closure

Phase 12 investigated exact allocator acceleration without skipping candidate states or changing canonical winners.

### Accepted production selector

The exact linear top-three selector replaces the allocator's full stable sort while preserving candidate order, comparator semantics, every jitter RNG draw, final top-three choice, restart behavior and byte-identical final output.

Frozen implementation:

```text
5db8d25de2422ce1f62d21d4ffa2da7bb3cafb3e
refs/heads/research/archive-phase-12-linear-top-three-selector-2026-07-30
```

Production-promotion head:

```text
77616780d11377f1fe44bcd74d17ba8f0adb5cae
refs/heads/research/archive-phase-12-exact-selector-default-promotion-2026-07-31
```

Accepted evidence:

| seed set | exact/audit parity | allocator ratio | total ratio | errors |
| --- | ---: | ---: | ---: | ---: |
| development-20 | 20/20 | 0.9590 | 0.9940 | 0 |
| promotion-50 | 50/50 | 0.9500 | 0.9900 | 0 |
| stability-100 | 100/100 | 0.9562 | 0.9891 | 0 |

The selector is the browser and Node production default. Exact rollback remains:

```text
SCANWORD_EXACT_ALLOCATOR_SELECTOR=off
```

### Accepted default-off occupancy index

The occupancy compatibility index replaces repeated full candidate-key availability scans with deterministic incremental invalidation. It preserves item/candidate order, selector behavior, every RNG draw, final output digests, validator behavior and rollback semantics.

Frozen implementation:

```text
a5826b4e250ce39da71edfa0aa715c12146c7992
refs/heads/research/archive-phase-12-exact-occupancy-index-implementation-2026-07-31
```

Frozen stability evidence:

```text
2036baa507a829abd6966a74911d0aee06054984
refs/heads/research/archive-phase-12-exact-occupancy-index-stability-2026-08-04
```

Accepted evidence:

| seed set | exact/audit parity | allocator ratio | total ratio | errors |
| --- | ---: | ---: | ---: | ---: |
| development-20 | 20/20 | 0.8845 | 0.9937 | 0 |
| promotion-50 | 50/50 | 0.8814 | 0.9856 | 0 |
| stability-100 | 100/100 | 0.9012 | 0.9830 | 0 |

On stability-100 the index reduced aggregate allocator time by 9.88% and total runtime by 1.70%. It is accepted and reversible but remains default-off:

```text
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
```

Stability-100 concludes Phase 12 algorithm experimentation. Promotion/stability workflows are manual-only; normal PRs retain lightweight exact parity checks.

Detailed evidence:

```text
research/exact-allocator-acceleration/README.md
research/exact-allocator-acceleration/linear-top-three-selector.md
research/exact-allocator-acceleration/default-promotion.md
research/exact-allocator-acceleration/occupancy-index.md
docs/milestones/phase-12-exact-allocator-research-closure.md
```

## What to do next

There is no pre-approved Phase 13 algorithm experiment.

Default next work is productization around the accepted generator:

1. release/production robustness and regression coverage;
2. user-facing generation flow and failure handling;
3. export/print/A5 output quality;
4. packaging/deployment and reproducible release checks;
5. only then any algorithm work justified by a measured product defect or requirement.

A new research phase must start from current `main` and must state a concrete problem, measurable acceptance criterion and fresh tuning/holdout boundary before implementation begins.

Do not invent another optimization target solely to continue the phase numbering.

## Core checks for normal production work

```bash
node tools/bulk-lexicon-audit.cjs
node tools/dictionary-count-v3.cjs
node tools/complete-pipeline-frontier-test-v1.cjs
node tools/construction-stage-runtime-test-v2.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/wrapper-retirement-test-v1.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-top-three-test-v1.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-occupancy-index-test-v1.cjs
```

Retained Phase 11 checks remain required when touching its modules:

```bash
node tools/preallocation-structural-frontier-test-v1.cjs
node tools/preallocation-repair-potential-test-v1.cjs
node tools/preallocation-ranked-frontier-test-v1.cjs
node tools/preallocation-filter-test-v1.cjs
```

## Archive state

Accepted Phase 0-12 evidence is preserved under immutable `research/archive-*` refs and tracked by `research/archive-manifest.json`.

Phase 12 refs include:

```text
research/archive-phase-12-exact-allocator-profile-instrumentation-2026-07-29
research/archive-phase-12-development-profile-evidence-2026-07-30
research/archive-phase-12-linear-top-three-selector-2026-07-30
research/archive-phase-12-exact-selector-default-promotion-2026-07-31
research/archive-phase-12-exact-occupancy-index-implementation-2026-07-31
research/archive-phase-12-exact-occupancy-index-stability-2026-08-04
```

## Non-negotiable rules

- `main` is the only long-lived development branch.
- Archive refs are immutable evidence, not active development lines.
- Do not weaken complete validation.
- Do not replace the canonical lexicographic objective with a weighted score.
- Do not tune on promotion or stability seeds.
- Preserve negative results and harness defects.
- Preserve exact allocator RNG/output contracts unless a future phase explicitly changes the product requirement.
- Every merge to `main` must be a squash representing one logical phase or documentation block.
