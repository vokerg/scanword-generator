# Arrowword Generator

A browser-based generator for Russian Swedish-style crosswords (arrowwords / scanwords) on an exact A5 page.

## Current project baseline: vocabulary-first 1.1

This repository is an actively developed draft. The current baseline combines a **40,966-entry attributed corpus**, deterministic 2,500/3,500 active-set portfolios, same-geometry editorial repair and complete structural validation.

The 1.1 corpus adds filtered rivers, regions, mountains, peaks, lakes, islands and related geographic entities; uses language-tagged preferred Russian GeoNames; and drops colliding fallback aliases instead of retaining malformed or historical spellings.

The decision record is [Milestone 1.1](docs/milestones/v1.1-vocabulary-greatness.md). Architecture and contribution rules are in [AGENTS.md](AGENTS.md). The full experiment ledger, including rejected corpus-selection variants, is in [Vocabulary Greatness 1.1](research/vocabulary-greatness-1.1/README.md).

## Validated density baseline

The canonical browser-equivalent 20-seed checkpoint for the 39,586-entry predecessor remains the structural reference while the new 40,966-entry corpus receives longer follow-up runs:

| metric | former dictionary + repair | vocabulary portfolio + repair |
| --- | ---: | ---: |
| average residual panels | 7.05 | **5.30** |
| average answers | 44.75 | **48.45** |
| average crossings | 47.35 | **53.00** |
| average answer-space coverage | 93.98% | **95.53%** |
| average formulaic short answers | 0.40 | **0.15** |
| average browser-equivalent runtime | 10.86 s | **24.48 s** |

All 20 selected candidates were structurally valid, used exact clues and contained one connected answer component.

The optional adaptive portfolio reproduced the full portfolio result exactly on 10/10 tested seeds and reduced average runtime by 6.57%. It remains an explicit experimental mode rather than a silent browser-default change.

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
```

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

The full two-candidate portfolio typically takes about 20–25 seconds in release-gate environments. Adaptive mode is available for bounded experiments:

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
```

The canonical Node bootstrap mirrors browser corpus and wrapper load order. Release records include source-corpus size, active limit, panels, answers, crossings, coverage, editorial metrics, runtime, category usage and complete structural validation.

## Rollback and A/B controls

```text
SCANWORD_BULK_LEXICON=off                    use the former construction dictionary
SCANWORD_VOCABULARY_PORTFOLIO=off            construct one active working set
SCANWORD_VOCABULARY_PORTFOLIO_MODE=adaptive  allow the conservative fast path
SCANWORD_EDITORIAL_REPAIR=off                disable same-geometry cleanup
SCANWORD_CATEGORY_BALANCE=on                 enable the retained category-cap experiment
SCANWORD_CONSTRUCTION_MODE=legacy            use the original construction path
```

## Canonical repository structure

```text
index.html                          browser defaults and script order
bulk-lexicon-runtime.js             corpus registration and metadata
bulk-lexicon/                       generated corpus, loader and manifest
core.js                             dictionary utilities and active-set selection
dictionary-policy.js                dictionary admission policy
solver.js                           base placement, metrics and validation
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
- [Vocabulary-first program](research/vocabulary-first/README.md)
- [Vocabulary Greatness 1.1](research/vocabulary-greatness-1.1/README.md)
- [Lexical-quality experiments](research/lexical-quality/README.md)

## Known debt and next investigation

The project does not claim zero-panel generation or publication-ready clue prose. Current priorities are:

- measure the committed 40,966-entry corpus on longer identical-seed checkpoints;
- reduce repeated and generic clues in selected grids, not only in the source corpus;
- add source-aware candidate tie-breakers without weakening the density hierarchy;
- tune the adaptive portfolio on a larger sample;
- broaden reviewed non-geographic subjects such as science, arts, sport and history.
