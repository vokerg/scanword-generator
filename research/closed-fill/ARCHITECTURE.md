# Closed-Fill Architecture Review

## Executive conclusion

The generator is not blocked by one missing heuristic. It is solving several coupled problems at once:

- answer topology;
- dictionary-domain feasibility;
- crossing consistency;
- clue-anchor placement;
- clue-text area allocation;
- answer-graph connectivity;
- lexical quality;
- deterministic runtime limits.

A locally good choice can make a later stage impossible. This is why a sequence of reasonable greedy algorithms can produce valid but stubbornly incomplete grids.

The research branch improved coverage by delaying some decisions and retaining several alternatives. It also demonstrated that the current wrapper-based implementation has reached its maintainability limit.

## Production architecture

The production 0.9 path is intentionally compact:

```text
build one connected answer graph
-> continue dense valid placements
-> allocate clue footprints
-> score complete candidates
-> validate
-> select the best accepted candidate
```

This architecture is fast, deterministic, and easy to gate. Its weakness is that answer topology is mostly fixed before clue-space feasibility is known.

## Research architecture

The closed-fill branch grew into the following effective pipeline:

```text
indexed structural attempts
-> panel-first portfolio selection
-> victim replacement variants
-> clue-footprint allocation
-> structural polish
-> exact clue repack
-> adaptive clue repack
-> tail absorption
-> clue reflow
-> pair reflow
-> targeted victim repair
-> atomic two-slot replacement
-> rollback-aware crossing replacement
-> final validation and baseline guard
```

Each stage was bounded and individually useful for experimentation. As a combined implementation, however, many modules wrap and replace the same solver entry point. This creates several risks:

- load order becomes part of the algorithm;
- telemetry fields can refer to different generations of a search stage;
- a synthetic test may validate orchestration without exercising real geometry;
- global limits can be applied inconsistently by different wrappers;
- dead experiments remain active in the runtime chain;
- performance attribution becomes difficult.

The next stage should not add another wrapper. It should replace the experimental chain with an explicit pipeline over a shared candidate type.

## Approaches and lessons

### 1. Indexed candidate retrieval

**Idea:** replace random scanning of a dictionary subset with indexes by letter, position, and length.

**Result:** strong success.

Candidate checks dropped by roughly 95% in the initial A/B experiment, while generation became faster and coverage slightly improved. This removed the scaling bottleneck for a larger reviewed lexicon.

**Lesson:** indexing is necessary infrastructure, but it does not solve topology.

### 2. More random restarts

**Idea:** explore more greedy paths and select the best complete grid.

**Result:** useful up to a point, but diminishing returns.

More attempts improve the chance of finding a better basin. They do not target the local decision that created a specific singleton hole. Runtime grows almost linearly while the same topology classes remain common.

**Lesson:** restart diversity is helpful, not sufficient.

### 3. Post-layout local CSP

**Idea:** identify each residual region, enumerate legal answer/clue topologies, and solve the local fill with MRV and forward checking.

**Result:** structurally sound but ineffective in the final layout.

After clue packing, most remaining regions are one or two cells. They often cannot host both a clue anchor and a legal answer. Before clue packing, the free region is too large for the same exact local formulation.

**Lesson:** the search unit and timing were wrong. A residual connected component is not always a useful CSP variable set.

### 4. Panel-first portfolio selection

**Idea:** retain many complete valid candidates and rank them lexicographically by residual panels, raw letters, weak entries, clue area, crossings, and answer count.

**Result:** major success.

This was the first large improvement because it evaluated clue packing before selecting the winning structural attempt.

**Lesson:** irreversible layout decisions should be delayed until multiple structural states have been compared.

### 5. Exact and adaptive clue repacking

**Idea:** release clue footprints and solve the set-packing problem again with bounded exact or beam-style search.

**Result:** major success.

Exact repacking was accepted on 90 of 100 final seeds. Adaptive repacking was accepted on 40 seeds. Tail absorption and reflow produced additional gains.

**Lesson:** clue cells are not decoration. They are part of the construction topology.

### 6. Straight insertion polish

**Idea:** after releasing clue layout, insert another legal answer into the saturated grid.

**Result:** rarely useful.

Telemetry showed that most late slots had no acceptable non-weak domain.

**Lesson:** saturated grids usually require replacement, not insertion.

### 7. Victim replacement

**Idea:** remove a low-value boundary answer and search for a replacement bundle that covers more panels.

**Result:** useful and repeatedly selected.

The final portfolio selected a victim-derived state on 63 of 100 seeds. Exact targeted repair improved 16 seeds.

**Lesson:** rollback is the correct escape mechanism for local topology traps, but connectivity must be modeled explicitly.

### 8. Atomic two-slot replacement

**Idea:** after rollback, place two compatible slots together instead of validating each one independently.

**Result:** useful, especially for disjoint reconnection bundles.

Five atomic-pair replacements were selected in the final 100-seed run. All selected pairs were disjoint rather than crossing.

**Lesson:** some moves are only valid as an atomic bundle because an intermediate single-slot state is disconnected or incomplete.

### 9. Original direct isolated-cross search

**Idea:** fill an isolated one-cell panel by placing one horizontal and one vertical word through it.

**Result:** no real candidates.

The search saw 56 apparent tail junctions but built no slot pairs. It failed at geometry and clue-anchor feasibility before evaluating entries.

**Lesson:** visual adjacency is not the same as a legal arrowword slot.

### 10. Rollback plus original direct-cross search

**Idea:** free local space by removing a boundary answer, then run the existing direct-cross search.

**Result:** no real candidates.

Rollback removed letters required by the direct-cross precondition. The two stages were internally inconsistent.

**Lesson:** composing two individually reasonable algorithms does not make their invariants compatible.

### 11. Rollback-aware joint crossing search

**Idea:** enumerate both crossing slots over the entire rollback-freed region and apply them atomically.

**Result:** narrow but real success.

One difficult seed improved from 9 to 8 panels and from 44 to 45 answers.

**Lesson:** the correct operation exists, but dictionary coverage and lexical policy sharply limit its applicability.

## Why the objective is non-monotonic

Several metrics move in opposite directions:

- converting panels into clue text improves active coverage but not answer density;
- adding a two-letter filler may remove a panel but lower editorial quality;
- removing one answer may open better fill but temporarily disconnect the graph;
- a locally denser answer bundle may leave no readable clue area;
- a candidate with more letters may require a much larger clue footprint;
- strict lexical filtering can make a topologically solvable region impossible.

A single weighted score hides these trade-offs. Lexicographic ordering is better, but it still discards useful alternatives when objectives conflict.

## Proposed replacement architecture

### Candidate state

Use one explicit immutable or copy-on-write state structure:

```text
CandidateState
  grid
  answers
  usedAnswers
  clueAnchors
  clueFootprints
  answerGraph
  residualRegions
  metrics
  lexicalMetrics
  provenance
```

Every stage should be a normal function:

```text
CandidateState[] -> CandidateState[]
```

No stage should replace `generateBest` globally.

### Stage 1: structural beam

Generate several answer-topology states with indexed domains. Use bounded beam search or limited discrepancy search rather than one greedy path per attempt.

State ordering should estimate:

- remaining legal crossing opportunities;
- clue-anchor capacity;
- likely residual-island creation;
- lexical-domain entropy;
- connectivity risk.

### Stage 2: Pareto frontier

Retain non-dominated candidates over:

```text
residualPanels
weakFillCount
rawLetterCells
answerCount
clueArea
runtimeCost
```

Do not collapse the frontier to one candidate before clue allocation.

### Stage 3: joint clue feasibility

Before expensive final clue packing, compute a lower-cost feasibility estimate:

- every answer has at least one legal anchor;
- enough connected panel capacity remains;
- high-demand clue regions do not overlap irreparably;
- isolated panel creation is penalized.

### Stage 4: bounded replacement bundles

For difficult residual regions:

1. choose one or two boundary victims;
2. form the rollback-freed focus region;
3. enumerate legal slots that touch the target or reconnect components;
4. rank variables by MRV and graph degree;
5. solve two- or three-slot bundles atomically;
6. apply lexical and clue-capacity checks before full repack.

### Stage 5: exact clue allocation

Run exact or beam set packing only on finalists. Keep the current complete validator unchanged.

### Stage 6: lexical repair

Lexical quality must be addressed globally, not only in the last tail operation.

Possible operations:

- replace a weak answer with an equal-pattern stronger answer;
- replace a weak answer and one neighbor as a joint bundle;
- penalize repeated short fillers during structural search;
- maintain per-grid budgets by lexical class;
- reject candidates whose future pattern domains depend excessively on weak entries.

## Dictionary strategy

The correct target is not “10,000 words” by itself. The target is a reviewed, scored lexicon that improves repeated constrained domains.

Each entry should include:

```text
answer
clue
frequency or familiarity score
part of speech
morphological status
proper-name flag
abbreviation flag
weak-fill class
source and license
```

Vocabulary expansion should follow this loop:

1. mine empty and low-quality pattern domains from deterministic runs;
2. group patterns by frequency and structural value;
3. find candidate entries from licensed linguistic sources;
4. review clueability and familiarity;
5. rerun identical-seed A/B gates;
6. retain only additions that improve the frontier without degrading quality.

## Required future gates

### Structural gate

- 100 / 100 valid;
- exactly one answer component;
- no accidental runs, conflicts, or orphan letters;
- reviewed clues only.

### Coverage gate

Intermediate target:

- average panels <= 2;
- at least 80% zero-panel seeds;
- maximum panels explicitly bounded.

### Lexical gate

- no more than two weak fillers per grid;
- maximum repeated short-fill count;
- minimum average lexical score;
- machine-readable list of all weak entries used.

### Runtime gate

- report median, p95, and maximum runtime;
- report search-node budgets by stage;
- enforce deterministic timeout behavior;
- preserve a fast production fallback.

## Merge policy

The research snapshot should not become the default generator merely because its coverage metric is better. Promotion requires all three dimensions to be green:

1. structural validity;
2. coverage;
3. lexical quality.

At this checkpoint, only the first dimension is fully green. Coverage is materially improved but incomplete. Lexical quality remains below the proposed target.