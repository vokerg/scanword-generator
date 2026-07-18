# Research note: construction architecture for dense Russian scanwords

## Executive conclusion

The current generator is not failing because it needs a few more random restarts. It is failing because it makes the highest-impact decisions greedily and postpones the clue-footprint constraint until after the answer topology is effectively frozen.

The existing pipeline is:

1. greedily add one crossing answer at a time;
2. stop when no easy crossing remains;
3. pack clue text into the remaining panels;
4. try to repair the tiny leftover panel islands.

This produces valid grids, but it systematically creates residual one- and two-cell holes that have no legal clue anchor and cannot be repaired by a straight word. The 100-seed diagnostics confirmed that the post-layout local solver found no accepted improvement.

The replacement architecture should treat answer topology, vocabulary choice, and clue-space capacity as coupled constraints. Clue text should be allocated only after several competing structural states have been explored.

## What established approaches do

Crossword construction is normally separated into a structural search and a fill search, or formulated jointly as a constraint satisfaction/optimization problem. The standard techniques are:

- indexed domains by length and fixed letters;
- minimum remaining values and degree ordering;
- forward checking or stronger arc consistency;
- backtracking, limited discrepancy search, or beam search;
- local replacement of a previously chosen word when the grid saturates;
- explicit word-quality scores and all-different constraints;
- keeping several competing partial grids instead of one irreversible greedy state.

Relevant sources:

- Charu Agarwal and Rushikesh K. Joshi, *Automation Strategies for Unconstrained Crossword Puzzle Generation*, 2020: https://arxiv.org/abs/2007.04663
- Kaito Majima and Shotaro Ishihara, *Generating News-Centric Crossword Puzzles As A Constraint Satisfaction and Optimization Problem*, 2023: https://arxiv.org/abs/2308.04688
- Eric Wallace et al., *Automated Crossword Solving*, 2022: https://arxiv.org/abs/2205.09665
- Matthew Ginsberg, *Dr.Fill: Crosswords and an Implemented Solver for Singly Weighted CSPs*, JAIR, 2011.

The most relevant observation for this repository is the “victim” or replacement strategy: when the current grid is saturated, remove a strategically chosen prior word if doing so opens several better continuations. Pure restart-only search throws away too much information; pure greedy search cannot escape local topology traps.

## Why the current result is visually weak

### 1. The objective rewards clue area too strongly

Active coverage counts letters, arrow cells, and clue-text cells equally. A large clue footprint can therefore improve the score without improving answer density.

Required order of objectives:

1. structural validity;
2. fewer residual panels;
3. more raw letter cells;
4. fewer weak fillers;
5. smaller clue-text footprint;
6. clue readability.

### 2. The search is single-path inside an attempt

Each attempt commits one placement and discards alternatives. Random restarts explore different paths, but they do not perform a targeted correction near a bad local decision.

### 3. The post-fill CSP searches the wrong unit

The current residual solver asks for a topology covering an entire connected panel region. After clue packing, regions are too small and topologically impossible. Before clue packing, the main panel region is too large to cover as one local exact subproblem.

The useful search unit is a legal answer slot or a small bundle of crossing slots, not a whole residual component.

### 4. The clue allocator is randomized set packing

It runs after answer placement and can fragment the remaining space. Structural search has no estimate of whether enough connected clue-text cells will survive.

### 5. The dictionary is too small and unscored

About 803 reviewed entries is not enough for dense pattern matching in a 13 x 17 grid. More importantly, the dictionary has no strong quality/frequency model. A large unfiltered list would make the problem worse; additions must be common, clueable, licensed, normalized, and scored.

## Implemented R&D direction

The first replacement checkpoint uses a structural beam search:

1. build several deterministic base grids;
2. retain the best structural candidates;
3. enumerate individual indexed slots with at least one crossing;
4. expand several alternatives per state;
5. keep a bounded beam;
6. allocate clue footprints only for finalists;
7. apply the unchanged full-grid validator and quality gate;
8. fall back to the current generator if no V2 candidate passes.

This is intentionally bounded. It changes the search order without introducing an unbounded exhaustive solver.

## Dictionary policy

The R&D dictionary is extended with a curated layer of common Russian nouns and concrete terms, each with an original short clue and metadata:

- lexical quality;
- weak-fill flag;
- source layer.

Future imports should use sources such as OpenCorpora for morphology and Russian Wiktionary dumps for definitions/labels only after license review and editorial filtering. Raw corpus text or proprietary crossword databases must not be copied.

## Next checkpoints

1. Compare V2 and legacy on identical seeds.
2. Mine unsatisfied fixed-letter patterns before clue allocation.
3. Add only words that satisfy repeated high-value pattern families.
4. Add depth-one and depth-two “victim” replacement inside the structural beam.
5. Replace randomized clue packing with an exact/beam set-packing stage.
6. Promote V2 only when the existing 40-seed gate remains green and the 100-seed panel target improves materially.
