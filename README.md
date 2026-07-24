# Arrowword Generator

A browser-based generator for Russian Swedish-style crosswords (arrowwords / scanwords) on an exact A5 page.

## Current project baseline: complete frontier 1.3

The project is an actively developed draft. Its canonical browser path is:

```text
40,966-entry attributed corpus v8
-> deterministic 2,500/3,500 seed-specific working sets
-> indexed construction and exact clue allocation
-> width-four repair-potential frontier
-> complete clue and repair chain per finalist
-> same-geometry editorial repair
-> complete structural validation
-> canonical panel-first final comparison
```

The explicit orchestrator remains the sole production `generateBest` owner. Phase 10 changes candidate retention and selected outputs, not global ownership.

Decision records:

- [Milestone 1.3 — bounded complete-pipeline frontier](docs/milestones/v1.3-complete-pipeline-frontier.md)
- [Phase 10 evidence ledger](research/complete-pipeline-frontier/README.md)
- [Milestone 1.2 — explicit production pipeline](docs/milestones/v1.2-explicit-pipeline-default.md)
- [Architecture and contribution rules](AGENTS.md)

## Accepted Phase 10 evidence

All locked development, promotion and stability A/B pairs were valid, connected and exact-clue-only. The accepted frontier had zero canonical regressions.

| seed set | wins | ties | regressions | residual panels | runtime ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| development-20 | 16 | 4 | 0 | 5.30 → **4.65** | 1.1676 |
| promotion-50 | 41 | 9 | 0 | 5.10 → **4.60** | 1.1815 |
| stability-100 | 63 | 37 | 0 | 4.84 → **4.37** | 1.1850 |

The exact Phase 9 result is immutable frontier member zero and wins complete ties. The runtime cap was 1.35.

Frozen implementation:

```text
df537dd5f47712062fb6224d4e42cb67e41876b3
refs/heads/research/archive-phase-10-complete-pipeline-frontier-evidence-2026-07-23
```

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

Node benchmarks set frontier mode explicitly. Historical baseline configurations remain reproducible rather than silently inheriting a new flag.

## Production ownership

```text
active generateBest owner: construction-pipeline-v1
execution owner:            direct-production-stage-runtime-v2
rollback owner:             legacy-wrapper-chain
installation lock:          explicit-pipeline-v1
```

The accepted direct source now executes:

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

The legacy guard is generated once and cloned per finalist. Frontier width does not multiply unrestricted construction attempts.

## Repair-potential frontier

The frontier preserves the exact local construction winner and retains at most four non-dominated candidates. Its deterministic vector includes:

```text
residual panels, panel regions and isolated panels
residual concentration
letter cells, crossings and answers
weak fill, clue-text cells and external clue capacity
```

Residual topology allows a candidate with a small current panel disadvantage to survive when its remaining cells are more concentrated and repairable. Only complete valid connected exact-clue results can win the final comparison.

Final priority is lexicographic:

1. fewer residual panels;
2. more answers;
3. more crossings;
4. greater raw-letter coverage;
5. fewer formulaic short answers;
6. lower editorial penalty;
7. lower selected-grid clue debt;
8. higher solver score;
9. exact member-zero preference on complete ties.

## Retained research features

### Bounded full-corpus retrieval

`SCANWORD_FULL_CORPUS_RETRIEVAL=on` permits bounded fixed-letter pattern retrieval from the complete admitted corpus during same-geometry repair. It remains off by default. See [the retrieval ledger](research/full-corpus-retrieval/README.md).

### Incremental clue-feasibility diagnostics

`SCANWORD_CLUE_FEASIBILITY=shadow` observes regional clue capacity without changing output. Direct local ranking was rejected because its modest density improvement caused complete-objective regressions. See [the feasibility ledger](research/clue-feasibility/README.md).

### Bounded partial-state search

`SCANWORD_PARTIAL_SEARCH=beam` adds a deterministic late-placement beam while preserving exact greedy replay. Its density gain remains too expensive for the default. See [bounded search](research/bounded-partial-search/README.md) and [adaptive search](research/adaptive-partial-search/README.md).

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
SCANWORD_COMPLETE_PIPELINE_FRONTIER=off \
  node tools/construction-stage-runtime-test-v2.cjs
node tools/complete-pipeline-frontier-test-v1.cjs

SCANWORD_FRONTIER_CONCURRENCY=4 \
SCANWORD_FRONTIER_RUNTIME_RATIO=1.35 \
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4 \
SCANWORD_FRONTIER_REQUIRE_WIN=1 \
  node tools/complete-pipeline-frontier-checkpoint-v1.cjs \
  research/baselines/seed-sets/development-20.json \
  research-output/complete-pipeline-frontier/development-20.jsonl
```

Use the dedicated workflow for the sequential locked development-20, promotion-50 and stability-100 boundary.

## Rollback and A/B controls

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=off         exact Phase 9 single-candidate path
SCANWORD_EXPLICIT_PIPELINE=off                  historical complete wrapper chain
SCANWORD_VOCABULARY_PORTFOLIO_MODE=adaptive    conservative active-set early acceptance
SCANWORD_FULL_CORPUS_RETRIEVAL=on               bounded constrained-pattern retrieval
SCANWORD_CLUE_FEASIBILITY=shadow                exact-parity feasibility telemetry
SCANWORD_PARTIAL_SEARCH=beam                    bounded complete-pipeline beam probe
```

## Repository map

```text
index.html                                      browser defaults and script order
bulk-lexicon/                                   generated corpus, loader and manifest
solver.js                                       base placement, metrics and validation
construction-portfolio.js                       construction ranking and retained frontier
construction-stage-runtime-v2.js                complete finalist processing and comparison
construction-stage-source-anchor-v2.js          pre-wrapper production source
construction-candidate-state-v1.js              explicit state, cloning and signatures
construction-pipeline-v1.js                     sole production orchestrator
construction-wrapper-retirement-audit-v1.js     ownership/default audit
construction-*.js                               construction and repair algorithms
editorial-*.js                                  lexical policy and repair vocabulary
renderer.js, ui.js                              A5 rendering, controls and exports
research/                                       evidence ledgers and negative results
docs/milestones/                                accepted project boundaries
tools/                                          builders, tests and benchmarks
```

## Known debt and next investigation

The project does not claim zero-panel generation or publication-ready clue prose. Phase 10 retains candidates only after exact clue allocation. The next bounded optimization should move a cheap structural frontier before exact allocation, allocate clues only for finalists, and prove either complete output parity or a separately accepted quality improvement with measured allocation savings.