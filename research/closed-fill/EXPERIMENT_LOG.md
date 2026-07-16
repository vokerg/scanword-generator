# Closed-Fill Experiment Log

This log summarizes the research progression. It records both successful checkpoints and approaches that were abandoned or retained only as diagnostics.

## 0.8 — validation-first dense arrowwords

Branch history: `r-and-d/valid-arrowword-generator`

Main ideas:

- reviewed Russian answers and exact clues;
- deterministic restarts;
- split clue text into neighboring cells;
- bipartite matching to prevent clue-text collisions;
- structural validation of every accepted grid.

40-seed checkpoint:

```text
answers:                  40–49
active coverage:          78.7–87.8%
residual panels:          27–47
answer components:        2–3
accidental runs:           0
```

Outcome: established a reliable validator and deterministic benchmark, but topology was still disconnected and visually sparse.

## 0.9 — single connected component

Branch history: `r-and-d/coverage-090`

Main ideas:

- require one connected answer graph;
- adaptive deterministic search from 24 to 240 attempts;
- connected one-to-four-cell clue footprints;
- separate active, answer-space, and residual-panel metrics;
- strict checkpoint candidate selection.

40-seed checkpoint:

```text
average answers:                44.08
average active coverage:        92.44%
average answer-space coverage:  87.14%
average residual panels:        16.70
components:                     exactly 1
```

Outcome: production-quality structural checkpoint. Squash-merged to `main`.

## Indexed candidate retrieval

Historical branch: `r-and-d/dictionary-10k`

Merged checkpoint: `a50c2c25642032cd4c3a9df13580bf5ea9e916a4`

Main ideas:

- index occurrences by letter and character position;
- bucket entries by length;
- traverse rare anchors first;
- bounded deterministic sampling in large buckets;
- suppress duplicate placements;
- collect candidate-retrieval telemetry;
- mine scarce fixed-letter patterns.

Measured effect:

```text
candidate checks:       approximately -95%
100-seed validity:      100 / 100
average panels:         15.42
average answers:        44.63
average time:            1.43 s
```

Outcome: removed the dictionary lookup bottleneck. Did not solve full coverage by itself. Squash-merged to `main`.

## Closed-fill investigation begins

Active historical branch: `r-and-d/closed-fill`

Research objective:

```text
zero residual panels
one connected answer graph
reviewed clues only
no accidental runs
bounded weak-fill usage
reproducible 100-seed validation
```

Initial planned method:

1. identify residual regions;
2. enumerate local answer/clue topologies;
3. query indexed pattern domains;
4. solve with MRV and forward checking;
5. allow bounded rollback of boundary words;
6. revalidate the whole grid.

## Post-layout local CSP

Implementation:

- residual-region extraction;
- slot enumeration;
- local topology enumeration;
- MRV variable ordering;
- forward checking;
- bounded CSP nodes;
- depth-one rollback.

Observed result:

- algorithms passed deterministic primitive tests;
- real generated grids rarely accepted an improvement;
- clue packing had already fragmented free space;
- most late regions were too small to contain a legal answer/clue topology.

Decision: keep as diagnostic infrastructure, move the main search earlier in construction.

## Structural beam experiment

Implementation direction:

- retain several partial structural states;
- expand indexed slots;
- bounded beam width;
- delay clue allocation until finalists;
- preserve the legacy generator as fallback.

Observed result:

- technically valid;
- higher complexity;
- no sufficiently strong improvement over the simpler portfolio approach at the tested budgets.

Decision: do not promote; use its lessons in portfolio and victim search.

## Panel-first portfolio

Main ideas:

- build many complete structural attempts;
- allocate clue footprints for each candidate;
- keep only candidates passing the production checkpoint;
- rank valid candidates by panels first;
- regenerate the exact legacy seed and use it as a monotonic guard.

Early 40-seed result:

```text
average panels:         14.78 -> 12.85
maximum panels:         20 -> 17
improved seeds:         31
```

240-attempt 20-seed result:

```text
average panels:         14.35 -> 11.75
maximum panels:         18 -> 14
average time:            1.41 -> 6.97 s
```

Decision: retain. This became the base of the successful research pipeline.

## Clue-footprint optimization

Experiments added in sequence:

- exact clue repacking;
- adaptive four-cell clue repacking;
- residual clue-tail absorption;
- single-footprint reflow;
- two-footprint reflow.

Observed result:

These stages produced the largest consistent reductions after portfolio selection. In the final 100-seed snapshot:

```text
exact repack accepted:        90 seeds
adaptive repack accepted:     40 seeds
tail absorption accepted:     35 seeds
clue reflow accepted:         10 seeds
```

Decision: retain the algorithms as research evidence. In a future rewrite, combine them into one explicit clue-allocation stage rather than sequential wrappers.

## General victim replacement

Main idea:

Remove one low-value answer before final clue packing, enumerate replacement bundles, and retain complete candidates only after clue allocation and validation.

Observed result:

- selected on 63 / 100 final seeds;
- significant contributor to checkpoint A;
- depth-two search often expanded many states without being selected;
- connectivity pruning became a major factor.

Decision: retain bounded rollback and bundle replacement as a core future technique.

## Checkpoint A

Verified head: `17ba4687ffc94af80cd51c11738e8b4396a03b9f`

Workflow run: `29307485549`

100-seed result:

```text
valid:                         100 / 100
average panels:                  7.77
maximum panels:                 11
minimum panels:                  4
average raw letters:            49.65%
average answers:                45.13
checkpoint result:              PASS
```

Requirement:

```text
average panels <= 8
maximum panels <= 12
```

Decision: checkpoint A achieved. PR remained draft because zero-panel and lexical targets were not achieved.

## Targeted victim repair

Main idea:

Focus replacement search on the worst residual regions rather than applying general victim search everywhere.

Variants explored:

- demand-ranked victim selection;
- exact local replacement;
- depth-two replacement;
- atomic slot pairs;
- disjoint atomic pairs;
- direct crossing pairs;
- supplemental short-fill entries.

Observed result:

The final snapshot accepted targeted exact repair on 16 / 100 seeds. Atomic pair replacement was selected on 5 seeds, all as disjoint reconnection bundles.

Decision: retain targeted search, but make bundle connectivity explicit in a future architecture.

## Original direct isolated-cross experiment

Main idea:

For an isolated one-cell panel surrounded by letters, place a horizontal and vertical word through the cell.

Real 15-seed tail result:

```text
junctions seen:                56
slot pairs built:               0
candidate states:               0
```

Most targets had no legal horizontal clue-anchor/slot geometry.

Decision: insufficient as implemented.

## Rollback-assisted original direct cross

Main idea:

Remove one boundary answer, then run the original direct-cross search.

Real 15-seed tail result:

```text
rollback searches:             58
junctions inspected:          213
slot pairs built:               0
candidate states:               0
```

Root cause:

The original direct-cross precondition required neighboring letters that rollback had just removed. The stages were geometrically incompatible.

Decision: replace with a joint rollback-aware operation.

## Rollback-aware joint crossing pair

Key continuation commits:

```text
7e79a71  expose real rollback-cross telemetry
f7f98a1  add rollback-aware joint crossing search
bc97c16  add real joint-geometry test
ad6ee37  add explicit weak-fill accounting
1ee6ac7  allow conditional research lexical debt
d1c12d8  gate the final snapshot
```

Main idea:

- rollback a boundary word;
- treat the original hole plus freed answer cells as one focus region;
- enumerate horizontal and vertical slots through the target;
- match the crossing letter;
- apply both words atomically;
- require full validation and a panel improvement.

Real result on `construction-checkpoint-40`:

```text
remove:                       БЫТ
insert:                       ИЛ + ПЕТЛЯ
panels:                       9 -> 8
answers:                     44 -> 45
components:                   1
validation:                   pass
```

15-seed tail result:

```text
average panels:               9.33 -> 9.27
regions:                       113 -> 112
isolated regions:               90 -> 89
selected real states:            1
```

Decision: the geometry is proven, but applicability is limited by dictionary domains and lexical quality.

## Final research snapshot

Commit: `d1c12d8acca31edb3b38775db5166f4f5f59ce04`

Workflow runs:

```text
Arrowword quality gate:       29480865364
Rollback cross gate:          29480865358
```

100-seed result:

```text
valid:                         100 / 100
average panels:                  6.78
range:                           3–11
average answers:                45.25
average raw letters:            49.72%
average time:                   10.61 s
```

Negative lexical result:

```text
reported weakFillBudget mean:  10.62
minimum:                         5
maximum:                        16
seeds at proposed cap <= 2:      0
```

Decision:

- preserve the exact implementation as an immutable snapshot branch;
- merge documentation and reproducibility tooling to `main`;
- do not merge the experimental runtime into the production path;
- close the large R&D PR after the research checkpoint is merged;
- begin future work from a clean explicit pipeline architecture.