# Arrowword Generator

A browser-based R&D prototype for generating Swedish-style crosswords (arrowwords / scanwords) on an exact A5 page.

## Default research direction: vocabulary-first dense fill

The main bottleneck is now treated as **lexical domain breadth**, not another round of placement coefficients.

The previous constructor had only 857 unique answers available before generation and 1,441 across construction plus post-generation repair. That is insufficient for a dense publication-style scanword: once two or three crossing letters are fixed, many slots have no compatible answer at all.

The active program therefore:

1. builds a 15,000–50,000+ answer corpus with usable clues;
2. loads that corpus before initial construction;
3. includes ordinary nouns, names, surnames, geography and specialist vocabulary;
4. assigns editorial tiers rather than pretending every valid word is equally desirable;
5. benchmarks density, intersections, empty domains and runtime on identical seeds;
6. keeps same-geometry editorial repair as a secondary cleanup stage.

The complete rationale, experiment history, source policy and staged targets are documented in [`research/vocabulary-first/README.md`](research/vocabulary-first/README.md).

## Structural checkpoint

The generator:

- validates every crossing;
- rejects accidental horizontal and vertical letter runs;
- keeps every answer in one connected component;
- supports right and down answers and dual arrow cells;
- expands clue text into connected one-to-four-cell footprints;
- preserves exact arrow-to-answer attachment;
- exports exact A5 SVG and JSON project files;
- can reveal answers for visual validation.

## Coverage model

Three separate measurements are reported:

- **Active coverage** — letter cells, arrow cells, and real clue-footprint cells divided by the whole grid.
- **Answer-space coverage** — letter cells divided by cells not occupied by clues.
- **Residual panels** — cells that are neither answers nor real clues.

This prevents a misleading single density number.

## Multi-cell clue footprints

Long definitions often do not fit legibly beside an arrow. The post-layout clue allocator:

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
6. Every used answer has a clue admitted by the active dictionary policy.
7. The answer graph is one connected component.
8. Residual non-answer areas are explicit panel cells, never blank answer cells.

## Generation strategy

The constructor remains word-first, but the default sequence is now:

1. assemble the full categorized pre-construction lexicon;
2. index candidates by length and letter patterns;
3. build one connected answer graph;
4. continue dense valid placements after the requested minimum is reached;
5. allocate clue footprints over remaining panel regions;
6. run bounded local repair for editorial cleanup;
7. validate all structural and lexical invariants.

## Research results retained

The branch preserves all negative and positive experiments:

- early lexical placement pressure reduced short fill but made the 40-answer checkpoint unreachable;
- dense-only penalty sweeps preserved reachability but produced negligible lexical gains;
- pre-downstream Pareto selection improved vocabulary but amplified downstream panel damage;
- one-slot, pair and radius-two repair reduced formulaic answers without geometry loss;
- demand-driven vocabulary additions reduced the 50-seed average formulaic count from 3.44 to 0.34;
- panel and structural-short counts did not improve, confirming that repair alone is not the dense-fill solution.

See [`research/lexical-quality/README.md`](research/lexical-quality/README.md) for the detailed experiment log.

## Running locally

Open `index.html` directly in a modern browser, or run:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Quality gates

Current research tools include:

```bash
node tools/dictionary-audit.cjs
node tools/dictionary-count-v3.cjs
node tools/benchmark.cjs
node tools/editorial-replacement-checkpoint.cjs 50
```

Bulk-corpus gates additionally report:

- unique pre-construction entries;
- category and length distributions;
- duplicate and clue failures;
- slot-domain availability;
- density and crossing deltas versus the closed-fill snapshot;
- rare and specialist answer usage;
- generation time and candidate lookup growth.

## Main files

```text
index.html                         Browser interface and script order
words.js                           Original Russian answer dictionary
short-words.js                     Three-letter compact answers
clues.js                           Original clue dictionary
extra-dictionary.js                Reviewed answer-and-clue expansion
two-letter-words.js                Reviewed two-letter answers
bulk-lexicon-runtime.js            Bulk corpus registration and deduplication
bulk-lexicon/                      Generated categorized corpus chunks
core.js                            Randomization and dictionary utilities
dictionary-policy.js               Dictionary admission policy
solver.js                          Connected placement and clue allocation
construction-editorial-repair-v3.js Same-geometry cleanup pipeline
renderer.js                        A5 SVG renderer
ui.js                              Browser UI and JSON export
research/vocabulary-first/         Primary research program
research/lexical-quality/          Retained experiment history
```

## Production boundary

The large corpus work remains on the research branch. Production `main` is unchanged until source licensing, editorial sampling, runtime and deterministic benchmarks are independently reviewable.
