# AGENTS.md

This file is the canonical operating guide for the repository root and every subdirectory unless a more specific `AGENTS.md` exists.

## Source of truth

- `main` is the only long-lived development branch.
- Accepted project baselines live in `docs/milestones/`.
- Experiments, including negative results, live in `research/` and must remain reproducible from `main`.
- A file being present in `main` does not by itself make a feature the browser default. Production behavior is determined by `index.html`, load order, feature flags and the latest milestone document.
- The whole application is an evolving draft. Draft status permits rapid integration; it does not permit hidden debt, false metrics or weakened validation.

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

Canonical decision: `docs/milestones/v1.1-vocabulary-greatness.md`. Explicit-pipeline parity evidence: `research/explicit-pipeline/README.md`.

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
-> solver and construction stages
-> editorial lexical policy and demand lexicons
-> single replacement
-> pair refit
-> radius-two bundle refit
-> unified editorial repair
-> vocabulary portfolio
-> explicit CandidateState and pipeline modules
-> renderer and UI
```

The vocabulary portfolio wraps the repaired single-candidate generator, so every active-set candidate is repaired before selection. The Phase 3 explicit pipeline loads after the final production wrapper, captures that complete generator as `legacy-source`, and remains a no-op delegation while `SCANWORD_EXPLICIT_PIPELINE=off`.

### Production modules

- `core.js`: normalization, indexing, deterministic randomness and active-set selection.
- `dictionary-policy.js`: clue and lexical admission policy.
- `solver.js`: base construction, crossings, scoring, metrics and complete validation.
- `construction-*.js`: bounded construction, clue allocation, rollback and repair stages.
- `construction-editorial-repair-v3.js`: final same-geometry cleanup.
- `construction-vocabulary-portfolio-v1.js`: full/adaptive active-set portfolio.
- `construction-candidate-state-v1.js`: explicit candidate-state contract, cloning, provenance and deterministic signatures.
- `construction-pipeline-stages-v1.js`: normal stage functions for the Phase 3 compatibility boundary.
- `construction-pipeline-telemetry-v1.js`: stage timing, candidate counts, signatures and status.
- `construction-pipeline-v1.js`: opt-in orchestrator and legacy-source compatibility boundary.
- `renderer.js`, `ui.js`: A5 SVG rendering, controls and export.

Several retained modules are research artifacts. Check `index.html` and the current milestone before treating them as active defaults.

### Explicit pipeline boundary

The accepted Phase 3 stage order is:

```text
legacy-source
-> base-construction
-> clue-allocation
-> current-repair-chain
-> validation
-> comparison
```

During Phase 3, `legacy-source` owns the historical production wrapper chain. The middle stages are contract observations, validation calls the unchanged `ScanwordSolver.resultMetrics`, and comparison is identity selection over the accepted candidate. This is a transitional compatibility boundary, not permission to add more wrappers inside `legacy-source`.

New construction work should be expressed as `CandidateState -> CandidateState`, `CandidateState -> CandidateState[]`, or `CandidateState[] -> CandidateState[]`. Preserve copy-on-write, explicit cloning or otherwise auditable state ownership. Do not introduce hidden cross-candidate mutation.

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

Every accepted entry must retain:

- normalized answer;
- usable clue;
- lexical category and quality score;
- source and license;
- source identifier where available;
- clue kind;
- `genericTemplate` and `generatedTemplate` flags;
- factual metadata when a clue was generated from source facts.

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
5. lower short-answer editorial penalty and fewer formulaic short answers;
6. lower selected-grid clue debt, when an experiment explicitly measures it;
7. higher existing solver score;
8. deterministic tie-breakers.

Source-aware or clue-aware metrics must not outrank structural density without a separately documented experiment.

## Feature flags and rollback

```text
SCANWORD_BULK_LEXICON=off
```

Use the former construction dictionary.

```text
SCANWORD_VOCABULARY_PORTFOLIO=off
```

Construct one active working set.

```text
SCANWORD_VOCABULARY_PORTFOLIO_MODE=full|adaptive
```

Choose complete portfolio evaluation or conservative early acceptance.

```text
SCANWORD_EDITORIAL_REPAIR=off
```

Disable final same-geometry cleanup.

```text
SCANWORD_CATEGORY_BALANCE=on
```

Enable retained category-cap research.

```text
SCANWORD_CONSTRUCTION_MODE=legacy
```

Use the original construction path.

```text
SCANWORD_EXPLICIT_PIPELINE=on
```

Run the accepted production generator through the explicit Phase 3 candidate-state and telemetry boundary. The committed browser default is `off` until a later release decision changes it with complete evidence.

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

The explicit parity checkpoint must compare isolated legacy and explicit processes on full-grid, placed-answer, clue and geometry digests as well as validity, connectivity, panels, answers and crossings. Runtime must remain within the phase-specific gate.

Also run `node --check` for every changed JavaScript/CommonJS file and the matching deterministic test for any bounded construction stage.

A baseline merge must record:

- complete structural validity;
- one connected component;
- exact clues only;
- corpus counts and audit status;
- browser defaults and script order;
- identical-seed baseline and candidate metrics;
- runtime;
- per-seed regressions, not averages alone;
- known uncompleted checkpoints.

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

Prefer an explicit pipeline stage over another global `generateBest` wrapper. When a wrapper is unavoidable, document its load-order contract and test real generation. After Phase 3, a new stage may not globally replace `generateBest`; it must enter through the explicit orchestrator or be retained strictly as documented historical research.

Do not tune on the locked Phase 2 promotion or stability seed sets. Use development seeds for iteration, promotion only for a frozen candidate, and stability only after promotion when the phase gate requires it.

## Canonical directories

```text
.github/workflows/                    gates and research reproduction
bulk-lexicon/                         generated chunks, loader and manifest
docs/milestones/                      accepted project baselines
research/closed-fill/                 topology and clue-allocation history
research/explicit-pipeline/           explicit CandidateState and parity evidence
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
3. Update README, AGENTS, milestone, research ledger and user-visible counts when they are affected.
4. Confirm browser defaults and wrapper/pipeline order.
5. Squash-merge to `main` when the accepted draft boundary is clear.
6. Verify post-merge checks.
7. Start the next investigation from updated `main` on a new branch.
8. Delete obsolete branches when no workflow or open PR depends on them.

## Branch policy

Only `main` should remain permanently. A branch may be removed when its PR is merged or closed, conclusions are documented in `main`, no workflow fetches the branch name and no open PR depends on it.

Deleting a branch is not a substitute for documenting the experiment first.
