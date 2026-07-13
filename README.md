# Arrowword Generator

A browser-based prototype for generating Swedish-style crosswords (arrowwords / scanwords) on an A5 page.

## Current status

The `r-and-d/valid-arrowword-generator` branch contains version 0.6, a **validation-first placement engine**.

The generator:

- uses only answers with reviewed, human-readable clues;
- uses a built-in Russian answer dictionary with a reviewed expansion focused on 3–8-letter nouns;
- places clues directly inside the grid;
- supports right and down answers;
- supports one or two clues in the same clue cell;
- validates every contiguous horizontal and vertical letter run;
- rejects grids containing accidental pseudo-words;
- renders unused areas as explicit graphic panels rather than blank answer cells;
- performs multiple seeded restarts and keeps the highest-scoring valid result;
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

Density is scored only after all structural checks pass.

## Generation strategies

Version 0.6 uses a strict word-first placement strategy as the stable baseline. Side-adjacency checks guarantee that placing one answer cannot silently create another unassigned letter run.

A denser closed-fill/CSP strategy is being developed separately. It is not used as the default yet because a dense topology is useful only when every resulting slot can be filled with reviewed answers.

## Running locally

Open `index.html` directly in a modern browser, or run a local server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Regression benchmark

Run the multi-seed structural benchmark with Node.js:

```bash
node tools/benchmark.cjs
```

The benchmark fails immediately if any generated grid contains an accidental run, an orphan letter, a crossing conflict, a duplicate clue direction, or a fallback placeholder clue.

## Dictionary quality gate

Run:

```bash
node tools/dictionary-audit.cjs
```

The audit rejects invalid characters, duplicate normalized answers, unsupported lengths, and malformed entries in the reviewed expansion. It reports legacy entries that still rely on fallback clues, but the generator excludes those entries from production grids.

## Files

```text
index.html                Browser interface
styles.css                Interface styling
words.js                  Main Russian answer dictionary
short-words.js            Compact answers for short slots
clues.js                  Original short clue dictionary
extra-dictionary.js       Reviewed answer-and-clue expansion
core.js                   Shared randomization and dictionary utilities
dictionary-policy.js      Restricts generation to reviewed clues
solver.js                 Multi-restart placement engine and validator
renderer.js               A5 SVG renderer
ui.js                     Browser UI and JSON export
tools/benchmark.cjs       Multi-seed structural regression benchmark
tools/dictionary-audit.cjs Dictionary validation and length-distribution audit
docs/                     Design notes and research summary
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
- continue reviewing and expanding the answer-and-clue corpus;
- finish the dense closed-fill/CSP strategy;
- add stock templates and compare them with generated topologies;
- add print-ready PDF and solution-page export.
