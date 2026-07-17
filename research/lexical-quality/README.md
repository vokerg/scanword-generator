# Lexical quality research checkpoint

Status: **research-only, not a production release**

Research branch: `r-and-d/lexical-pareto-frontier`

Base snapshot: `research/closed-fill-snapshot-2026-07-16` at
`d1c12d8acca31edb3b38775db5166f4f5f59ce04`

Draft pull request: #6

## Research question

The closed-fill snapshot substantially reduced residual panels, but its telemetry
reported roughly ten `weakFill` answers per grid. The original hypothesis was
that the final repair stages were introducing poor lexical material.

That hypothesis was incomplete. The legacy lexical policy marks **every reviewed
two-letter answer** as weak, regardless of whether it is an ordinary noun such
as `АС`, `ИЛ`, `УМ`, or `ЯД`, a specialist abbreviation such as `ОМ`, or one of
six highly repetitive solfège answers.

This checkpoint asks two separate questions:

1. Can the generator reduce the structural number of two-letter slots without
   losing density or checkpoint reachability?
2. Can it reduce genuinely repetitive editorial fill while preserving the
   already generated grid geometry exactly?

Those questions must not share one metric.

## Metric correction

The research branch retains the legacy `weakFillCount` for compatibility, but
adds explicit editorial measurements:

- `twoLetterCount` — every two-letter answer, a structural property of the grid;
- `commonShortCount` — ordinary reviewed short nouns;
- `specialistShortCount` — units, games, or specialist abbreviations;
- `formulaicShortCount` — the repetitive solfège set
  `ДО`, `РЕ`, `МИ`, `ФА`, `ЛЯ`, `СИ`;
- `editorialWeakCount` — entries currently classified as editorially weak;
- `editorialPenalty` — a transparent aggregate quality score.

The current classification is intentionally small and auditable:

```text
Common short:     АД АС ЕЖ ИЛ УЖ УМ УС ЮГ ЯД ЯК
Specialist short: АР ГО ОМ ПА
Formulaic short:  ДО РЕ МИ ФА ЛЯ СИ
```

This is a research policy, not a universal linguistic claim. It exists to test
whether repeated formulaic answers can be removed safely.

## Baseline

The principal identical-seed checkpoint uses 20 deterministic seeds with the
same closed-fill budgets as the preserved snapshot.

Before editorial repair:

```text
Valid grids:                    20 / 20
Average residual panels:        7.40
Average two-letter answers:     10.95
Average formulaic short answers: 3.45
Maximum formulaic short answers: 6
Average editorial penalty:      519.75
Connected components:           exactly 1
Fallback clues:                 0
```

The total two-letter count is high. The more immediate publication-quality
problem, however, is the repeated solfège vocabulary.

## Experiments

### 1. Portfolio Pareto selection

The first experiment retained a non-dominated candidate frontier over:

```text
(residual panels, weak fill, lexical penalty, letter cells, answer count)
```

A lexical candidate could be selected within one panel of the minimum-panel
candidate.

Twenty paired seeds produced:

```text
                          panel-first    lexical Pareto
Average residual panels       7.00             7.65
Maximum residual panels      10               12
Average legacy weak fill     10.25              9.50
Average lexical penalty     838.25            778.25
Average answers              44.75             44.10
```

Weak fill improved on 6 of 20 seeds and regressed on none. However, later clue
and repair stages amplified a permitted one-panel structural trade-off into
final regressions of three to five panels on individual seeds.

**Conclusion:** lexical selection is real, but selecting before the complete
pipeline is unsafe. This experiment is retained as a negative architectural
result.

Workflow run: `29485486650`

### 2. Early lexical placement penalty

The second experiment penalized weak and two-letter entries during structural
growth.

An isolated 40-attempt probe showed:

```text
                          baseline    lexical penalty
Average answers             35.88          27.75
Maximum answers             48             34
Average weak answers         8.93           5.15
Checkpoint attempts passed   5              0
```

The penalty reduced short fill, but destroyed reachability: no attempt could
reach the required 40 answers.

**Conclusion:** a locally cleaner move can consume the hooks required for dense
future growth. Lexical pressure must not be applied before a viable structural
scaffold exists.

Workflow run: `29487360352`

### 3. Dense-only penalty and parameter sweep

Applying the penalty only after the first 30 answers restored checkpoint
reachability. The initial dense-only result changed average weak fill only from
8.93 to 8.82.

A seven-configuration sweep varied:

- the tolerated two-letter budget;
- the progressive excess penalty;
- the dense-stage multiplier.

No configuration reduced two-letter usage among attempts that actually passed
the production checkpoint. Some configurations reduced panels from 16.8 to
15.8 within the isolated probe, but the lexical objective did not move.

**Conclusion:** the greedy dense-fill trajectory loses alternatives before a
scalar penalty can distinguish them. More coefficient tuning is not justified.

Workflow run: `29487941520`

### 4. Same-geometry single replacement

The first successful editorial pass replaces a formulaic two-letter answer only
when another reviewed answer of the same length matches every crossing letter.
Only unconstrained letters and the exact clue are changed.

Twelve paired seeds produced:

```text
Average formulaic short answers: 3.08 -> 2.75
Improved seeds:                   3 / 12
Regressed seeds:                  0 / 12
Geometry-stable seeds:           12 / 12
Accepted replacements:           4
```

Examples:

```text
ФА -> ПА
ДО -> ГО
```

Workflow run: `29488375737`

### 5. Atomic crossing-pair refit

A remaining short answer is refitted together with one crossing answer. Both
slot footprints remain fixed. External crossing letters, answer uniqueness,
reviewed clues, and complete-grid validation remain mandatory.

Examples:

```text
РЕ + КЛЕН    -> АС + КОСА
РЕ + ТОПОР   -> АР + ТАЙНА
ЛЯ + ИГЛА    -> ЕЖ + ИДЕЯ
МИ + БРИГАДА -> ИЛ + БУЛАВКА
```

On 20 paired seeds, single plus pair repair reduced the average formulaic count
from 3.45 to 2.75. Ten seeds improved, none regressed, and all 20 preserved
geometry exactly.

Workflow run: `29489309854`

### 6. Direct three-slot star CSP

The first three-slot CSP tried the target together with both direct crossing
partners.

It accepted no replacements:

```text
Remaining targets attempted: 55
Full star bundles built:      18
CSP nodes:                    35
Solutions found:              0
```

Thirty-seven targets had only one direct partner. The other eighteen had
non-empty domains but no compatible improving assignment. No search reached its
node limit.

**Conclusion:** increasing the same node budget would not help. The local
component topology had to change.

Workflow run: `29489717970`

### 7. Radius-two component CSP

The solver was generalized to enumerate two connected three-slot topologies:

1. `target + two direct partners`;
2. `target + direct partner + one neighbour of that partner`.

The second topology releases an external letter that the two-slot repair had to
keep fixed. Domains are selected by exact length and external crossing pattern.
MRV, forward checking, uniqueness, exact clues, and full-grid validation are
mandatory.

The enforced 20-seed result:

```text
Valid repaired grids:             20 / 20
Average residual panels:           7.40 -> 7.40
Average two-letter answers:       10.95 -> 10.95
Average formulaic short answers:   3.45 -> 2.50
Maximum formulaic short answers:   6 -> 6
Average editorial penalty:       519.75 -> 467.45
Improved seeds:                   13 / 20
Unchanged seeds:                   7 / 20
Regressed seeds:                   0 / 20
Geometry-stable seeds:            20 / 20
Single replacements accepted:      6
Pair refits accepted:               8
Radius-two refits accepted:         5
```

The final formulaic-count distribution was:

```text
0: 1 seed
1: 5 seeds
2: 4 seeds
3: 5 seeds
4: 4 seeds
6: 1 seed
```

Real radius-two refits included:

```text
РЕ + ВЕЕР + ВИНО       -> ГО + БОБР + БАНК
ДО + ДЫНЯ + ПОНИ       -> ГО + ГИМН + ПУМА
СИ + ВОПРОС + ПУМА     -> АС + АПТЕКА + ТЕМА
СИ + СУМКА + МИР       -> ПА + ПУШКА + ШАР
ФА + ЛОЗА + ЖУРАВЛЬ    -> УМ + АТОМ + БУЛЬВАР
```

Workflow run: `29490125721`

## Current algorithm

The experimental editorial repair is now exposed through one orchestration
stage:

```text
same-geometry-editorial-repair-pipeline-v3
```

It executes:

1. exact one-slot pattern replacement;
2. atomic crossing-pair refit;
3. bounded radius-two component CSP;
4. complete-grid validation and aggregate telemetry.

The individual algorithms remain independently testable library stages. The A/B
checkpoint disables their legacy feature flags and enables only the unified
pipeline.

## Preserved invariants

Every accepted lexical repair must preserve:

- the exact grid dimensions;
- every slot footprint and arrow position;
- residual panel count;
- answer count;
- crossing count;
- raw-letter coverage;
- one connected answer graph;
- all external crossing letters;
- unique answers;
- reviewed answers with exact clues;
- zero accidental runs, conflicts, or orphan letters;
- complete-grid validation.

A candidate that violates any invariant is rolled back atomically.

## What this checkpoint does not solve

This work does **not** reduce the structural number of two-letter slots. It
improves the vocabulary assigned to those slots.

One seed still contains six formulaic short answers after all bounded repairs.
The remaining failures are primarily domain failures, not search-budget
failures. Therefore the next work should be demand-driven:

1. aggregate the missing exact patterns reported by unresolved components;
2. review dictionary additions for recurring, linguistically sound patterns;
3. test radius-three components only where telemetry proves that one additional
   mutable crossing unlocks a domain;
4. evaluate complete-pipeline Pareto selection only after the lexical repair
   result is included in candidate scoring.

Blindly increasing CSP nodes or further tuning local penalties is explicitly not
recommended.

## Reproduction

Run the deterministic primitive tests:

```bash
node tools/construction-portfolio-v3-test.cjs
node tools/construction-lexical-placement-v3-test.cjs
node tools/construction-editorial-replace-v3-test.cjs
node tools/construction-editorial-pair-refit-v3-test.cjs
node tools/construction-editorial-bundle-refit-v3-test.cjs
node tools/construction-editorial-repair-v3-test.cjs
```

Run the paired editorial checkpoint:

```bash
SCANWORD_EDITORIAL_REPLACEMENT_ENFORCE=1 \
node tools/editorial-replacement-checkpoint.cjs 20
```

The GitHub Actions workflow is:

```text
.github/workflows/lexical-frontier.yml
```

Artifacts are JSON Lines files containing the baseline, repaired result,
per-stage telemetry, accepted replacements, unresolved component diagnostics,
and the aggregate summary.

## Merge policy

This branch remains a draft research PR against the immutable closed-fill
snapshot. It should not be merged into production `main` until:

- the unified-pipeline gate is green;
- the research manifest is pinned to a tested head;
- the browser path is either explicitly integrated or explicitly excluded;
- the remaining six-formulaic tail case is documented with demand-pattern
  telemetry;
- the production quality gate remains unchanged and green.
