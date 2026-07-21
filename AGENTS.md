# AGENTS.md

This file is the canonical operating guide for the repository root and every subdirectory unless a more specific `AGENTS.md` exists.

## Source of truth

- `main` is the only long-lived development branch.
- Accepted project baselines live in `docs/milestones/`.
- Experiments, including negative results, live in `research/` and must remain reproducible from `main`.
- A file being present in `main` does not by itself make a feature the browser default. Production behavior is determined by `index.html`, load order, feature flags and the latest milestone document.
- The application is an evolving draft. Draft status permits rapid integration; it does not permit hidden debt, false metrics or weakened validation.

## Current project baseline

Vocabulary-first 1.1:

```text
40,966-entry attributed corpus v8
-> deterministic active sets at 2,500 and 3,500 entries
-> complete construction and clue allocation
-> same-geometry editorial repair
-> panel-first candidate selection
-> complete validation
```

Corpus policy includes preferred Russian GeoNames, collision-safe alias handling, 1,469 filtered non-city geographic entities and explicit generic/factual clue metadata.

The browser default remains the full two-candidate portfolio. Adaptive early acceptance is available only through `SCANWORD_VOCABULARY_PORTFOLIO_MODE=adaptive`.

Phase 3 adds an opt-in explicit candidate-state pipeline with exact behavior parity. `SCANWORD_EXPLICIT_PIPELINE` remains `off` in the browser. When enabled, the complete accepted generator runs once as a legacy source stage and the explicit path exposes candidate state, stage order, timing, signatures and validation without changing the returned grid.

Phase 4 adds opt-in bounded full-corpus retrieval for constrained same-geometry repair patterns. `SCANWORD_FULL_CORPUS_RETRIEVAL` remains `off` in the browser. Retrieval may expand only fixed-letter domains and may enter a final result only after complete hot-only and retrieval-enhanced repair chains are compared under strict structural and editorial gates.

Phase 5 adds opt-in incremental clue-feasibility telemetry at the active `solver.buildAttempt` boundary. `SCANWORD_CLUE_FEASIBILITY` remains `off` in the browser. The accepted `shadow` mode evaluates one production-ranked placement candidate, preserves candidate order and random calls, and calibrates optimistic regional bounds against the unchanged exact clue allocator. `rank` and `guard` are retained experiments, not promoted behavior.

Phase 6 adds an opt-in deterministic late-placement beam. `SCANWORD_PARTIAL_SEARCH` remains `off` in the browser. The accepted `beam` experiment retains bounded placement alternatives, reconstructs the exact greedy fallback for every replaced attempt, evaluates both through the complete production pipeline and selects only at the final active-set portfolio boundary. It improved development-20 average panels from 5.30 to 4.90 with zero canonical objective regressions, but runtime increased by about 65%, so it is not a browser default.

Canonical decision: `docs/milestones/v1.1-vocabulary-greatness.md`.

Evidence ledgers:

- `research/explicit-pipeline/README.md`
- `research/full-corpus-retrieval/README.md`
- `research/clue-feasibility/README.md`
- `research/bounded-partial-search/README.md`

## Runtime structure

### Browser entry point

`index.html` owns:

- default feature flags;
- script load order;
- default grid and UI values;
- user-visible corpus and pipeline description.

Changing script order is architectural. The wrapper and pipeline order must remain:

```text
base dictionaries and bulk corpus
-> core and dictionary policy
-> lexical policy and full-corpus pattern index
-> solver
-> construction-v2 runtime and construction-v2
-> clue-feasibility estimator
-> bounded partial-state beam
-> exact baseline replay bridge
-> remaining construction and clue-repair stages
-> editorial demand lexicons
-> single replacement
-> pair refit
-> radius-two bundle refit
-> unified editorial repair
-> vocabulary portfolio
-> explicit CandidateState and pipeline modules
-> renderer and UI
```

The vocabulary portfolio wraps the repaired single-candidate generator, so every active-set candidate is repaired before selection. The Phase 3 explicit pipeline loads after the final production wrapper, captures that complete generator as `legacy-source`, and remains a no-op delegation while `SCANWORD_EXPLICIT_PIPELINE=off`.

The Phase 4 index loads before solver and repair modules so bounded stage functions can use one shared deterministic retrieval API. It is lazy and does not build while `SCANWORD_FULL_CORPUS_RETRIEVAL=off`.

The Phase 5 estimator loads after `construction-v2.js`, where the indexed attempt builder and exact clue allocator are available, and before later construction wrappers. It may wrap `buildAttempt` and observe `assignClueTextCellsV2`; it may not add another `generateBest` wrapper.

The Phase 6 beam loads after the estimator and wraps only `buildAttempt`. The exact replay bridge loads immediately after it. Search modules may not globally wrap `generateBest`. Complete-pipeline comparison is integrated into the existing construction and vocabulary portfolio wrappers.

### Production modules

- `core.js`: normalization, indexing, deterministic randomness and active-set selection.
- `dictionary-policy.js`: clue and lexical admission policy.
- `full-corpus-pattern-index-v1.js`: complete admitted runtime vocabulary index, constrained lookup, deterministic ranking and retrieval telemetry.
- `solver.js`: base construction, crossings, scoring, metrics and complete validation.
- `construction-v2.js`: indexed attempt construction and exact clue-footprint allocation.
- `construction-clue-feasibility-v1.js`: opt-in regional clue-capacity and local placement telemetry.
- `construction-bounded-partial-search-v1.js`: deterministic bounded late-placement beam, state cloning, ranking, signatures and ancestry.
- `construction-bounded-partial-search-fallback-v1.js`: exact random-sequence replay of the greedy state for every beam-replaced attempt.
- `construction-portfolio.js`: attempt portfolio, clue allocation, baseline/beam state evaluation and victim-repair integration.
- `construction-editorial-repair-v3.js`: final same-geometry cleanup and complete hot/retrieval chain comparison.
- `construction-vocabulary-portfolio-v1.js`: full/adaptive active-set portfolio and Phase 6 complete baseline plus beam-probe comparison.
- `construction-candidate-state-v1.js`: explicit candidate-state contract, cloning, provenance and deterministic signatures.
- `construction-pipeline-stages-v1.js`: normal stage functions for the compatibility boundary and conditional Phase 4/5/6 observations.
- `construction-pipeline-telemetry-v1.js`: stage timing, candidate counts, signatures and status.
- `construction-pipeline-v1.js`: opt-in orchestrator and legacy-source compatibility boundary.
- `renderer.js`, `ui.js`: A5 SVG rendering, controls and export.

Several retained modules are research artifacts. Check `index.html` and the current milestone before treating them as active defaults.

## Explicit pipeline boundary

The accepted base stage order is:

```text
legacy-source
-> base-construction
-> clue-allocation
-> current-repair-chain
-> validation
-> comparison
```

Conditional observed stages run before validation:

```text
current-repair-chain
-> clue-feasibility          when feasibility telemetry is enabled
-> bounded-partial-search    when bounded search is enabled
-> full-corpus-retrieval     when retrieval is enabled
-> validation
```

During Phase 3, `legacy-source` owns the historical production wrapper chain. The middle stages are contract observations, validation calls the unchanged `ScanwordSolver.resultMetrics`, and comparison is identity selection over the accepted candidate. This is a transitional compatibility boundary, not permission to add more wrappers inside `legacy-source`.

New construction work should be expressed as `CandidateState -> CandidateState`, `CandidateState -> CandidateState[]`, or `CandidateState[] -> CandidateState[]`. Preserve copy-on-write, explicit cloning or otherwise auditable state ownership. Do not introduce hidden cross-candidate mutation.

## Two-level vocabulary retrieval

The seed-specific 2,500/3,500-entry hot working set is a prior, not a universal legal-domain boundary. Full-corpus access is allowed only through `ScanwordFullCorpusPatternIndexV1` and only for bounded constrained searches.

### Index and admission

The index covers the complete admitted runtime vocabulary: the generated 40,966-entry v8 corpus plus reviewed hand-maintained entries. It is keyed by answer length, position/fixed letter and intersections of constrained buckets.

Every returned entry must have normalized Cyrillic spelling, supported length, an exact clue, admitted metadata, no blocked status and no used-answer or explicit exclusion collision.

An all-wildcard query is not a constrained search. It must be rejected unless a separately documented experiment explicitly permits it. Phase 4 does not permit it.

### Trigger modes

```text
SCANWORD_FULL_CORPUS_RETRIEVAL_MODE=empty
```

Retrieve only when the hot domain is empty.

```text
SCANWORD_FULL_CORPUS_RETRIEVAL_MODE=small-poor
```

Also evaluate bounded fallback when the hot domain is below the configured threshold or uniformly poor under the editorial policy.

Neither mode changes unconstrained base-construction sampling.

### Complete-chain acceptance

When retrieval is enabled, `construction-editorial-repair-v3.js` evaluates cloned candidates through:

```text
hot-only complete repair chain
retrieval-enhanced complete repair chain
```

The retrieval candidate may replace the hot candidate only when:

1. structural signatures are identical;
2. complete validation passes;
3. the answer graph remains one component;
4. all clues remain exact;
5. two-letter count does not increase;
6. final formulaic-short count decreases, or remains equal while final editorial penalty strictly decreases.

Equal, ambiguous or worse output must retain the hot-only candidate. Telemetry may record rejected fallback candidates, but final selected-fallback counts must exclude them.

## Incremental clue-feasibility estimation

The accepted implementation is `regional-bounds-local-delta-v1`.

For a state, it records:

- remaining panel cells and panel-region topology;
- isolated one-cell panel regions;
- clue anchors with no adjacent panel start;
- long-clue preferred-cell plausibility;
- optimistic external-clue and clue-text-cell upper bounds;
- one-pass regional capacity estimate;
- overlap pressure and maximum clue pressure per region.

For an observed placement candidate, it records:

- consumed panel cells;
- newly stranded clue anchors;
- newly implausible long clues;
- newly isolated panels;
- new clue-anchor domain size;
- violation of the preserved 45-cell monotonic capacity floor.

The real allocator and complete validator remain authoritative. An optimistic estimator pass is never proof that allocation will succeed.

### Accepted mode

```text
SCANWORD_CLUE_FEASIBILITY=shadow
SCANWORD_CLUE_FEASIBILITY_CANDIDATES=1
```

Shadow mode must preserve placement order, shortlist size, deterministic random calls, exact clue allocation, downstream repair behavior and final output digest.

The development gate requires 20/20 exact output parity, zero invalid/disconnected/non-exact/checkpoint-failing grids, zero false negatives across completed-state calibration and runtime ratio no greater than 1.15.

### Rejected or unpromoted modes

`SCANWORD_CLUE_FEASIBILITY=rank` is rejected. It improved average panels on development seeds but caused six panel regressions, eleven editorial regressions and 16.1% runtime overhead. Do not reuse its local utility as a production placement objective without a new complete-search experiment.

`SCANWORD_CLUE_FEASIBILITY=guard` is unpromoted. It may reject only placements that make the preserved 45-cell clue-text checkpoint mathematically impossible, but no development attempt crossed that floor. Do not claim runtime savings or pruning value from it.

Future output-changing use of feasibility telemetry must be evaluated as a complete bounded search policy, not justified by local estimator scores alone.

## Bounded partial-state search

The accepted Phase 6 implementation is `late-placement-beam-v1` with a `split-complete-pipeline-v1` outer comparison.

### State ownership

Every branch candidate must own independent copies of:

- the grid and each cell's slot, direction and clue arrays;
- placed-answer records and their cell coordinates;
- the used-answer set;
- clue footprints and mutable clue metadata;
- ancestry and search telemetry.

Do not mutate a parent after a child is created. Equivalent states must be deduplicated by deterministic structural signature.

### Accepted bounds

```text
branch point:          placement 14
beam depth:            4
beam width:            4
branching factor:      3
maximum nodes:         48 per sampled attempt
sample rate:           0.20
baseline attempts:     120 per active set
beam probe attempts:   60 per active set
beam attempt IDs:      120–179
```

Timeout and budget behavior must be deterministic. The exact default candidate must remain available.

### Complete-pipeline fallback

Local or pre-allocation preference is not acceptance. The accepted path is:

```text
complete exact baseline portfolio
+ isolated bounded beam probe
-> exact clue allocation
-> exact greedy replay for every beam-replaced attempt
-> repair and editorial chain
-> active-set portfolio comparison
-> complete validation
-> canonical final objective
```

A beam state may not delete, replace or conceal the exact baseline complete result. On a complete tie, prefer the exact baseline.

The final selected beam result must include ancestry with at least one `kind: "beam"` step. Search telemetry must record sampled attempts, nodes, depth, beam width, finalists, locally preferred states, returned beam states and selected provenance.

### Phase 6 acceptance

The development-20 gate requires:

- all off, shadow and beam runs complete;
- 100% validity, connectivity, exact clues and coverage checkpoint passage;
- 20/20 exact shadow output parity;
- zero regressions under the complete canonical objective;
- at least one panel improvement;
- at least one complete-objective improvement;
- at least one selected beam result with complete ancestry;
- expanded nodes and non-zero search depth;
- shadow runtime ratio no greater than 1.65;
- beam runtime ratio no greater than 1.70.

The accepted development result improved average panels from 5.30 to 4.90 with six panel wins, no canonical objective regressions and five ancestry-proven selected beam grids. It remains off by default because runtime ratio was 1.6484 and zero-panel rate remained 0%.

Do not treat extra attempt partitions as search evidence. The full exact baseline must be held constant when attributing gains to retained alternatives.

## Dictionary architecture

### Hand-maintained sources

```text
words.js
short-words.js
clues.js
extra-dictionary.js
two-letter-words.js
editorial-demand-*.js
```

Use these for small reviewed additions and targeted repair vocabulary.

### Generated bulk corpus

```text
bulk-lexicon-runtime.js
bulk-lexicon/loader.js
bulk-lexicon/manifest.json
bulk-lexicon/*.js
```

Generated chunks are build artifacts. Do not hand-edit them.

The selected builder is `tools/build-bulk-lexicon-v8.py`. Earlier numbered builders are retained because they document rejected admission policies. `tools/build-bulk-lexicon-v9-diagnostic.py` is diagnostic research, not the selected generator.

To change the bulk corpus:

1. modify the selected builder or documented source/filter policy;
2. rebuild every chunk, loader and manifest together;
3. run corpus audit and dictionary count;
4. inspect category, length, clue-kind and source distributions;
5. run identical-seed density and editorial benchmarks;
6. document sources, licenses, canonical-name handling and accepted debt.

Every accepted entry must retain normalized answer, usable clue, lexical category and quality, source and license, source identifier where available, clue kind, generic/generated-template flags and factual metadata where applicable.

Do not increase corpus size with unreviewable inflections, malformed abbreviations, colliding aliases or entries without usable clues.

## Structural invariants

Every accepted grid must satisfy:

1. Every contiguous letter run of length two or more is exactly one assigned answer.
2. Every letter belongs to at least one assigned answer.
3. Crossing letters agree.
4. Every arrow and clue footprint resolves to an answer start.
5. Every used answer has an admitted exact clue.
6. The answer graph has exactly one connected component.
7. No accidental runs, orphan letters or conflicting slots exist.
8. Residual areas are explicit panels, never unassigned answer cells.

Never weaken the complete validator to pass a benchmark.

## Objective hierarchy

Compare complete valid candidates lexicographically:

1. fewer residual panels;
2. more answers;
3. more crossings;
4. greater raw-letter coverage;
5. fewer formulaic short answers and lower short-answer editorial penalty;
6. lower selected-grid clue debt, when an experiment explicitly measures it;
7. higher existing solver score;
8. deterministic tie-breakers with exact-baseline preference on complete ties.

Source-aware, clue-aware or feasibility metrics must not outrank structural density without a separately documented complete-search experiment.

A lower answer count is not a regression when residual panels improve, because panel count is the first canonical objective. Per-seed reports must still disclose the answer change.

## Feature flags and rollback

```text
SCANWORD_BULK_LEXICON=off
SCANWORD_VOCABULARY_PORTFOLIO=off
SCANWORD_VOCABULARY_PORTFOLIO_MODE=full|adaptive
SCANWORD_EDITORIAL_REPAIR=off
SCANWORD_CATEGORY_BALANCE=on
SCANWORD_CONSTRUCTION_MODE=legacy
SCANWORD_EXPLICIT_PIPELINE=on
SCANWORD_FULL_CORPUS_RETRIEVAL=on
SCANWORD_FULL_CORPUS_RETRIEVAL_MODE=empty|small-poor
SCANWORD_CLUE_FEASIBILITY=off|shadow|rank|guard
SCANWORD_CLUE_FEASIBILITY_CANDIDATES=1
SCANWORD_PARTIAL_SEARCH=off|shadow|beam
SCANWORD_PARTIAL_SEARCH_RATE=0.20
SCANWORD_PARTIAL_SEARCH_START=14
SCANWORD_PARTIAL_SEARCH_DEPTH=4
SCANWORD_PARTIAL_SEARCH_BEAM=4
SCANWORD_PARTIAL_SEARCH_BRANCHING=3
SCANWORD_PARTIAL_SEARCH_NODES=48
SCANWORD_PARTIAL_SEARCH_BEAM_ATTEMPTS=60
SCANWORD_PARTIAL_SEARCH_BEAM_OFFSET=120
```

A/B flags must not silently change browser defaults.

## Required checks

Minimum dictionary or pipeline checks:

```bash
node tools/bulk-lexicon-audit.cjs
node tools/dictionary-count-v3.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/vocabulary-release-checkpoint.cjs 20
```

For adaptive changes:

```bash
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/vocabulary-adaptive-checkpoint.cjs 20
```

For explicit-pipeline contract or stage changes:

```bash
node tools/construction-pipeline-parity-test.cjs
SCANWORD_PIPELINE_CONCURRENCY=2 \
  node tools/construction-pipeline-checkpoint.cjs \
  20 research-output/explicit-pipeline/development-parity.jsonl
```

For full-corpus retrieval changes:

```bash
node tools/full-corpus-pattern-index-test.cjs
node tools/full-corpus-pair-priority-test.cjs
node tools/full-corpus-repair-selection-test.cjs
SCANWORD_RETRIEVAL_CONCURRENCY=2 \
SCANWORD_RETRIEVAL_ENFORCE=1 \
  node tools/full-corpus-retrieval-checkpoint.cjs \
  20 research-output/full-corpus-retrieval
```

For clue-feasibility changes:

```bash
node tools/clue-feasibility-estimator-test.cjs
node tools/clue-feasibility-shadow-parity-test.cjs
node tools/construction-pipeline-parity-test.cjs
SCANWORD_CLUE_FEASIBILITY_CONCURRENCY=2 \
SCANWORD_CLUE_FEASIBILITY_MODES=off,shadow \
SCANWORD_CLUE_FEASIBILITY_CANDIDATES=1 \
  node tools/clue-feasibility-checkpoint.cjs \
  research-output/clue-feasibility 20
node tools/clue-feasibility-acceptance-v1.cjs \
  research-output/clue-feasibility
```

For bounded partial-search changes:

```bash
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/bounded-partial-search-test.cjs
SCANWORD_PARTIAL_SEARCH_CONCURRENCY=2 \
SCANWORD_PARTIAL_SEARCH_MODES=off,shadow,beam \
SCANWORD_PARTIAL_SEARCH_RATE=0.20 \
SCANWORD_PARTIAL_SEARCH_START=14 \
SCANWORD_PARTIAL_SEARCH_DEPTH=4 \
SCANWORD_PARTIAL_SEARCH_BEAM=4 \
SCANWORD_PARTIAL_SEARCH_BRANCHING=3 \
SCANWORD_PARTIAL_SEARCH_NODES=48 \
SCANWORD_PARTIAL_SEARCH_BEAM_ATTEMPTS=60 \
SCANWORD_PARTIAL_SEARCH_BEAM_OFFSET=120 \
  node tools/bounded-partial-search-checkpoint.cjs \
  research-output/bounded-partial-search 20
node tools/bounded-partial-search-acceptance-v1.cjs \
  research-output/bounded-partial-search
```

Use `set -o pipefail` when a gate writes through `tee`. Also run `node --check` for every changed JavaScript/CommonJS file and the matching deterministic test for any bounded construction stage.

A baseline merge must record complete structural validity, one connected component, exact clues only, corpus counts, browser defaults, script order, identical-seed metrics, runtime, per-seed regressions and known uncompleted checkpoints.

## Research discipline

Every substantive experiment belongs in `research/` and should state:

- question and hypothesis;
- exact baseline and candidate modes;
- seed set and environment limits;
- acceptance criteria;
- aggregate and per-seed regressions;
- runtime;
- examples and counterexamples;
- negative result or limitation;
- workflow run, artifact ID, digest and commit SHA when available.

Keep failed approaches. Do not rewrite negative evidence out of history.

Prefer an explicit pipeline stage over another global `generateBest` wrapper. A new stage may not globally replace `generateBest`; it must enter through the explicit orchestrator or be integrated into an existing owner with an explicit, tested contract.

Do not use the full corpus as an unconstrained random or uniformly expanded construction pool. Pattern retrieval must be demand-driven, bounded, admitted and measured. Local fallback improvement must not be promoted without complete-chain or complete-pipeline comparison.

Do not promote partial-state ranking from local metrics alone. Compare final valid candidates after clue allocation, repair and editorial processing, and preserve the exact baseline fallback.

Do not tune on the locked Phase 2 promotion or stability seed sets. Use development seeds for iteration, promotion only for a frozen candidate, and stability only after promotion when the phase gate requires it.

## Canonical directories

```text
.github/workflows/                    gates and research reproduction
bulk-lexicon/                         generated chunks, loader and manifest
docs/milestones/                      accepted project baselines
research/closed-fill/                 topology and clue-allocation history
research/explicit-pipeline/           explicit CandidateState and parity evidence
research/full-corpus-retrieval/       bounded pattern retrieval and negative evidence
research/clue-feasibility/            calibrated estimator and rejected ranking evidence
research/bounded-partial-search/      bounded search, ancestry and complete-pipeline evidence
research/lexical-quality/             same-geometry repair experiments
research/vocabulary-first/            corpus and active-set history
research/vocabulary-greatness-1.1/    truthful benchmark and corpus v8 ledger
tools/                                builders, audits, tests and benchmarks
```

## Documentation rules

- `README.md` describes the current project baseline.
- `AGENTS.md` describes architecture, ownership and change procedure.
- `docs/milestones/` records accepted boundaries and evidence.
- `research/` records experiments and distinguishes observation from inference.
- `index.html` user-visible counts and descriptions must match the committed corpus.
- Metrics must include baseline, sample size and validation boundary.
- Do not claim zero-panel or publication-ready output without explicit evidence.

## Release and integration process

1. Complete and document a bounded experiment on a short-lived branch.
2. Run the relevant checkpoint on the exact candidate head.
3. Preserve accepted evidence with an immutable `research/archive-...` ref before documentation-only commits.
4. Update README, AGENTS, milestone, research ledger and user-visible counts when affected.
5. Confirm browser defaults and wrapper/pipeline order.
6. Run exact final-head CI.
7. Squash-merge to `main` when the accepted draft boundary is clear.
8. Verify the squash commit and post-merge checks.
9. Start the next investigation from updated `main` on a new branch.
10. Delete obsolete branches when no workflow or open PR depends on them.

## Branch policy

Only `main` should remain permanently. A branch may be removed when its PR is merged or closed, conclusions are documented in `main`, no workflow fetches the branch name and no open PR depends on it.

Deleting a branch is not a substitute for documenting the experiment first.
