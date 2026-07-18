# Closed-Fill Research Results

## Scope

All reported grids use the default 13 × 17 layout and deterministic seed strings. A result is considered structurally valid only when the existing validator confirms all of the following:

- every contiguous letter run belongs to exactly one assigned answer;
- every letter belongs to at least one answer;
- crossing letters agree;
- the answer graph has exactly one connected component;
- clue anchors and external clue footprints reference real answers;
- every answer has a reviewed clue;
- no accidental runs, conflicts, orphan letters, or fallback clues exist.

The production coverage checkpoint is also preserved. Experimental candidates that fail it are not selected.

## Provenance

| Item | Value |
|---|---|
| Production baseline commit | `a50c2c25642032cd4c3a9df13580bf5ea9e916a4` |
| Research snapshot commit | `d1c12d8acca31edb3b38775db5166f4f5f59ce04` |
| Snapshot branch | `research/closed-fill-snapshot-2026-07-16` |
| Final quality workflow | `29480865364` |
| Rollback-cross workflow | `29480865358` |
| Snapshot date | `2026-07-16` |

The two final workflows completed successfully on the snapshot SHA.

## Aggregate progression

| Checkpoint | Seeds | Average panels | Range / maximum | Average answers | Average raw letters | Average time |
|---|---:|---:|---:|---:|---:|---:|
| Indexed production baseline | 100 | 15.42 | 10–20 | 44.63 | not recorded in the same report | 1.43 s |
| First enforced closed-fill checkpoint | 100 | 7.77 | 4–11 | 45.13 | 49.65% | not retained as final timing |
| Final research snapshot | 100 | **6.78** | **3–11** | **45.25** | **49.72%** | **10.61 s** |

The final snapshot removes about 56% of the residual panels relative to the indexed production baseline:

```text
15.42 -> 6.78 average panels
```

The improvement costs substantially more computation. Average generation time increased from 1.43 seconds to 10.61 seconds, or roughly 7.4×.

## Final 100-seed checkpoint

Summary from the final `construction-checkpoint-100` artifact:

```text
valid grids:                         100 / 100
average residual panels:             6.78
minimum residual panels:             3
maximum residual panels:            11
average raw-letter coverage:         49.72%
average answers:                     45.25
average elapsed time:                10.61 s
checkpoint passed:                   yes
```

### Stage activity

| Stage | Seeds where accepted / selected |
|---|---:|
| Initial victim replacement selected | 63 |
| Exact targeted victim repair accepted | 16 |
| Atomic pair replacement selected | 5 |
| Exact clue repack accepted | 90 |
| Adaptive clue repack accepted | 40 |
| Clue-tail absorption accepted | 35 |
| Clue reflow accepted | 10 |

All five selected atomic-pair replacements were disjoint replacement pairs. No crossing atomic pair was selected in the final 100-seed run.

The exact targeted stage generated 20 accepted atomic states from 28 compatible pairs. It also pruned 179 pairs on component-connectivity grounds and rejected 151 rollback states as invalid before replacement.

This is an important characteristic of the problem: many locally plausible operations are globally invalid because removing one answer can split the answer graph into multiple components.

## High-panel tail

The tail probe uses 15 fixed seeds that remained difficult after checkpoint A:

```text
14, 21, 24, 28, 40, 43, 53, 62, 65, 67, 69, 70, 71, 83, 89
```

Final summary:

```text
runs:                         15
average panels:               9.27
residual regions:             112
isolated one-cell regions:     89
maximum region size:            4
edge-touching regions:         20
```

Region-size distribution:

| Region size | Count |
|---:|---:|
| 1 | 89 |
| 2 | 20 |
| 3 | 2 |
| 4 | 1 |

About 79% of the remaining regions are isolated single cells. This explains why whole-region local filling performs poorly: most remaining holes do not contain enough free geometry to host a legal answer-and-clue topology without first removing existing answers.

## Direct-cross experiments

### Original direct isolated-cross search

Across the tail set:

- 56 apparent junction regions were seen;
- 52 had no horizontal slot;
- 4 had no vertical slot;
- 0 slot pairs were built;
- 0 word pairs were evaluated;
- 0 states were accepted.

The search failed before dictionary matching.

### Rollback plus original direct-cross search

Across the tail set:

- 45 residual regions were considered;
- 75 boundary victims were considered;
- 58 victims were rolled back;
- 21 rollbacks disconnected the answer graph;
- 213 apparent junctions were inspected;
- 0 slot pairs were built;
- 0 states were accepted.

The reason was a geometric contradiction. The old direct-cross precondition required the four neighboring cells around the target to remain letters. Rollback often freed one or more of those cells, so the second stage rejected the very geometry created by the first stage.

### Rollback-aware joint crossing search

The corrected experiment enumerates horizontal and vertical slots over the full rollback-freed region and validates both words atomically.

Across the tail set:

- 60 residual regions were considered;
- 275 boundary victims were considered;
- 159 victims were rolled back;
- 62 rollbacks disconnected the answer graph;
- 39 horizontal slots were generated;
- 51 vertical slots were generated;
- 3 slot pairs were built;
- 3 word-pair combinations were checked;
- 1 crossing-character match was found;
- 1 structurally valid state was accepted and selected.

This proves that the joint operation is feasible on a real generated grid, but its coverage is currently narrow.

## Seed 40 case study

For `construction-checkpoint-40`, the research solver found the following operation:

```text
remove:   БЫТ
insert:   ИЛ + ПЕТЛЯ
```

Measured effect:

```text
final residual panels:       9 -> 8
answer count:               44 -> 45
structural panel gain:        2 before clue repack
connected components:         1
structural validation:        pass
```

The operation adds `ИЛ`, which is marked as weak fill. The selected base already contained eight weak entries, so the candidate increased the count to nine.

The experiment therefore keeps this state only under an explicit research-only lexical-debt rule:

- at most one additional weak entry;
- only when the structural gain is at least two panels;
- the debt is recorded in telemetry;
- the production generator is not affected.

This is evidence for the topology, not evidence that the final vocabulary is publication quality.

## Lexical-quality result

The exact-repair telemetry exposes a `weakFillBudget` derived from the current candidate. Across the final 100-seed run:

```text
minimum:     5
maximum:    16
mean:       10.62
seeds <= 2:  0 / 100
```

Distribution:

| Reported budget | Seeds |
|---:|---:|
| 5 | 1 |
| 6 | 3 |
| 7 | 3 |
| 8 | 11 |
| 9 | 12 |
| 10 | 20 |
| 11 | 14 |
| 12 | 12 |
| 13 | 16 |
| 14 | 5 |
| 15 | 2 |
| 16 | 1 |

The proposed checkpoint-B target is at most two weak short fillers per grid. The final snapshot is therefore far from that lexical target even though its panel metric is much better.

This is the central negative result of the research: optimizing panel coverage after construction cannot repair lexical debt that was accumulated during initial candidate generation.

## Empty pattern evidence

The tail telemetry contains many empty or unusable domains, including short fixed-letter forms such as:

```text
А?А
Е?К
И?М
К?О
М?О
О?А
Р?Л
Т?И
Ф?О
```

The rollback-aware experiment also encounters longer constrained patterns such as:

```text
???Т?Я
?И?Ь?Е
?О?А?О
Р??Е?О?И
```

A larger flat dictionary is not sufficient by itself. Future vocabulary work should be driven by repeated pattern demand, with frequency, clue quality, morphology, and licensing reviewed before an entry becomes selectable.

## What the results establish

The snapshot establishes that:

1. indexed candidate retrieval is not the remaining performance bottleneck;
2. clue allocation must participate in candidate evaluation;
3. portfolio selection and exact clue repacking produce large, repeatable gains;
4. bounded victim replacement can improve saturated grids;
5. rollback-aware joint slot replacement can solve at least some real singleton holes;
6. the current lexical-quality objective is not enforced early enough;
7. zero-panel automatic construction remains unsolved.

## What the results do not establish

The snapshot does not establish:

- zero residual panels on any required distribution;
- an average of two panels or less;
- publication-quality vocabulary;
- a global cap of two weak fillers;
- production-ready runtime;
- superiority on grid sizes other than 13 × 17;
- superiority under human editorial review.

Those claims would require new gates and new data.