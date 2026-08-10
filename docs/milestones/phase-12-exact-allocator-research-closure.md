# Phase 12 — exact allocator research closure

Status: **closed**

Closure date: 2026-08-10

Algorithm experimentation concluded by the accepted occupancy-index stability-100 evidence integrated through PR `#30`.

Pre-closure `main`:

```text
c9bbef05dfe038adf21f684a81abc87d999fbbcc
```

## Research question

Can exact clue allocation be accelerated internally without skipping candidate states, changing canonical winners, altering RNG behavior, weakening validation or changing production ownership?

## Acceptance hierarchy

1. byte-identical grid, placed-answer, clue and geometry digests;
2. valid, connected, exact-clue-only outputs;
3. exact allocator replay/audit and RNG parity;
4. no ownership, rollback or validator change;
5. lower allocator time and total runtime;
6. fresh development, promotion and stability holdouts frozen before tuning.

Phase 11 promotion/stability seeds were excluded from Phase 12 tuning.

## Frozen data boundary

```text
development: 20
promotion:   50
stability:  100
manifest:   research/exact-allocator-acceleration/seed-manifest-v1.json
digest:     389647aadef2a55df6f8f7ba3e5dd6c3f26ad86cd9b53030a22f58a9e754d2e9
```

## Result 1 — exact linear top-three selector

The allocator's full jitter-ranked stable sort was replaced by a linear exact top-three selector. The implementation preserves every jitter RNG draw in original order, comparator/signature semantics, stable ties, final top-three RNG choice and strict first-best restart behavior.

Frozen implementation:

```text
5db8d25de2422ce1f62d21d4ffa2da7bb3cafb3e
```

Archived accepted research head:

```text
5efa28f684e9ab605acc8fe1c8b46a1c47a89a29
refs/heads/research/archive-phase-12-linear-top-three-selector-2026-07-30
```

Accepted research evidence:

| split | exact/audit parity | allocator ratio | total ratio | fallbacks/errors |
| --- | ---: | ---: | ---: | ---: |
| development-20 | 20/20 | 0.9590 | 0.9940 | 0/0 |
| promotion-50 | 50/50 | 0.9500 | 0.9900 | 0/0 |
| stability-100 | 100/100 | 0.9562 | 0.9891 | 0/0 |

Stability evidence:

```text
workflow run:    30520073731
artifact:        8752036962
artifact sha256: f54cad7882f25cf63a0412febf75a501e0620b195f44ce1a16bf7dce09a4d6d4
exact calls:     53,622
```

### Production decision

Accepted and promoted unchanged to browser and Node production default through PR `#29`.

Frozen promotion head:

```text
77616780d11377f1fe44bcd74d17ba8f0adb5cae
refs/heads/research/archive-phase-12-exact-selector-default-promotion-2026-07-31
```

Integrated production-default merge:

```text
125177d5fecdcb1e7a6930bd8f257427093ae7e2
```

Production/rollback contract:

```text
absent SCANWORD_EXACT_ALLOCATOR_SELECTOR -> linear-top-three
SCANWORD_EXACT_ALLOCATOR_SELECTOR=linear-top-three -> linear-top-three
SCANWORD_EXACT_ALLOCATOR_SELECTOR=off -> canonical stable full-sort rollback
```

## Result 2 — exact occupancy compatibility index

The allocator's repeated candidate-footprint occupancy scans were replaced by a deterministic compatibility index using stable candidate IDs, an immutable cell-to-candidate reference map and generation-tagged incremental invalidation.

The accepted implementation preserves item/candidate order, all selector/RNG behavior, exact final digests, validation, ownership and rollback. Validated index-build errors fail open before allocator RNG consumption.

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

| split | exact/audit parity | allocator ratio | total ratio | fallbacks/errors |
| --- | ---: | ---: | ---: | ---: |
| development-20 | 20/20 | 0.8845 | 0.9937 | 0/0 |
| promotion-50 | 50/50 | 0.8814 | 0.9856 | 0/0 |
| stability-100 | 100/100 | 0.9012 | 0.9830 | 0/0 |

Stability evidence:

```text
workflow run:    30880501195
artifact:        8882662669
artifact sha256: d7d66c6c4c9edb8d7c9402b2f9c1d70ec72050e9cfd8c8d11bcaabcedd878366
exact calls:     53,622
candidate refs:  35,772,881
```

On stability-100 the occupancy index reduced aggregate exact allocator time by 9.88% and aggregate total runtime by 1.70%.

### Production decision

Accepted, reversible and retained on `main`, but not promoted to the default production path:

```text
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
```

The end-to-end gain is modest and no current product requirement requires the additional production-path complexity. Promotion may be reconsidered only against a concrete measured requirement, not as continuation of Phase 12 tuning.

## Observability evidence

Phase 12's shadow profiler and frozen development profile are preserved at:

```text
1acbbdcd7f4c233f6382c99b4ee7cf93ec762843
refs/heads/research/archive-phase-12-exact-allocator-profile-instrumentation-2026-07-29

0c624a5948dc15382518ed6fc05de7fb4dfe81f7
refs/heads/research/archive-phase-12-development-profile-evidence-2026-07-30
```

The profiler remains default-off and must not affect authoritative output.

## Final decision

Phase 12 experimentation is complete.

The accepted production allocator uses the exact linear top-three selector. The occupancy index remains accepted default-off code. Expensive promotion/stability checkpoints are manual-only; lightweight exact parity tests remain part of normal regression coverage.

There is no automatically implied Phase 13.

The next default mode of work is productization:

```text
release robustness and regression coverage
-> user-facing generation and failure handling
-> export/print/A5 output quality
-> packaging/deployment
-> measure product bottlenecks
-> define new algorithm research only if a concrete requirement demands it
```

A future research phase must state a concrete product problem, measurable acceptance criteria, rollback contract and fresh development/promotion/stability boundary before implementation or tuning begins.

## Canonical evidence

```text
research/exact-allocator-acceleration/README.md
research/exact-allocator-acceleration/linear-top-three-selector.md
research/exact-allocator-acceleration/default-promotion.md
research/exact-allocator-acceleration/occupancy-index.md
research/archive-manifest.json
```

## Lightweight exact gates

```bash
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-top-three-test-v1.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-occupancy-index-test-v1.cjs
```
