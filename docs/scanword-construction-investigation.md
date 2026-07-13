# Scanword Construction Investigation

This document defines the research and engineering work required to move from the current 0.9 baseline toward complete, publication-quality scanword coverage.

## Current baseline

Checkpoint 0.9 is merged into `main` and provides:

- one connected answer component;
- at least 90% active coverage on the default 13 × 17 grid;
- at least 65% answer-space coverage;
- no more than 20 residual panels;
- zero accidental letter runs;
- zero fallback clues;
- deterministic 40-seed regression testing.

The remaining problem is not simply adding more random attempts. Geometric coverage, lexical quality, clue layout, and search complexity must be improved together.

## Why this is a separate engineering stage

Crossword filling is a hard constraint-satisfaction problem. A larger flat dictionary does not automatically improve fill because candidate retrieval, lexical quality, variable ordering, rollback strategy, and grid topology all interact. The current generator already demonstrates that geometric coverage and lexical quality can move in opposite directions.

## Initial findings

### Professional workflow is human-guided rather than fully random

Professional construction software generally combines:

- manually selected theme or anchor answers;
- personal and publication-specific word lists;
- pattern lookup for partially filled entries;
- quality scores attached to entries;
- interactive replacement of weak local fill;
- automated search only inside constraints chosen by the editor.

For this project, the target should therefore be an editor-assisted generator with reproducible automatic checkpoints, not an opaque one-shot random filler.

### The fill problem should be modeled as a weighted CSP

Useful techniques described in the crossword literature include:

- minimum-remaining-values slot selection;
- value ordering by lexical quality and future compatibility;
- forward checking and propagation through crossings;
- limited discrepancy search;
- local search and postprocessing;
- partitioning around weakly connected regions;
- bounded rollback of recently placed entries;
- keeping several competing states instead of one greedy path.

The no-reuse rule makes crossword filling difficult even on restricted grid graphs, so attempts alone are not a substitute for better search structure.

### Dictionary size is not the main variable

The production lexicon needs multiple layers:

1. **Core entries** — common words with reviewed clues and high confidence.
2. **Useful short fill** — legitimate 2–5 letter entries with an explicit usage budget.
3. **Names and geography** — scored separately and limited by puzzle difficulty.
4. **Abbreviations and symbols** — opt-in and strongly penalized.
5. **Inflected forms** — allowed only under an explicit scanword policy.
6. **Experimental corpus entries** — usable for geometry measurement but never exported without review.

Every entry should carry at least:

- answer and normalized answer;
- clue or clue candidates;
- part of speech;
- frequency band;
- lexical-quality score;
- source and provenance;
- proper-name, abbreviation, archaic, colloquial, and inflected-form flags;
- allowed puzzle difficulty;
- repetition family or lemma.

### Crossword filler words must be budgeted, not merely banned

Short vowel-rich and intersection-friendly entries are structurally valuable. They are also noticeable and unpleasant when overused. The solver should charge a nonlinear penalty for weak fill and enforce per-grid budgets, for example:

- no more than two low-quality short entries;
- no crossing of two obscure entries;
- no repeated lemma family;
- no more than a configured number of abbreviations or proper names;
- progressively higher cost for the second and third weak entry.

### Scanword topology differs from American crossword topology

The target format does not require rotational symmetry and can use clue cells, split clue cells, images, and two-letter answers. This allows a better strategy:

1. reserve clue footprints and optional image or theme regions;
2. construct answer slots around those regions;
3. fill the most constrained slots first;
4. allow bounded topology edits when a region becomes impossible;
5. perform a final lexical cleanup pass replacing weak entries.

## Planned experiments

### Experiment A — lexicon audit

Measure the current reviewed dictionary by:

- length;
- initial and final letter;
- letter-position entropy;
- part of speech;
- frequency band;
- number of compatible crossings per position;
- number of generated grids in which the entry appears.

### Experiment B — pattern-demand mining

Across hundreds of failed or suboptimal attempts, record unresolved patterns such as:

- `?А?А`;
- `С??Р`;
- `?О??К`;
- length, fixed positions, neighbouring clue footprint, and component membership.

Rank patterns by how often solving them would reduce panels or merge regions. Dictionary work must then target high-value patterns rather than raw entry count.

### Experiment C — indexed retrieval

Replace random sampling with indexes:

- by length;
- by `(length, position, letter)`;
- by full pattern signature;
- by lexical-quality tier;
- by lemma and category.

Candidate sets should be intersected from indexes and then ranked. A 10,000-entry dictionary must not require scanning or randomly sampling all entries at each placement.

**Status:** first checkpoint implemented. The solver now uses a letter-position index, rare-anchor-first traversal, bounded bucket sampling, and duplicate-placement suppression. A 100-seed run passed all structural gates and reduced average residual panels from the 0.9 baseline of 16.70 to 15.42. Full measurements are recorded in `docs/indexed-candidate-ab.md`.

### Experiment D — weighted fill search

Compare the current adaptive restart search against:

- MRV plus forward checking;
- beam search;
- limited discrepancy search;
- bounded rollback of the last 4–10 entries;
- local replacement of a panel region;
- a hybrid that freezes strong entries and re-solves weak regions.

### Experiment E — editorial quality metrics

In addition to structural validity and coverage, benchmark:

- average and worst lexical-quality score;
- number of weak short entries;
- number of proper names and abbreviations;
- obscure-obscure crossings;
- repeated lemmas and clue forms;
- clue readability inside the available footprint;
- percentage of entries with a reviewed source-backed clue.

### Experiment F — closed-fill completion

The final stage must explicitly target zero residual panels:

1. identify each residual panel region;
2. derive possible answer and clue-footprint topologies for the region;
3. solve each region with CSP and bounded topology edits;
4. allow rollback across the region boundary when necessary;
5. reject any completion that reduces lexical quality below the configured budget;
6. keep a proof-like validation report showing that every active cell belongs to a real answer or clue.

## Candidate Russian-language sources

Potential sources must be reviewed for licensing before inclusion:

- OpenCorpora or pymorphy-compatible lexicons for morphology and lemma metadata;
- Russian Wiktionary dumps for definitions and lexical labels;
- frequency information derived from legally usable corpora or published frequency lists;
- existing reviewed scanword entries collected from licensed or user-owned material.

The Russian National Corpus can inform frequency research through its search interface, but its text database must not be copied into the project without permission.

## Research references

- Matthew L. Ginsberg, *Dr.Fill: Crosswords and an Implemented Solver for Singly Weighted CSPs*, arXiv:1401.4597.
- Charu Agarwal and Rushikesh K. Joshi, *Automation Strategies for Unconstrained Crossword Puzzle Generation*, arXiv:2007.04663.
- Laurent Gourvès et al., *Filling Crosswords is Very Hard*, arXiv:2109.11203.
- Eric Wallace et al., *Automated Crossword Solving*, arXiv:2205.09665.
- Dragomir Radev et al., *Cruciform: Solving Crosswords with Natural Language Processing*, arXiv:1611.02360.
- Mikhail Korobov, *Morphological Analyzer and Generator for Russian and Ukrainian Languages*, arXiv:1503.07283.

## Next checkpoint

Before promoting a large production dictionary, the branch must produce an A/B report containing:

- reviewed baseline dictionary size and distribution;
- experimental expanded dictionary size and distribution;
- candidate-retrieval latency;
- coverage and answer-cell changes over at least 100 seeds;
- lexical-quality changes;
- the twenty most valuable unresolved pattern families;
- a recommendation on which entries and algorithms are safe to promote.

## Final target

The end state is a fully validated scanword with:

- 100% active-cell coverage;
- zero residual panels;
- one connected answer graph;
- zero accidental runs and letter conflicts;
- no fallback clues;
- explicit budgets for weak filler words;
- reproducible generation and a machine-readable validation report.
