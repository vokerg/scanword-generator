# Arrowword Generator

A browser-based generator for Russian Swedish-style crosswords (arrowwords / scanwords) on an exact A5 page.

## Start here

New contributors and continuation chats should read:

- [`CONTINUATION.md`](CONTINUATION.md) — current production state, Phase 11 closure and exact next steps;
- [`AGENTS.md`](AGENTS.md) — repository operating rules;
- [`docs/milestones/v1.3-complete-pipeline-frontier.md`](docs/milestones/v1.3-complete-pipeline-frontier.md) — accepted production baseline;
- [`research/preallocation-structural-frontier/README.md`](research/preallocation-structural-frontier/README.md) — complete Phase 11 evidence and negative result.

## Current production baseline: complete frontier 1.3

The canonical browser path is:

```text
40,966-entry attributed corpus v8
-> deterministic 2,500/3,500 seed-specific working sets
-> indexed construction and exact clue allocation
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
```

Exact Phase 9 rollback:

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=off
```

Historical wrapper-chain rollback:

```text
SCANWORD_EXPLICIT_PIPELINE=off
```

## Accepted Phase 10 evidence

All 170 locked A/B pairs were valid, connected and exact-clue-only. The width-four complete frontier had zero canonical regressions.

| seed set | wins | ties | regressions | panels baseline → frontier | runtime ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| development-20 | 16 | 4 | 0 | 5.30 → 4.65 | 1.1676 |
| promotion-50 | 41 | 9 | 0 | 5.10 → 4.60 | 1.1815 |
| stability-100 | 63 | 37 | 0 | 4.84 → 4.37 | 1.1850 |

Frozen Phase 10 implementation:

```text
df537dd5f47712062fb6224d4e42cb67e41876b3
refs/heads/research/archive-phase-10-complete-pipeline-frontier-evidence-2026-07-23
```

## Phase 11 research closure

Phase 11 moved a deterministic frontier before exact clue allocation and measured real allocator work.

The width-96 rank-only filter achieved:

| seed set | exact parity | total allocation reduction | runtime ratio |
| --- | ---: | ---: | ---: |
| development-20 | 20/20 | 48.46% | 0.9146 |
| promotion-50 | 50/50 | 48.79% | 0.9306 |
| stability-100 | 99/100 | 48.98% | 0.9442 |

Production promotion is rejected because `v8-stability-058` changed from 4 residual panels to 7. The result remained valid and exact-clue-only, but violated the primary canonical objective.

The Phase 11 code, telemetry, deterministic tests, rejected variants and benchmark harness remain on `main` as default-off research:

```text
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off
```

Frozen implementation:

```text
5f8fb8dcb446d1dcf13e1ef5fc1cee0c151906e4
refs/heads/research/archive-phase-11-preallocation-structural-filter-evidence-2026-07-25
```

See [`docs/milestones/phase-11-preallocation-research-closure.md`](docs/milestones/phase-11-preallocation-research-closure.md).

## Next investigation

Phase 12 should accelerate exact clue allocation internally instead of skipping candidates:

```text
profile assignClueTextCellsV2
-> cache immutable geometry/domain work
-> reuse safe work across deterministic restarts
-> add admissible branch-and-bound pruning
-> preserve exact selected layouts and digests
-> validate on fresh seed sets
```

Do not tune against Phase 11 promotion or stability seeds. The detailed execution boundary is in [`CONTINUATION.md`](CONTINUATION.md).

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
```

Historical locked configurations set feature modes explicitly and must remain reproducible.

## Repository map

```text
index.html                                  browser defaults and script order
solver.js                                   base placement, metrics and validation
construction-portfolio.js                   construction ranking and Phase 10 frontier
construction-preallocation-*.js             default-off Phase 11 research
construction-stage-runtime-v2.js            complete finalist processing and comparison
construction-pipeline-v1.js                 sole production orchestrator
research/                                   evidence ledgers and negative results
docs/milestones/                            accepted and closed phase decisions
tools/                                      builders, tests and benchmarks
CONTINUATION.md                              canonical handoff and next plan
```

## Merge and archive policy

- `main` is the only long-lived development branch.
- Every logical phase or documentation block is squash-merged.
- Exact implementation heads are preserved under immutable `research/archive-*` refs before documentation-only commits.
- Negative experiments and harness defects remain documented and reproducible.
- Promotion and stability seeds are never tuning data.
