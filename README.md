# Arrowword Generator

A browser-based generator for Russian Swedish-style crosswords (arrowwords / scanwords) on an exact A5 page.

## Current project baseline: explicit pipeline 1.2

The project is an actively developed draft. Its canonical production path combines:

```text
40,966-entry attributed corpus v8
-> deterministic 2,500/3,500 seed-specific working sets
-> directly ordered construction, clue and repair stages
-> same-geometry editorial repair
-> panel-first complete-candidate selection
-> complete structural validation
```

The explicit orchestrator is now the sole production `generateBest` owner. The historical cumulative wrapper chain remains available only as an explicit rollback source.

Decision records:

- [Milestone 1.2 — explicit production pipeline](docs/milestones/v1.2-explicit-pipeline-default.md)
- [Phase 9 ledger](research/explicit-default/README.md)
- [Architecture and contribution rules](AGENTS.md)

## Locked v8 baseline

Phase 2 froze disjoint development, promotion and stability seed sets for the committed corpus. All 170 runs were structurally valid, connected, exact-clue-only and checkpoint passing.

| metric | development-20 | promotion-50 | stability-100 |
| --- | ---: | ---: | ---: |
| average residual panels | 5.30 | 5.10 | 4.82 |
| zero-panel rate | 0% | 0% | 0% |
| average answers | 47.45 | 47.70 | 48.45 |
| average crossings | 51.70 | 51.96 | 52.78 |
| average answer-space coverage | 95.50% | 95.67% | 95.92% |
| average formulaic short answers | 0.00 | 0.02 | 0.04 |
| average selected-grid clue debt | 15.35 | 13.82 | 13.16 |
| average browser-equivalent runtime | 26.07 s | 26.49 s | 25.54 s |

The protocol and evidence are in [the Phase 2 baseline ledger](research/baselines/v8-production-1.1/README.md). Promotion and stability seeds are frozen evaluation sets, not tuning targets.

## Browser defaults

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
SCANWORD_FULL_CORPUS_RETRIEVAL=off
SCANWORD_CLUE_FEASIBILITY=off
SCANWORD_PARTIAL_SEARCH=off
```

Explicit rollback:

```text
SCANWORD_EXPLICIT_PIPELINE=off
```

## Explicit production ownership

```text
active generateBest owner: construction-pipeline-v1
execution owner:            direct-production-stage-runtime-v2
rollback owner:             legacy-wrapper-chain
```

CandidateState stage contract:

```text
production-stage-source
-> base-construction
-> clue-allocation
-> current-repair-chain
-> validation
-> comparison
```

The direct single-candidate source invokes the accepted stages in their production order:

```text
pre-portfolio construction source
-> construction portfolio
-> portfolio polish
-> clue-footprint repack
-> adaptive clue repack
-> clue-tail absorption
-> single-footprint clue reflow
-> pair clue reflow
-> targeted residual-victim repair
-> baseline guard
-> editorial repair
```

Phase 9 validated exact output parity against rollback:

| seed set | exact pairs | failures | explicit / rollback runtime |
| --- | ---: | ---: | ---: |
| development-20 | 20/20 | 0 | 0.9692 |
| promotion-50 | 50/50 | 0 | 0.9850 |
| stability-100 | 100/100 | 0 | 0.9915 |

Every pair had identical grid, answer, clue and geometry digests. See [Phase 9](research/explicit-default/README.md).

## Retained research features

### Bounded full-corpus retrieval

`SCANWORD_FULL_CORPUS_RETRIEVAL=on` permits bounded fixed-letter pattern retrieval from the complete admitted corpus during same-geometry repair. It never reintroduces unconstrained full-pool sampling and remains off by default. See [the retrieval ledger](research/full-corpus-retrieval/README.md).

### Incremental clue-feasibility diagnostics

`SCANWORD_CLUE_FEASIBILITY=shadow` observes regional clue capacity without changing output. Direct local ranking was rejected because its modest density improvement caused panel and editorial regressions. The feature remains off by default. See [the feasibility ledger](research/clue-feasibility/README.md).

### Bounded partial-state search

`SCANWORD_PARTIAL_SEARCH=beam` adds a deterministic late-placement beam while preserving the exact greedy baseline. On development-20 it improved average panels from 5.30 to 4.90 with no complete-objective regressions, but runtime rose by about 65%, so it remains off by default. Phase 7's adaptive policy reduced additive beam work but did not make it a production default. See [bounded search](research/bounded-partial-search/README.md) and [adaptive search](research/adaptive-partial-search/README.md).

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

The validator remains the acceptance authority.

## Corpus

The generated v8 corpus contains 40,966 unique clue-bearing entries:

| category group | entries |
| --- | ---: |
| common nouns | 4,358 |
| specialist nouns | 20,099 |
| given names | 2,798 |
| surnames | 2,087 |
| patronymics | 115 |
| cities | 9,752 |
| capitals | 163 |
| countries | 125 |
| regions | 397 |
| rivers | 328 |
| mountains, ranges, peaks and hills | 429 |
| lakes, seas and bays | 118 |
| islands and island groups | 109 |
| valleys, plateaus and volcanoes | 88 |

Generated chunks are build artifacts. Change `tools/build-bulk-lexicon-v8.py` or its documented source policy and regenerate the manifest, loader and every chunk together.

## Running locally

Open `index.html`, or serve the repository:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Core quality gates

```bash
node tools/bulk-lexicon-audit.cjs
node tools/dictionary-count-v3.cjs
node tools/wrapper-retirement-test-v1.cjs
node tools/construction-stage-runtime-test-v2.cjs
SCANWORD_EXPLICIT_PIPELINE=off node tools/construction-pipeline-parity-test.cjs

NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/vocabulary-release-checkpoint.cjs 20

node tools/explicit-default-parity-checkpoint-v1.cjs \
  research/baselines/seed-sets/development-20.json \
  research-output/explicit-default/development-20.jsonl
```

Run the dedicated workflow for the locked 20/50/100 promotion boundary.

## Rollback and A/B controls

```text
SCANWORD_EXPLICIT_PIPELINE=off                 execute the historical complete wrapper chain
SCANWORD_VOCABULARY_PORTFOLIO_MODE=adaptive   enable conservative active-set early acceptance
SCANWORD_FULL_CORPUS_RETRIEVAL=on              enable bounded constrained-pattern retrieval
SCANWORD_FULL_CORPUS_RETRIEVAL_MODE=empty      retrieve only for empty hot domains
SCANWORD_FULL_CORPUS_RETRIEVAL_MODE=small-poor also evaluate small or poor hot domains
SCANWORD_CLUE_FEASIBILITY=shadow               collect exact-parity feasibility telemetry
SCANWORD_CLUE_FEASIBILITY=rank                 run the rejected local-ranking experiment
SCANWORD_CLUE_FEASIBILITY=guard                run the unpromoted hard-capacity experiment
SCANWORD_PARTIAL_SEARCH=shadow                 audit bounded search with exact output parity
SCANWORD_PARTIAL_SEARCH=beam                   add the complete-pipeline beam probe
```

## Repository map

```text
index.html                                      browser defaults and script order
bulk-lexicon/                                   generated corpus, loader and manifest
solver.js                                       base placement, metrics and validation
construction-stage-source-anchor-v2.js          pre-wrapper production source
construction-stage-runtime-v2.js                directly ordered production stages
construction-candidate-state-v1.js              explicit state, cloning and signatures
construction-pipeline-v1.js                     sole production orchestrator
construction-wrapper-retirement-audit-v1.js     ownership/default audit
construction-*.js                               construction and repair algorithms
editorial-*.js                                  lexical policy and repair vocabulary
renderer.js, ui.js                              A5 rendering, controls and exports
research/                                       experiment ledgers and negative results
docs/milestones/                                accepted project boundaries
tools/                                          builders, tests and benchmarks
```

## Known debt and next investigation

The project does not claim zero-panel generation or publication-ready clue prose. The original complete-pipeline Pareto-frontier phase was deferred while search budgets and orchestration were stabilized. The next density investigation should return to that frontier using the explicit pipeline, preserve the exact baseline candidate, and compare finalists only after clue allocation, repair, editorial cleanup and complete validation.
