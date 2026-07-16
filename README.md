# Arrowword Generator

A browser-based R&D prototype for generating Swedish-style crosswords (arrowwords / scanwords) on an exact A5 page.

## Current checkpoint: 0.9

Version 0.9 raises the default 13 × 17 grid from the previous 78% quality floor to a strict **90% active-cell checkpoint** while keeping every answer in one connected component.

## Research snapshots

The production generator remains on the tested 0.9 path. The later closed-fill investigation is preserved separately as a documented, reproducible research checkpoint:

- [Closed-fill research overview](research/closed-fill/README.md)
- [Measured results](research/closed-fill/RESULTS.md)
- [Architecture review](research/closed-fill/ARCHITECTURE.md)
- [Experiment log](research/closed-fill/EXPERIMENT_LOG.md)

The exact experimental implementation is pinned on `research/closed-fill-snapshot-2026-07-16` at commit `d1c12d8acca31edb3b38775db5166f4f5f59ce04`. It is not loaded by the production browser application.

The generator:

- uses only reviewed Russian answers and human-readable clues;
- supports answer lengths from 2 to 12 letters;
- places answers algorithmically and validates every crossing;
- rejects accidental horizontal and vertical letter runs;
- supports right and down answers and dual arrow cells;
- expands clue text into connected one-to-four-cell footprints when space is available;
- keeps every arrow anchor attached to the exact answer start;
- uses no placeholder definitions or pseudo-words;
- exports exact A5 SVG and JSON project files;
- can reveal answers for visual validation.

## Coverage model

Three separate measurements are reported:

- **Active coverage** — letter cells, arrow cells, and real clue-footprint cells divided by the whole grid.
- **Answer-space coverage** — letter cells divided by cells not occupied by clues.
- **Residual panels** — cells that are neither answers nor real clues.

This prevents a misleading single density number. Version 0.9 requires at least 90% active coverage, at least 65% answer-space coverage, and no more than 20 residual panels on the default A5 grid.

## Multi-cell clue footprints

Long definitions often do not fit legibly beside an arrow. The post-layout clue allocator now:

1. finds connected panel footprints next to each arrow anchor;
2. generates one-to-four-cell candidate shapes;
3. runs deterministic randomized set-packing passes;
4. prevents two clues from claiming the same cell;
5. prefers footprints that consume small or isolated panel regions;
6. renders the footprint as one outlined clue area.

Each converted cell contains a real clue associated with a real answer. No cells are counted as active merely to inflate the metric.

## Structural invariants

A generated grid is accepted only when:

1. Every contiguous letter run of length two or more is exactly one assigned answer.
2. Every letter belongs to at least one assigned answer.
3. Crossing letters agree.
4. An arrow cell contains at most one right arrow and one down arrow.
5. Every external clue footprint points to an existing arrow and answer.
6. Every used answer has a reviewed clue.
7. The answer graph is one connected component.
8. Residual non-answer areas are explicit panel cells, never blank answer cells.

## Generation strategy

Version 0.9 remains word-first but adds a coverage-oriented selection layer:

1. build one connected answer graph;
2. continue dense valid placements after the requested minimum is reached;
3. allocate multi-cell clue footprints over remaining panel regions;
4. score valid candidates by active coverage, answer-space coverage, residual panels, intersections, and clue sharing;
5. stop early on a preferred result, continue to 120 attempts for the mandatory checkpoint, and extend to 240 attempts only when necessary.

## Verified 40-seed results

Local deterministic regression run on the default 13 × 17 grid:

```text
Answers:               41–50, average 44.08
Active coverage:       91.0–95.0%, average 92.44%
Answer-space coverage: 85.0–91.3%, average 87.14%
Residual panels:       11–20, average 16.70
Answer components:     exactly 1
Crossings:             43–53, average 47.38
Accidental runs:       0
Fallback clues:        0
```

The GitHub Actions gate runs the same 40 deterministic seeds before the branch can be considered merge-ready.

## Running locally

Open `index.html` directly in a modern browser, or run:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Quality gates

```bash
node tools/dictionary-audit.cjs
node tools/benchmark.cjs
```

The benchmark rejects a result that:

- fails structural validation;
- contains fewer than 40 answers;
- has less than 90% active coverage;
- has less than 65% answer-space coverage;
- has more than 20 residual panels;
- contains more or fewer than one answer component;
- externalizes fewer than 24 real clues;
- uses fewer than 45 clue-footprint cells;
- uses a fallback clue.

## Files

```text
index.html                 Browser interface
styles.css                 Interface styling
words.js                   Main Russian answer dictionary
short-words.js             Three-letter compact answers
clues.js                   Original clue dictionary
extra-dictionary.js        Reviewed answer-and-clue expansion
two-letter-words.js        Reviewed two-letter answers
core.js                    Randomization and dictionary utilities
dictionary-policy.js       Restricts generation to reviewed clues
solver.js                  Connected word placement and clue-footprint allocation
renderer.js                A5 SVG renderer with merged clue footprints
ui.js                      Browser UI and JSON export
tools/benchmark.cjs        40-seed coverage regression benchmark
tools/dictionary-audit.cjs Dictionary validation and length audit
```

## Why PDF is deferred

SVG already preserves exact A5 dimensions and prints without raster quality loss. PDF export will be added after clue typography, arrow placement, and the solution-page layout are stable.

## Next milestones

- replace the remaining residual panels through local closed-fill CSP patches;
- raise the active checkpoint above 94%;
- expand the reviewed lexicon into the low thousands;
- add bent and offset arrow variants used by printed scanwords;
- move long generation runs into a Web Worker;
- add print-ready PDF and solution-page export.
