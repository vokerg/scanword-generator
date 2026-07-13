# Arrowword Generator

A browser-based R&D prototype for generating Swedish-style crosswords (arrowwords / scanwords) on an A5 page.

## Current checkpoint

The `r-and-d/valid-arrowword-generator` branch contains version 0.8, a **split-clue topology engine**.

The generator:

- uses only Russian answers with reviewed, human-readable clues;
- includes reviewed two-letter and 3–12-letter answers;
- places answers algorithmically and validates every crossing;
- rejects accidental horizontal and vertical letter runs;
- supports right and down answers;
- supports one or two arrows in a shared arrow cell;
- moves clue text into neighbouring cells where space is available;
- keeps the original arrow cell attached to the exact answer start;
- uses no placeholder definitions or pseudo-words;
- exports an exact A5 SVG and a JSON project file;
- can reveal answers for visual validation.

## Why split clue cells matter

Printed arrowwords frequently devote one cell to clue text and an adjacent cell to the arrow anchor. Earlier checkpoints rendered clue text and the arrow inside one cell, leaving many unrelated panel cells elsewhere in the grid.

Version 0.8 performs a maximum matching pass after word placement:

1. each clue searches neighbouring unused cells;
2. clue-to-cell assignments are resolved without reusing a cell;
3. assigned cells become clue-text cells;
4. the original cell becomes an arrow anchor;
5. unmatched clues remain in compact combined cells.

This does not fake density. A converted cell contains a real clue linked to a real answer. The word layout and all crossing checks remain unchanged.

## Structural invariants

A generated grid is accepted only when:

1. Every contiguous letter run of length two or more is exactly one assigned answer.
2. Every letter cell belongs to at least one assigned answer.
3. Crossing letters agree.
4. An arrow cell contains at most one right arrow and one down arrow.
5. Every clue-text cell points to an existing arrow and answer.
6. Every used answer has a reviewed clue; placeholder clues are excluded.
7. Residual non-answer areas are explicit panel cells, never blank answer cells.

## Generation strategy

Version 0.8 is still word-first, but now has three phases:

1. reach the requested minimum answer count using intersecting placements;
2. continue filling valid answer groups in unused regions;
3. assign neighbouring panel cells to clue text with bipartite matching.

The engine runs twelve deterministic restarts and keeps the highest-scoring structurally valid result. The default grid allows at most three answer groups, down from six in version 0.7.

A closed-fill template CSP remains a separate R&D track. It is the path to eliminating the last residual panels, but it requires a substantially larger reviewed lexicon and stronger constraint propagation.

## Running locally

Open `index.html` directly in a modern browser, or run:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Quality gates

Run the dictionary audit:

```bash
node tools/dictionary-audit.cjs
```

Run the deterministic 40-seed benchmark:

```bash
node tools/benchmark.cjs
```

The benchmark rejects any result that:

- fails structural validation;
- contains fewer than 40 answers on the default 13 × 17 grid;
- occupies less than 78% of grid cells with answers, arrow anchors, or real clue text;
- uses more than three answer groups;
- externalizes fewer than 20 clue texts;
- leaves more than 49 residual panel cells;
- uses a fallback placeholder clue.

## Files

```text
index.html                 Browser interface
styles.css                 Interface styling
words.js                   Main Russian answer dictionary
short-words.js             Three-letter compact answers
clues.js                   Original clue dictionary
extra-dictionary.js        Reviewed answer-and-clue expansion
two-letter-words.js        Reviewed two-letter answers
core.js                    Shared randomization and dictionary utilities
dictionary-policy.js       Restricts generation to reviewed clues
solver.js                  Word placement and split-clue topology
renderer.js                A5 SVG renderer
ui.js                      Browser UI and JSON export
tools/benchmark.cjs        Multi-seed structural regression benchmark
tools/dictionary-audit.cjs Dictionary validation and length audit
docs/                      Design notes and research summary
```

## Why PDF is deferred

SVG already preserves exact A5 dimensions and prints without raster quality loss. PDF export will be added after grid topology, clue typography, arrow placement, and the solution-page layout are stable.

## Next milestones

- reduce residual panel cells below 10% without inventing answers;
- expand the reviewed lexicon into the low thousands;
- add bent and offset arrow-anchor variants used by printed scanwords;
- develop the closed-fill template CSP;
- add print-ready PDF and solution-page export.
