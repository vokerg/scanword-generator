# Arrowword Generator

A browser-based generator for Swedish-style crosswords (arrowwords / scanwords) on an exact A5 page.

## Current milestone: vocabulary-first 1.0

The default 13 × 17 generator now uses a **39,586-entry attributed Russian source corpus** before construction. For each seed it builds and repairs candidates from deterministic 2,500- and 3,500-entry working sets, then selects the best valid grid panel-first.

The complete promotion decision, benchmark, rollback controls and accepted debt are documented in [Milestone 1.0](docs/milestones/v1.0-vocabulary-first.md).

Validated over 20 identical-seed release pairs against the old dictionary with the same editorial repair:

| metric | old dictionary + repair | vocabulary portfolio + repair |
| --- | ---: | ---: |
| average residual panels | 7.05 | **5.30** |
| average answers | 44.75 | **48.45** |
| average crossings | 47.35 | **53.00** |
| average answer-space coverage | 93.98% | **95.53%** |
| average formulaic short answers | 0.40 | **0.15** |

All 20 promoted candidates were structurally valid, used exact clues and contained one connected answer component.

## Research snapshots

The earlier closed-fill investigation is preserved separately as a documented, reproducible research checkpoint:

- [Closed-fill research overview](research/closed-fill/README.md)
- [Measured results](research/closed-fill/RESULTS.md)
- [Architecture review](research/closed-fill/ARCHITECTURE.md)
- [Experiment log](research/closed-fill/EXPERIMENT_LOG.md)

The exact closed-fill implementation is pinned on `research/closed-fill-snapshot-2026-07-16` at commit `d1c12d8acca31edb3b38775db5166f4f5f59ce04`.

The vocabulary and editorial experiments are retained separately from the milestone snapshot:

- [Vocabulary-first experiment program](research/vocabulary-first/README.md)
- [39,586-entry checkpoint](research/vocabulary-first/STATUS-39586.md)
- [Category-balance experiment](research/vocabulary-first/CATEGORY-BALANCE.md)
- [Dictionary audit](research/vocabulary-first/AUDIT-39586.md)
- [Lexical-quality experiments](research/lexical-quality/README.md)
- branch `r-and-d/lexical-pareto-frontier`

Negative results are retained rather than rewritten as successes: naive full-pool sampling, aggressive lexical placement penalties, pre-downstream Pareto selection, fixed category caps and narrow local CSP topologies.

## Default pipeline

```text
load attributed source corpus
-> derive 2,500- and 3,500-entry seed-specific working sets
-> build connected structural candidates
-> allocate exact clue footprints
-> apply same-geometry editorial repair
-> select panel-first
-> validate all runs, crossings, clues and connectivity
```

The generator:

- validates every crossing;
- rejects accidental horizontal and vertical letter runs;
- keeps every answer in one connected component;
- supports answer lengths from 2 to 12 letters;
- supports right and down answers and dual arrow cells;
- expands clue text into connected one-to-four-cell footprints;
- keeps every arrow anchor attached to the exact answer start;
- exports exact A5 SVG and JSON project files;
- can reveal answers for visual validation.

## Coverage model

Three separate measurements are reported:

- **Active coverage** — letter cells, arrow cells and real clue-footprint cells divided by the whole grid.
- **Answer-space coverage** — letter cells divided by cells not occupied by clues.
- **Residual panels** — cells that are neither answers nor real clues.

This prevents a misleading single density number.

## Structural invariants

A generated grid is accepted only when:

1. every contiguous letter run of length two or more is exactly one assigned answer;
2. every letter belongs to at least one assigned answer;
3. crossing letters agree;
4. an arrow cell contains at most one right arrow and one down arrow;
5. every clue footprint points to an existing arrow and answer;
6. every used answer has an admitted exact clue;
7. the answer graph is one connected component;
8. residual areas are explicit panel cells, never blank answer cells.

## Corpus architecture

The source corpus is auditable and categorized:

- 4,358 common nouns;
- 20,099 specialist nouns;
- 2,798 given names;
- 2,087 surnames;
- 115 patronymics;
- 9,830 cities;
- 170 capitals;
- 129 countries.

Every bulk entry retains its answer, clue, category, lexical-quality score, source, license and source identifier. The current audit reports zero invalid entries, zero normalized duplicates and 100% clue/source coverage. Generic template clues remain explicit editorial debt.

## Running locally

Open `index.html` directly in a modern browser, or run:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

The default browser path enables the vocabulary portfolio and editorial repair. Generation on the default grid currently averages roughly 21–25 seconds in the release gate environment.

## Rollback and A/B controls

```text
SCANWORD_BULK_LEXICON=off             old construction dictionary
SCANWORD_VOCABULARY_PORTFOLIO=off     single active working set
SCANWORD_EDITORIAL_REPAIR=off         no same-geometry cleanup
SCANWORD_CATEGORY_BALANCE=off         accepted 1.0 category policy
SCANWORD_CONSTRUCTION_MODE=legacy     original construction path
```

## Quality gates

```bash
node tools/bulk-lexicon-audit.cjs
node tools/dictionary-count-v3.cjs
node tools/vocabulary-release-checkpoint.cjs 20
```

The release gate records source-corpus size, selected active limit, panels, answers, crossings, coverage, editorial metrics, runtime, category use and full structural validation.

## Main files

```text
index.html                          Browser defaults and script order
bulk-lexicon-runtime.js             Corpus registration and deduplication
bulk-lexicon/                       Generated categorized corpus and manifest
core.js                             Working-set selection and dictionary utilities
dictionary-policy.js                Dictionary admission policy
solver.js                           Connected placement and validation
construction-vocabulary-portfolio-v1.js
                                    2,500/3,500 panel-first portfolio
construction-editorial-repair-v3.js Same-geometry cleanup orchestration
renderer.js                         A5 SVG renderer
ui.js                               Browser UI and JSON export
docs/milestones/                    Production milestone decisions
research/                           Full experimental record
```

## Known debt

Vocabulary-first 1.0 does not claim zero-panel construction or publication-ready clue prose. The next milestone targets template-clue reduction, category diversity and shared-search runtime improvements without losing the 1.0 density frontier.
