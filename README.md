# Arrowword Generator

A browser-based generator for Russian Swedish-style crosswords (arrowwords / scanwords) on an exact A5 page.

## Current project baseline: vocabulary-first 1.1

This repository is an actively developed draft. The current baseline combines a **40,966-entry attributed corpus**, deterministic 2,500/3,500 active-set portfolios, same-geometry editorial repair and complete structural validation.

The 1.1 corpus adds filtered rivers, regions, mountains, peaks, lakes, islands and related geographic entities; uses language-tagged preferred Russian GeoNames; and drops colliding fallback aliases instead of retaining malformed or historical spellings.

The decision record is [Milestone 1.1](docs/milestones/v1.1-vocabulary-greatness.md). Architecture and contribution rules are in [AGENTS.md](AGENTS.md). The full experiment ledger, including rejected corpus-selection variants, is in [Vocabulary Greatness 1.1](research/vocabulary-greatness-1.1/README.md).

## Locked v8 baseline

Phase 2 locks the committed 40,966-entry corpus against disjoint development, promotion and stability seed sets. All 170 accepted runs were structurally valid, contained one connected answer component, used exact clues only and passed the preserved coverage checkpoint.

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

The locked protocol, seed files, budgets, aggregate metrics and evidence digests are documented in [Phase 2 baseline](research/baselines/v8-production-1.1/README.md). Promotion and stability seeds must not be used as tuning targets.

The baseline is stable but remains far from zero-panel generation: none of the 170 locked seeds produced a zero-panel result. Later density work therefore requires architectural improvements rather than interpreting small three-seed fluctuations as progress.

## Default pipeline

```text
load attributed source corpus
-> derive 2,500- and 3,500-entry seed-specific working sets
-> construct connected candidates and clue footprints
-> apply same-geometry editorial repair
-> select panel-first
-> validate runs, crossings, clues and connectivity
```

The browser enables this path explicitly in `index.html`:

```text
SCANWORD_CONSTRUCTION_MODE=portfolio
SCANWORD_VOCABULARY_PORTFOLIO=on
SCANWORD_VOCABULARY_PORTFOLIO_LIMITS=2500,3500
SCANWORD_VOCABULARY_PORTFOLIO_MODE=full
SCANWORD_EDITORIAL_REPAIR=on
SCANWORD_CATEGORY_BALANCE=off
SCANWORD_EXPLICIT_PIPELINE=off
SCANWORD_FULL_CORPUS_RETRIEVAL=off
SCANWORD_FULL_CORPUS_RETRIEVAL_MODE=empty
```

## Explicit pipeline parity

Phase 3 adds an opt-in `CandidateState` pipeline around the complete accepted production generator:

```text
legacy-source
-> base-construction
-> clue-allocation
-> current-repair-chain
-> validation
-> comparison
```

The explicit mode records candidate signatures, stage timing, candidate counts, provenance and validation while returning the exact browser-compatible result. On the locked development-20 set it achieved 20/20 exact parity for full grids, placed answers, clues and geometry with a 0.9991 aggregate runtime ratio. It remains disabled by default.

```text
SCANWORD_EXPLICIT_PIPELINE=on
```

The accepted boundary and its remaining compatibility debt are documented in [Explicit pipeline parity](research/explicit-pipeline/README.md).

## Bounded full-corpus retrieval

Phase 4 adds an opt-in two-level retrieval boundary for constrained same-geometry repairs. The normal 2,500/3,500-entry hot set remains the construction prior. Exact patterns containing at least one fixed letter may retrieve a bounded domain from the complete admitted runtime vocabulary; all-wildcard full-pool sampling is rejected.

```text
SCANWORD_FULL_CORPUS_RETRIEVAL=on
SCANWORD_FULL_CORPUS_RETRIEVAL_MODE=empty|small-poor
```

The retrieval-enhanced and hot-only **complete editorial repair chains** are compared on cloned candidates. Retrieval is accepted only for identical structure, complete validity, exact clues, no two-letter increase and a strict final editorial improvement. Equal or worse output preserves the hot-only result.

On the locked development-20 set, all three compared modes remained valid and structurally identical. `small-poor` expanded four constrained domains and surfaced fourteen candidates; none beat the complete hot-only chain, so no fallback answer entered a final grid. Runtime ratios were 1.0392 for `empty` and 1.0206 for `small-poor`. The feature remains off by default.

The accepted evidence and three rejected local-ordering attempts are documented in [Full-corpus retrieval](research/full-corpus-retrieval/README.md).

## Structural guarantees

A result is accepted only when:

1. every contiguous letter run of length two or more is exactly one assigned answer;
2. every letter belongs to at least one assigned answer;
3. all crossing letters agree;
4. every clue footprint points to an existing arrow and answer;
5. every used answer has an admitted exact clue;
6. the answer graph has exactly one connected component;
7. residual areas are explicit panel cells rather than unassigned letter cells.

The renderer supports right and down answers, dual arrow cells, one-to-four-cell clue footprints, A5 SVG export, JSON export and answer-reveal mode.

## Corpus 1.1

The committed generated corpus contains 40,966 unique clue-bearing entries:

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

Audit checkpoint:

- zero invalid normalized answers in the generated manifest;
- source and license metadata retained;
- 24,457 sourced noun definitions;
- 10,841 descriptive factual templates;
- 5,668 generic templates, or **13.84%**, down from 38.24%;
- 1,469 admitted non-city geographic entities;
- 8,996 city entries with a preferred Russian GeoNames mapping available;
- canonical letters-only exceptions recorded by source ID, including `УЛАНБАТОР`.

Generated chunks are artifacts. Do not hand-edit them. Change `tools/build-bulk-lexicon-v8.py` or its documented source policy and regenerate the manifest, loader and every chunk together.

## Running locally

Open `index.html` directly in a modern browser, or serve the repository:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

The full two-candidate portfolio typically takes about 20–30 seconds in release-gate environments. Adaptive mode is available for bounded experiments:

```text
SCANWORD_VOCABULARY_PORTFOLIO_MODE=adaptive
```

## Quality gates

```bash
node tools/bulk-lexicon-audit.cjs
node tools/dictionary-count-v3.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/vocabulary-release-checkpoint.cjs 20
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/vocabulary-adaptive-checkpoint.cjs 20
node tools/construction-pipeline-parity-test.cjs
SCANWORD_PIPELINE_CONCURRENCY=2 \
  node tools/construction-pipeline-checkpoint.cjs \
  20 research-output/explicit-pipeline/development-parity.jsonl
node tools/full-corpus-pattern-index-test.cjs
node tools/full-corpus-pair-priority-test.cjs
node tools/full-corpus-repair-selection-test.cjs
SCANWORD_RETRIEVAL_CONCURRENCY=2 \
SCANWORD_RETRIEVAL_ENFORCE=1 \
  node tools/full-corpus-retrieval-checkpoint.cjs \
  20 research-output/full-corpus-retrieval
```

The canonical Node bootstrap mirrors browser corpus and wrapper/pipeline load order. Release records include source-corpus size, active limit, panels, answers, crossings, coverage, editorial metrics, runtime, category usage and complete structural validation.

## Rollback and A/B controls

```text
SCANWORD_BULK_LEXICON=off                    use the former construction dictionary
SCANWORD_VOCABULARY_PORTFOLIO=off            construct one active working set
SCANWORD_VOCABULARY_PORTFOLIO_MODE=adaptive  allow the conservative fast path
SCANWORD_EDITORIAL_REPAIR=off                disable same-geometry cleanup
SCANWORD_CATEGORY_BALANCE=on                 enable the retained category-cap experiment
SCANWORD_CONSTRUCTION_MODE=legacy            use the original construction path
SCANWORD_EXPLICIT_PIPELINE=on                 enable explicit state and stage telemetry
SCANWORD_FULL_CORPUS_RETRIEVAL=on             enable bounded constrained-pattern retrieval
SCANWORD_FULL_CORPUS_RETRIEVAL_MODE=empty     restrict fallback to empty hot domains
SCANWORD_FULL_CORPUS_RETRIEVAL_MODE=small-poor evaluate small or poor hot domains too
```

## Canonical repository structure

```text
index.html                          browser defaults and script order
bulk-lexicon-runtime.js             corpus registration and metadata
bulk-lexicon/                       generated corpus, loader and manifest
core.js                             dictionary utilities and active-set selection
dictionary-policy.js                dictionary admission policy
full-corpus-pattern-index-v1.js     bounded exact-pattern retrieval index
solver.js                           base placement, metrics and validation
construction-candidate-state-v1.js  explicit candidate-state contract
construction-pipeline-*.js          explicit stage orchestration and telemetry
construction-*.js                   bounded construction and repair stages
editorial-*.js                      lexical policy and repair vocabulary
renderer.js                         A5 SVG renderer
ui.js                               browser controls and exports
tools/                              audits, builders, tests and benchmarks
docs/milestones/                    accepted project baselines
research/                           chronological experiments and negative results
.github/workflows/                  gates and research reproduction
AGENTS.md                           canonical architecture and change rules
```

## Research archive and branch policy

Canonical experiment descriptions, manifests, reproduction commands and milestone evidence belong in `main`. Short-lived branches are working references and may be deleted after squash merge.

Key dossiers:

- [Closed-fill research](research/closed-fill/README.md)
- [Explicit pipeline parity](research/explicit-pipeline/README.md)
- [Full-corpus retrieval](research/full-corpus-retrieval/README.md)
- [Vocabulary-first program](research/vocabulary-first/README.md)
- [Vocabulary Greatness 1.1](research/vocabulary-greatness-1.1/README.md)
- [Lexical-quality experiments](research/lexical-quality/README.md)

## Known debt and next investigation

The project does not claim zero-panel generation or publication-ready clue prose. Current priorities are:

- estimate clue feasibility before committing structural search to answer domains that cannot fit usable clue footprints;
- migrate successful construction and repair behavior from the historical wrapper chain into normal explicit stages;
- reduce repeated and generic selected-grid clues without weakening structural density;
- evaluate broader full-corpus integration only through complete-chain or complete-pipeline acceptance;
- preserve the locked promotion and stability sets for frozen-candidate evaluation only.
