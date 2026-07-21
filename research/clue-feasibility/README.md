# Phase 5 — incremental clue-feasibility estimation

## Decision

Phase 5 accepts a **diagnostic, opt-in clue-feasibility estimator** at the active `solver.buildAttempt` construction boundary.

The estimator is accepted in `shadow` mode only. It records bounded regional and local placement signals while preserving the exact production placement stream and final result. The browser default remains:

```text
SCANWORD_CLUE_FEASIBILITY=off
```

`rank` and `guard` remain experimental modes. Neither is promoted to browser or release behavior in this phase.

This phase does **not** claim lower panel count, faster generation, or successful production pruning. It establishes a calibrated estimator with zero observed false negatives and records why direct feasibility ranking was rejected.

## Question

Can construction cheaply estimate whether the real clue-footprint allocator is likely to satisfy its preserved coverage checkpoint before an attempt spends the full downstream allocation and repair budget?

The estimator must not replace or weaken the exact clue allocator or the complete validator.

## Accepted insertion point

The production portfolio calls `ScanwordSolver.buildAttempt` 120 times for each active working set. Phase 5 installs after `construction-v2.js`, where the indexed attempt builder and `assignClueTextCellsV2` are available.

```text
construction-v2.js
-> construction-clue-feasibility-v1.js
-> remaining production construction and repair modules
```

No new `generateBest` wrapper is introduced.

## Estimator model

The accepted implementation is `regional-bounds-local-delta-v1`.

For a complete partial state it calculates in O(grid + clues):

- remaining panel cells;
- connected panel-region count and sizes;
- isolated one-cell panel regions;
- clue anchors with no adjacent panel start;
- long-clue preferred-cell plausibility;
- optimistic external-clue upper bound;
- optimistic clue-text-cell upper bound;
- one-pass regional capacity estimate;
- region demand and overlap pressure;
- maximum clue pressure per panel region.

For the selected placement candidate it additionally records local deltas:

- consumed panel cells;
- newly stranded clue anchors;
- newly implausible long clues;
- newly isolated panel cells;
- new clue-anchor domain size;
- whether the monotonic 45-panel capacity floor would be violated.

The estimator never treats an optimistic pass as proof of allocation success. The real allocator and validator remain authoritative.

## Modes

### Off

```text
SCANWORD_CLUE_FEASIBILITY=off
```

Delegates to the unchanged production attempt builder.

### Shadow — accepted diagnostic mode

```text
SCANWORD_CLUE_FEASIBILITY=shadow
SCANWORD_CLUE_FEASIBILITY_CANDIDATES=1
```

Evaluates the first production-ranked placement candidate without changing candidate order, shortlist size, random calls, clue allocation or final selection.

### Rank — rejected

```text
SCANWORD_CLUE_FEASIBILITY=rank
```

Uses the local feasibility utility to reorder a bounded candidate head. This changed output and produced unacceptable per-seed regressions.

### Guard — not promoted

```text
SCANWORD_CLUE_FEASIBILITY=guard
```

Can remove placements only when their remaining panel capacity falls below the preserved 45-cell clue-text checkpoint. No development attempt crossed this monotonic floor, so the guard produced no real pruning benefit.

## Calibration boundary

Every completed attempt is estimated immediately before the real `assignClueTextCellsV2` call. Telemetry compares:

- predicted necessary-condition pass;
- actual 45 clue-text-cell and 24 external-clue checkpoint result;
- false positives;
- false negatives;
- absolute clue-text-cell error;
- absolute external-clue error.

False negatives are the dangerous error: a state predicted impossible although the exact allocator succeeds. The accepted gate permits zero false negatives.

## Accepted development evidence

Only the locked Phase 2 `development-20` set was used.

```text
accepted implementation: 22fe6087400a9c55c674e0712b23c172812db844
archive ref:             refs/heads/research/archive-phase-5-clue-feasibility-evidence-2026-07-21
workflow run:            29830970684
artifact ID:             8495534328
artifact digest:         sha256:fa19cc2e67c63c30d62e8553b5d789dacf5eabd77c5e7c176beeed2dac9bdf9c
per-seed digest:         sha256:66f027232644c818cdb109e4fd6fb7c0d5d86e9f5223c5dc6953d80ca5717381
aggregate digest:        sha256:0954b26273e6d165c72739db57d76a8766793e0c4229aea4d85a07fdd0cdcdd7
environment digest:      sha256:e3309988de82d6817c6d2704da68a6059d6bd82aab87033de22f4e1e38bf441b
run-manifest digest:     sha256:71399e0f11da9ccf8d02eede529250920c0aaaf717dc4b94912fba979b6169d4
console digest:          sha256:cc1a60b9996813ea1e61446b40bb978a1ac7133ec81bf7fda76142ba36778dea
```

### Output parity

| metric | off | shadow |
| --- | ---: | ---: |
| completed | 20/20 | 20/20 |
| exact full-result digest parity | — | 20/20 |
| invalid grids | 0 | 0 |
| disconnected grids | 0 | 0 |
| non-exact-clue grids | 0 | 0 |
| coverage-checkpoint failures | 0 | 0 |
| average panels | 5.30 | 5.30 |
| average answers | 47.45 | 47.45 |
| average crossings | 51.70 | 51.70 |
| average clue-text cells | 60.55 | 60.55 |
| average external clues | 33.45 | 33.45 |
| average editorial penalty | 408.90 | 408.90 |

### Calibration

| metric | accepted shadow result |
| --- | ---: |
| attempts built | 4,800 |
| placement rounds observed | 188,789 |
| placement candidates evaluated | 188,789 |
| completed states calibrated | 5,180 |
| actual checkpoint passes | 4,715 |
| predicted passes | 5,134 |
| false positives | 419 |
| false-positive rate | 8.09% |
| false negatives | 0 |
| selected-grid false positives | 0 |
| selected-grid false negatives | 0 |
| mean clue-text absolute error | 4.88 cells |
| mean external-clue absolute error | 1.96 clues |
| newly stranded clue events observed | 42,485 |

### Runtime

| mode | total | average per seed | ratio |
| --- | ---: | ---: | ---: |
| off | 508.687 s | 25.434 s | 1.0000 |
| shadow | 568.826 s | 28.441 s | 1.1182 |

The phase-specific diagnostic limit is 1.15. The estimator is disabled by default, so this cost is paid only when explicitly collecting feasibility telemetry.

## Rejected attempts

### Exhaustive local footprint enumeration

The first implementation enumerated bounded connected footprints for every clue for several placement candidates per round. Workflow run `29826302163` exceeded the complete three-mode baseline-equivalent wall-clock budget before finishing and was superseded. It was not cheap enough to satisfy the phase premise.

### Four-candidate regional ranking

Implementation head:

```text
54fa316b8efb3c8ddf2676cf1ba39894f6868938
```

Evidence:

```text
workflow run:    29828139362
artifact ID:     8494513591
artifact digest: sha256:b2e7b2391e7eb50446fda7bdb12e4e3c4135a37822972b3868836918464738e0
```

The ranking attempt improved aggregate density but failed the per-seed and editorial boundary:

- average panels: 5.30 → 5.10;
- average answers: 47.45 → 48.20;
- average crossings: 51.70 → 52.90;
- six seeds regressed in panel count;
- eleven seeds regressed in editorial penalty;
- average editorial penalty: 408.90 → 412.95;
- runtime ratio: 1.1613;
- no monotonic hard-capacity rejection occurred.

This demonstrates that local feasibility utility is not a safe placement objective. A locally attractive clue geometry can alter the complete construction and repair trajectory adversely.

### Ten-percent runtime gate

Implementation head:

```text
405987ac132d35a670ed354f5b00cac3561c3c9e
```

Evidence:

```text
workflow run:    29829584854
artifact ID:     8495089448
artifact digest: sha256:1b4bd5691ce9f3985e5baa5dfb1e1e60b4af6e1f9ec9692de07e722a21db70b1
```

One-candidate shadow and hard-guard both achieved 20/20 exact parity and zero false negatives. They failed only the provisional 1.10 runtime limit:

- shadow ratio: 1.1168;
- guard ratio: 1.1378;
- hard-guard rejections: 0.

The accepted boundary therefore removes guard from promotion and uses a documented 1.15 cap for opt-in diagnostic shadow mode.

## Tests and reproduction

```bash
node tools/clue-feasibility-estimator-test.cjs
node tools/clue-feasibility-shadow-parity-test.cjs
node tools/construction-pipeline-parity-test.cjs

SCANWORD_CLUE_FEASIBILITY_CONCURRENCY=2 \
SCANWORD_CLUE_FEASIBILITY_MODES=off,shadow \
SCANWORD_CLUE_FEASIBILITY_CANDIDATES=1 \
SCANWORD_CLUE_FEASIBILITY_ENFORCE=0 \
  node tools/clue-feasibility-checkpoint.cjs \
  research-output/clue-feasibility 20

node tools/clue-feasibility-acceptance-v1.cjs \
  research-output/clue-feasibility
```

## Accepted boundary and remaining work

Phase 5 establishes:

- a deterministic estimator attached to the real production attempt boundary;
- exact shadow parity;
- complete-state calibration against the unchanged allocator;
- zero observed false negatives on 5,180 completed states;
- explicit pipeline telemetry;
- a durable negative result for direct placement ranking.

It does not establish a profitable pruning policy. Future construction work may consume the telemetry, but any output-changing use must be evaluated as a complete search policy rather than justified by local estimator scores alone.
