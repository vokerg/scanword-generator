# Phase 12 — exact allocator acceleration

Status: **closed; experimentation concluded**

Started: 2026-07-29

Closed by accepted stability evidence on: 2026-08-04

Integrated through PRs `#26`–`#30`.

## Question

Can `assignClueTextCellsV2` be accelerated internally while preserving byte-identical selected outputs, deterministic restart behavior, complete validation and existing production ownership?

## Answer

Yes, within the exactness contract.

Phase 12 produced two accepted exact optimizations:

1. an exact linear top-three selector, promoted to the browser and Node production default;
2. an exact occupancy compatibility index, accepted and retained as reversible default-off code.

No accepted Phase 12 candidate changed final grid, placed-answer, clue or geometry digests on the locked development/promotion/stability sequences. Independent allocator replay/audit and RNG parity also remained exact.

Phase 12 algorithm experimentation is complete. Further algorithm work is out of scope unless a concrete production defect or measured product requirement establishes a new need.

## Non-negotiable acceptance hierarchy

1. Byte-identical grid, placed-answer, clue and geometry digests.
2. Valid, connected, exact-clue-only outputs.
3. No change to production ownership, rollback controls or complete validation.
4. Lower allocator time and total runtime.
5. Promotion only after fresh development, promotion and stability holdouts.

Phase 11 promotion and stability seeds, including `v8-stability-058`, were not tuning data for this phase.

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

## Observability baseline

The default-off shadow profiler established the exact allocator work boundary before optimization:

```text
construction-exact-allocator-profile-v1.js
```

Controls:

```text
SCANWORD_EXACT_ALLOCATOR_PROFILE=off
SCANWORD_EXACT_ALLOCATOR_PROFILE=shadow
SCANWORD_EXACT_ALLOCATOR_PROFILE_DETAIL=summary|full
```

The profiler records authoritative RNG draws, replays the exact allocator on a cloned pre-allocation state and checks layout/grid/RNG parity. Replay errors fail open and never replace or mutate the authoritative returned layout.

Frozen profiler archive refs:

```text
1acbbdcd7f4c233f6382c99b4ee7cf93ec762843
refs/heads/research/archive-phase-12-exact-allocator-profile-instrumentation-2026-07-29

0c624a5948dc15382518ed6fc05de7fb4dfe81f7
refs/heads/research/archive-phase-12-development-profile-evidence-2026-07-30
```

## Accepted optimization 1: exact linear top-three selector

The allocator assigns jitter to every available footprint candidate, but only the first three ranked candidates can affect the final random choice. The accepted selector preserves all jitter draws and stable comparator semantics while retaining the exact top three in linear time instead of fully sorting the domain.

Frozen implementation:

```text
5db8d25de2422ce1f62d21d4ffa2da7bb3cafb3e
```

Archived research head:

```text
5efa28f684e9ab605acc8fe1c8b46a1c47a89a29
refs/heads/research/archive-phase-12-linear-top-three-selector-2026-07-30
```

Accepted corpus evidence:

| split | exact/audit parity | allocator ratio | total ratio | fallbacks/errors |
| --- | ---: | ---: | ---: | ---: |
| development-20 | 20/20 | 0.9590 | 0.9940 | 0/0 |
| promotion-50 | 50/50 | 0.9500 | 0.9900 | 0/0 |
| stability-100 | 100/100 | 0.9562 | 0.9891 | 0/0 |

Stability workflow/artifact:

```text
workflow run:    30520073731
artifact:        8752036962
artifact sha256: f54cad7882f25cf63a0412febf75a501e0620b195f44ce1a16bf7dce09a4d6d4
exact calls:     53,622
```

### Production promotion

The accepted selector algorithm was promoted unchanged to the browser and Node default.

Promotion archive:

```text
77616780d11377f1fe44bcd74d17ba8f0adb5cae
refs/heads/research/archive-phase-12-exact-selector-default-promotion-2026-07-31
```

Production contract:

```text
absent SCANWORD_EXACT_ALLOCATOR_SELECTOR -> linear-top-three
SCANWORD_EXACT_ALLOCATOR_SELECTOR=linear-top-three -> linear-top-three
SCANWORD_EXACT_ALLOCATOR_SELECTOR=off -> canonical stable full-sort rollback
```

Detailed ledgers:

```text
research/exact-allocator-acceleration/linear-top-three-selector.md
research/exact-allocator-acceleration/default-promotion.md
```

## Accepted optimization 2: exact occupancy compatibility index

The second candidate avoids repeated full candidate-footprint compatibility scans during every restart. It builds stable candidate IDs and a deterministic cell-to-candidate reference map, then incrementally invalidates candidates overlapping newly occupied cells while enumerating survivors in original order.

Controls:

```text
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=indexed
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY_DETAIL=summary|full
```

Frozen implementation:

```text
a5826b4e250ce39da71edfa0aa715c12146c7992
refs/heads/research/archive-phase-12-exact-occupancy-index-implementation-2026-07-31
```

Frozen stability head:

```text
2036baa507a829abd6966a74911d0aee06054984
refs/heads/research/archive-phase-12-exact-occupancy-index-stability-2026-08-04
```

Accepted evidence:

| checkpoint | exact/audit parity | allocator ratio | total ratio | fallbacks/errors |
| --- | ---: | ---: | ---: | ---: |
| development-20 | 20/20 | 0.8845 | 0.9937 | 0/0 |
| promotion-50 | 50/50 | 0.8814 | 0.9856 | 0/0 |
| stability-100 | 100/100 | 0.9012 | 0.9830 | 0/0 |

Stability workflow/artifact:

```text
workflow run:    30880501195
artifact:        8882662669
artifact sha256: d7d66c6c4c9edb8d7c9402b2f9c1d70ec72050e9cfd8c8d11bcaabcedd878366
exact calls:     53,622
candidate refs:  35,772,881
```

On stability-100 the indexed allocator reduced aggregate allocator time by 9.88% and aggregate total runtime by 1.70%.

Decision: accepted as exact, reversible, default-off code. Browser and Node defaults remain:

```text
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
```

Detailed ledger:

```text
research/exact-allocator-acceleration/occupancy-index.md
```

## Closure decision

Phase 12 met its research objective and is closed.

The production default is the exact linear top-three selector. The occupancy index is retained as an accepted default-off implementation rather than promoted automatically because its end-to-end benefit is modest and no current product requirement requires the additional production-path complexity.

Expensive promotion and stability checkpoints are manual-only. Normal pull requests retain lightweight exact parity coverage.

No Phase 13 is implied by this closure. A new algorithm phase requires a concrete measured product problem, explicit acceptance criteria and fresh development/promotion/stability boundaries.

Canonical closure record:

```text
docs/milestones/phase-12-exact-allocator-research-closure.md
```

## Required lightweight exact gates

```bash
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-top-three-test-v1.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-occupancy-index-test-v1.cjs
```

Historical evidence, measurement defects and intermediate experiment records remain in this directory and must not be rewritten out of history.
