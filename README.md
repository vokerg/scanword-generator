# Arrowword Generator

A browser-based R&D prototype for generating Swedish-style crosswords (arrowwords / scanwords) on an A5 page.

## Current checkpoint

The `r-and-d/valid-arrowword-generator` branch contains version 0.7, a **strict dense placement engine**.

The generator:

- uses only Russian answers with reviewed, human-readable clues;
- includes a reviewed expansion focused on common 3–8-letter nouns;
- includes a small reviewed set of two-letter answers because authentic arrowword grids commonly contain short slots;
- places clues directly inside the grid;
- supports right and down answers and one or two clues in the same clue cell;
- rejects accidental horizontal or vertical letter runs;
- verifies crossing letters, clue directions, and orphan cells;
- continues filling after the requested minimum answer count is reached;
- may use up to six isolated answer groups to occupy otherwise dead areas without inventing pseudo-words;
- exports an exact A5 SVG and a JSON project file;
- can reveal answers for visual validation.

## Structural invariants

A generated grid is accepted only when:

1. Every contiguous letter run of length two or more is exactly one assigned answer.
2. Every letter cell belongs to at least one assigned answer.
3. Crossing letters agree.
4. A clue cell contains at most one right clue and one down clue.
5. There are no blank clue cells.
6. Every used answer has a reviewed clue; placeholder clues are excluded.
7. Non-answer areas are explicit panel cells, not blank answer cells.

Answer groups do not have to form one global crossing component. This is a density strategy, not a relaxation of word validity: each run still requires a clue and passes the same validator.

## Generation strategy

Version 0.7 is word-first and two-phase:

1. reach the requested minimum answer count using compact, highly intersecting placements;
2. continue adding valid answers and, when necessary, seed additional isolated groups in unused regions;
3. run eight deterministic restarts and keep the highest-scoring valid result.

A fixed-template closed-fill CSP remains a separate R&D track. It will need a substantially larger reviewed lexicon before it can reliably fill authentic newspaper-style templates.

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
- fills less than 65% of grid cells with answers or clues;
- uses more than six answer components;
- uses a fallback placeholder clue.

The locally verified checkpoint across 40 deterministic seeds produced:

- 43–50 answers;
- 67.4–76.0% active cells;
- 46.35 answers on average;
- 45.08 crossings on average;
- zero fallback clues and zero accidental runs.

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
solver.js                  Strict two-phase density engine
renderer.js                A5 SVG renderer
ui.js                      Browser UI and JSON export
tools/benchmark.cjs        Multi-seed structural regression benchmark
tools/dictionary-audit.cjs Dictionary validation and length audit
docs/                      Design notes and research summary
```

## Why PDF is deferred

SVG already preserves exact A5 dimensions and prints without raster quality loss. PDF export will be added after grid topology, clue typography, arrow placement, and the solution-page layout are stable.

## Next milestones

- replace generic panel cells with better clue-cell topology;
- expand the reviewed lexicon into the low thousands;
- add bent arrow anchors used by printed scanwords;
- finish the authentic-template CSP track;
- add print-ready PDF and solution-page export.
