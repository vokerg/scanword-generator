# Arrowword Generator

A browser-based generator for Russian Swedish-style crosswords (arrowwords / scanwords) on an exact A5 page.

## Current milestone: vocabulary-first 1.0

The default 13 × 17 generator uses a **39,586-entry attributed source corpus** before construction. For each seed it builds complete candidates from deterministic 2,500- and 3,500-entry working sets, applies same-geometry editorial repair, then selects the best valid grid panel-first.

The release decision, evidence, rollback controls and accepted debt are pinned in [Milestone 1.0](docs/milestones/v1.0-vocabulary-first.md). The canonical repository map and contribution rules are in [AGENTS.md](AGENTS.md).

### Validated release result

Twenty identical-seed release pairs compared the former dictionary with the vocabulary portfolio, using the same editorial repair:

| metric | former dictionary + repair | vocabulary portfolio + repair |
| --- | ---: | ---: |
| average residual panels | 7.05 | **5.30** |
| average answers | 44.75 | **48.45** |
| average crossings | 47.35 | **53.00** |
| average answer-space coverage | 93.98% | **95.53%** |
| average formulaic short answers | 0.40 | **0.15** |

All 20 promoted candidates were structurally valid, used exact clues and contained one connected answer component.

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

The renderer supports right and down answers, dual arrow cells, one-to-four-cell clue footprints, A5 SVG export, JSON export and an answer-reveal mode.

## Corpus

The generated bulk corpus contains:

| category | entries |
| --- | ---: |
| common nouns | 4,358 |
| specialist nouns | 20,099 |
| given names | 2,798 |
| surnames | 2,087 |
| patronymics | 115 |
| cities | 9,830 |
| capitals | 170 |
| countries | 129 |

Each entry retains its answer, clue, category, lexical-quality score, source, license and source identifier. The current audit reports:

- zero invalid entries;
- zero normalized duplicate answers;
- 100% clue coverage;
- 100% source attribution;
- 15,136 template-based clues, or 38.24%, tracked as explicit editorial debt.

The corpus is generated through `tools/build-bulk-lexicon.py`. Do not hand-edit generated chunks; update the builder or source policy and regenerate the manifest, loader and chunks together.

## Running locally

Open `index.html` directly in a modern browser, or serve the repository:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

The default grid currently averages roughly 21–25 seconds in release-gate environments because two complete construction candidates are evaluated.

## Quality gates

```bash
node tools/bulk-lexicon-audit.cjs
node tools/dictionary-count-v3.cjs
node tools/vocabulary-release-checkpoint.cjs 20
```

The release gate records source-corpus size, selected active limit, panels, answers, crossings, coverage, editorial metrics, runtime, category usage and complete structural validation.

Research-only probes and historical checkpoints remain available under `research/`, `tools/` and manually triggered workflows. They are not all required for a normal production change.

## Rollback and A/B controls

```text
SCANWORD_BULK_LEXICON=off             use the former construction dictionary
SCANWORD_VOCABULARY_PORTFOLIO=off     construct one active working set
SCANWORD_EDITORIAL_REPAIR=off         disable same-geometry cleanup
SCANWORD_CATEGORY_BALANCE=on          enable the retained category-cap experiment
SCANWORD_CONSTRUCTION_MODE=legacy     use the original construction path
```

## Canonical repository structure

```text
index.html                          browser defaults and script order
bulk-lexicon-runtime.js             corpus registration and deduplication
bulk-lexicon/                       generated corpus, loader and manifest
core.js                             dictionary utilities and working-set selection
dictionary-policy.js                dictionary admission policy
solver.js                           base placement, metrics and validation
construction-*.js                   bounded construction and repair stages
editorial-*.js                      lexical policy and repair vocabulary
renderer.js                         A5 SVG renderer
ui.js                               browser controls and exports
tools/                              audits, builders, tests and benchmarks
docs/milestones/                    accepted production decisions
research/                           chronological experiments and negative results
.github/workflows/                  production gates and manual research reproduction
AGENTS.md                           canonical architecture and change rules
```

See [AGENTS.md](AGENTS.md) before changing runtime load order, corpus generation or release gates.

## Research archive and branch policy

All canonical experiment descriptions, manifests, reproduction commands and milestone evidence are stored in `main`:

- [Closed-fill overview](research/closed-fill/README.md)
- [Closed-fill results](research/closed-fill/RESULTS.md)
- [Closed-fill architecture review](research/closed-fill/ARCHITECTURE.md)
- [Closed-fill experiment log](research/closed-fill/EXPERIMENT_LOG.md)
- [Vocabulary-first program](research/vocabulary-first/README.md)
- [39,586-entry checkpoint](research/vocabulary-first/STATUS-39586.md)
- [Category-balance experiment](research/vocabulary-first/CATEGORY-BALANCE.md)
- [Dictionary audit](research/vocabulary-first/AUDIT-39586.md)
- [Lexical-quality experiments](research/lexical-quality/README.md)

Historical experiment heads are anchored in the `main` commit graph. Non-`main` branches are convenience references only and may be deleted after confirming that no open pull request targets them.

## Known debt

Vocabulary-first 1.0 does not claim zero-panel construction or publication-ready clue prose. The next milestone targets:

- template-clue reduction;
- broader category coverage and clue diversity;
- shared-search runtime improvements;
- lower short-answer editorial cost without losing the 1.0 density frontier;
- a 50-seed production checkpoint before the next default change.
