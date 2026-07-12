# Arrowword Generator

A browser-based prototype for generating Swedish-style crosswords (arrowwords / scanwords) on an A5 page.

## Current status

Version 0.4 focuses on **structural validity**, not PDF export.

The generator:

- uses a built-in Russian answer dictionary;
- places clues directly inside the grid;
- supports right and down answers;
- supports one or two clues in the same clue cell;
- validates every contiguous horizontal and vertical letter run;
- rejects grids containing accidental pseudo-words;
- renders unused areas as explicit graphic panels rather than blank answer cells;
- exports an A5 SVG and a JSON project file;
- can reveal answers for validation.

## Structural invariants

A generated grid is accepted only when:

1. Every contiguous letter run of length two or more is exactly one assigned answer.
2. Every letter cell belongs to at least one assigned answer.
3. Crossing letters agree.
4. A clue cell contains at most one right clue and one down clue.
5. There are no blank clue cells.
6. Non-answer areas are represented as explicit panel cells.

These rules are intentionally stricter than the earlier density-only prototype.

## Running locally

Open `index.html` directly in a modern browser, or run a local server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Files

```text
index.html       Browser interface
styles.css       Interface styling
words.js         Main Russian answer dictionary
short-words.js   Compact answers for short slots
clues.js         Short clue dictionary
core.js          Grid templates and shared metrics
solver.js        Constraint-aware fill and validation
renderer.js      A5 SVG renderer
ui.js            Browser UI and JSON export
docs/            Design notes and research summary
```

## Why PDF is deferred

SVG already preserves the exact physical A5 dimensions and prints without raster quality loss. PDF export will be added after the following are stable:

- grid topology;
- panel frequency;
- clue typography;
- arrow placement;
- answer and clue quality;
- solution-page layout.

At that point PDF becomes a presentation/export layer rather than part of the generation algorithm.

## Next milestones

- reduce the panel-cell ratio without violating structural validity;
- add a larger reviewed answer-and-clue corpus;
- introduce stock templates and compare them with generated templates;
- add automated multi-seed regression tests;
- add print-ready PDF and solution-page export.