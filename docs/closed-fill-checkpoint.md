# Closed-fill checkpoint

This is the only active R&D branch after indexed candidate retrieval was squash-merged into `main`.

## Objective

Eliminate every residual panel cell while retaining:

- one connected answer component;
- zero accidental letter runs;
- zero fallback clues;
- reviewed Russian answers only;
- deterministic generation and validation.

## Implementation sequence

1. Identify connected residual-panel regions and their letter boundary.
2. Enumerate local answer/clue topologies that consume the region.
3. Build pattern domains through the indexed lexicon.
4. Select the most constrained local slot first.
5. Propagate crossing letters and reject empty domains immediately.
6. Permit bounded rollback of words touching the region boundary.
7. Compare several local replacement states by panel count and lexical quality.
8. Revalidate the complete grid after every accepted replacement.

## Intermediate quality gates

### Checkpoint A

- average residual panels <= 8 over 100 seeds;
- maximum residual panels <= 12;
- no structural or lexical regressions.

### Checkpoint B

- average residual panels <= 2 over 100 seeds;
- at least 80% of seeds with zero panels;
- no more than two low-quality short fillers per grid.

### Final checkpoint

- zero residual panels on every required seed;
- 100% active coverage;
- one connected answer graph;
- zero accidental runs, conflicts, orphan letters, or fallback clues;
- machine-readable validation report for each generated grid.
