# Arrowword Generator

A browser-based generator for Russian Swedish-style crosswords (arrowwords / scanwords) on an exact A5 page.

## Start here

New contributors and continuation chats should read:

- [`CONTINUATION.md`](CONTINUATION.md) — canonical current state and next work boundary;
- [`AGENTS.md`](AGENTS.md) — repository operating rules;
- [`docs/milestones/v1.3-complete-pipeline-frontier.md`](docs/milestones/v1.3-complete-pipeline-frontier.md) — accepted production layout baseline;
- [`docs/milestones/phase-12-exact-allocator-research-closure.md`](docs/milestones/phase-12-exact-allocator-research-closure.md) — Phase 12 closure and production handoff;
- [`research/exact-allocator-acceleration/README.md`](research/exact-allocator-acceleration/README.md) — complete Phase 12 evidence ledger.

## Current production baseline

The canonical browser path is:

```text
40,966-entry attributed corpus v8
-> deterministic 2,500/3,500 seed-specific working sets
-> indexed construction
-> exact clue allocation with linear top-three selection
-> width-four repair-potential complete-pipeline frontier
-> complete clue and repair chain per finalist
-> same-geometry editorial repair
-> complete structural validation
-> canonical panel-first final comparison
```

The explicit orchestrator remains the sole production `generateBest` owner.

### Browser defaults

```text
SCANWORD_CONSTRUCTION_MODE=portfolio
SCANWORD_VOCABULARY_PORTFOLIO=on
SCANWORD_VOCABULARY_PORTFOLIO_LIMITS=2500,3500
SCANWORD_VOCABULARY_PORTFOLIO_MODE=full
SCANWORD_EDITORIAL_REPAIR=on
SCANWORD_CATEGORY_BALANCE=off
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

This restores the canonical stable full-sort selector while preserving exact allocator behavior.

Exact Phase 9 frontier rollback:

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=off
```

Historical wrapper-chain rollback:

```text
SCANWORD_EXPLICIT_PIPELINE=off
```

## Phase 12 closure

Phase 12 accelerated exact clue allocation internally while preserving byte-identical output and deterministic RNG behavior.

### Production selector

The accepted linear top-three selector replaced the full jitter-ranked candidate sort without changing the chosen candidate domain, RNG sequence, restart behavior or final digests. It is now the browser and Node production default.

| seed set | exact/audit parity | allocator ratio | total ratio | fallbacks/errors |
| --- | ---: | ---: | ---: | ---: |
| development-20 | 20/20 | 0.9590 | 0.9940 | 0/0 |
| promotion-50 | 50/50 | 0.9500 | 0.9900 | 0/0 |
| stability-100 | 100/100 | 0.9562 | 0.9891 | 0/0 |

Frozen selector implementation:

```text
5db8d25de2422ce1f62d21d4ffa2da7bb3cafb3e
refs/heads/research/archive-phase-12-linear-top-three-selector-2026-07-30
```

Default-promotion head:

```text
77616780d11377f1fe44bcd74d17ba8f0adb5cae
refs/heads/research/archive-phase-12-exact-selector-default-promotion-2026-07-31
```

### Default-off occupancy index

The exact occupancy compatibility index also passed development, promotion and stability without output, audit or RNG drift. On stability-100 it reduced aggregate allocator time by 9.88% and aggregate total runtime by 1.70%.

| seed set | exact/audit parity | allocator ratio | total ratio | fallbacks/errors |
| --- | ---: | ---: | ---: | ---: |
| development-20 | 20/20 | 0.8845 | 0.9937 | 0/0 |
| promotion-50 | 50/50 | 0.8814 | 0.9856 | 0/0 |
| stability-100 | 100/100 | 0.9012 | 0.9830 | 0/0 |

Frozen occupancy implementation and stability evidence:

```text
a5826b4e250ce39da71edfa0aa715c12146c7992
refs/heads/research/archive-phase-12-exact-occupancy-index-implementation-2026-07-31

2036baa507a829abd6966a74911d0aee06054984
refs/heads/research/archive-phase-12-exact-occupancy-index-stability-2026-08-04
```

The occupancy index remains accepted, reversible and default-off:

```text
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
```

Stability-100 concludes Phase 12 algorithm experimentation. Expensive Phase 12 promotion and stability checkpoints are manual-only; normal pull requests retain lightweight exact parity coverage.

## Current work boundary

There is no automatically scheduled Phase 13. Do not start another algorithm experiment merely because Phase 12 is complete.

New algorithm research requires a concrete trigger such as:

- a reproducible production defect;
- a measured product/runtime requirement the current baseline misses;
- a quality regression or new acceptance objective;
- a product feature whose implementation exposes a specific algorithmic bottleneck.

Until such a trigger exists, prioritize productization, release robustness, UX/export/print behavior and regression coverage around the accepted generator.

## Production ownership

```text
active generateBest owner: construction-pipeline-v1
execution owner:            direct-production-stage-runtime-v2
rollback owner:             legacy-wrapper-chain
installation lock:          explicit-pipeline-v1
```

The direct source executes:

```text
construction portfolio and repair-potential frontier
-> portfolio polish
-> clue-footprint repack
-> adaptive clue repack
-> clue-tail absorption
-> single-footprint clue reflow
-> pair clue reflow
-> targeted residual-victim repair
-> shared baseline guard
-> editorial repair
-> complete final comparison
```

## Structural guarantees

A result is eligible only when:

1. every contiguous letter run of length two or more is exactly one assigned answer;
2. every letter belongs to an assigned answer;
3. all crossing letters agree;
4. every clue footprint resolves to a real arrow and answer start;
5. every answer has an admitted exact clue;
6. the answer graph has exactly one connected component;
7. no accidental runs, orphan letters, duplicate directional occupancy or clue conflicts exist;
8. every residual area is an explicit panel cell.

The complete validator remains the acceptance authority.

## Corpus

The generated v8 corpus contains 40,966 unique clue-bearing entries. Generated chunks are build artifacts; change `tools/build-bulk-lexicon-v8.py` or its documented source policy and regenerate the manifest, loader and every chunk together.

## Running locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Core quality gates

```bash
node tools/bulk-lexicon-audit.cjs
node tools/dictionary-count-v3.cjs
node tools/complete-pipeline-frontier-test-v1.cjs
node tools/construction-stage-runtime-test-v2.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/wrapper-retirement-test-v1.cjs
node tools/preallocation-structural-frontier-test-v1.cjs
node tools/preallocation-repair-potential-test-v1.cjs
node tools/preallocation-ranked-frontier-test-v1.cjs
node tools/preallocation-filter-test-v1.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-top-three-test-v1.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-occupancy-index-test-v1.cjs
```

Historical locked configurations set feature modes explicitly and must remain reproducible.

## Repository map

```text
index.html                                  browser defaults and script order
solver.js                                   base placement, metrics and validation
construction-portfolio.js                   construction ranking and complete frontier
construction-preallocation-*.js             default-off Phase 11 research
construction-exact-allocator-top-three-v1.js accepted production selector
construction-exact-allocator-occupancy-index-v1.js accepted default-off Phase 12 candidate
construction-exact-allocator-profile-v1.js  default-off exact allocator profiler
construction-stage-runtime-v2.js            complete finalist processing and comparison
construction-pipeline-v1.js                 sole production orchestrator
research/                                   evidence ledgers and negative results
docs/milestones/                            accepted and closed phase decisions
tools/                                      builders, tests and benchmarks
CONTINUATION.md                              canonical handoff and current work boundary
```

## Merge and archive policy

- `main` is the only long-lived development branch.
- Every logical phase or documentation block is squash-merged.
- Exact implementation heads are preserved under immutable `research/archive-*` refs before documentation-only commits.
- Negative experiments and harness defects remain documented and reproducible.
- Promotion and stability seeds are never tuning data.
