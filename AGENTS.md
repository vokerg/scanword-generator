# AGENTS.md

This file is the canonical operating guide for the repository root and every subdirectory unless a more specific `AGENTS.md` exists.

## Source of truth

- `main` is the only long-lived development branch.
- Accepted baselines live in `docs/milestones/`.
- Experiments and negative results live in `research/` and must remain reproducible.
- Runtime behavior is determined by `index.html`, Node bootstrap order, feature flags and the latest milestone, not merely by file presence.
- Never weaken the complete validator to make an experiment pass.

## Current baseline

Explicit pipeline 1.2:

```text
40,966-entry attributed corpus v8
-> deterministic active sets at 2,500 and 3,500 entries
-> directly ordered construction, clue and repair runtime
-> same-geometry editorial repair
-> panel-first complete-candidate selection
-> complete validation
```

Canonical defaults:

```text
SCANWORD_EXPLICIT_PIPELINE=on
SCANWORD_PIPELINE_STAGE_RUNTIME=explicit
SCANWORD_WRAPPER_INSTALLATION_LOCK=explicit-pipeline-v1
SCANWORD_FULL_CORPUS_RETRIEVAL=off
SCANWORD_CLUE_FEASIBILITY=off
SCANWORD_PARTIAL_SEARCH=off
```

Canonical decision: `docs/milestones/v1.2-explicit-pipeline-default.md`.

Primary evidence ledgers:

- `research/explicit-default/README.md`
- `research/direct-stage-runtime/README.md`
- `research/adaptive-partial-search/README.md`
- `research/bounded-partial-search/README.md`
- `research/clue-feasibility/README.md`
- `research/full-corpus-retrieval/README.md`
- `research/explicit-pipeline/README.md`

## Production ownership

After initialization:

```text
active generateBest owner: construction-pipeline-v1
execution owner:            direct-production-stage-runtime-v2
rollback owner:             legacy-wrapper-chain
installation lock:          explicit-pipeline-v1
```

`construction-pipeline-v1.js` is the sole active global production owner. No later module may replace `ScanwordSolver.generateBest`.

`SCANWORD_EXPLICIT_PIPELINE=off` selects the historical complete wrapper chain as a rollback source. It does not release the installation lock or permit wrappers to become the active owner.

New algorithms must enter through an explicit stage or an existing explicitly owned production module. Do not add another global `generateBest` wrapper.

## Explicit stage boundary

CandidateState stage contract:

```text
production-stage-source
-> base-construction
-> clue-allocation
-> current-repair-chain
-> validation
-> comparison
```

The direct production source executes:

```text
pre-portfolio construction source
-> construction portfolio
-> portfolio polish
-> clue-footprint repack
-> adaptive clue repack
-> clue-tail absorption
-> single-footprint clue reflow
-> pair clue reflow
-> targeted residual-victim repair
-> baseline guard
-> editorial repair
```

The middle CandidateState stages currently audit and materialize the complete direct result. This stable ownership boundary does not imply that every historical repair implementation has already been rewritten as a pure state transformation.

New stage contracts should use:

```text
CandidateState -> CandidateState
CandidateState -> CandidateState[]
CandidateState[] -> CandidateState[]
```

Preserve copy-on-write, explicit cloning or otherwise auditable state ownership. Do not allow hidden cross-candidate mutation.

## Browser and Node load order

Changing script order is architectural. The required conceptual order is:

```text
base dictionaries and bulk corpus
-> core and dictionary policy
-> lexical policy and full-corpus pattern index
-> solver and construction-v2 runtime
-> clue-feasibility estimator
-> bounded partial-state beam and exact replay bridge
-> construction and clue-repair algorithms
-> editorial demand and repair algorithms
-> vocabulary portfolio
-> direct stage source anchor and runtime
-> CandidateState, stage telemetry and explicit pipeline
-> wrapper-retirement audit
-> renderer and UI
```

The Node benchmark bootstrap must mirror browser ownership and defaults.

## Production modules

- `core.js`: normalization, indexing, deterministic randomness and active-set selection.
- `dictionary-policy.js`: clue and lexical admission.
- `solver.js`: base construction, scoring, metrics and complete validation.
- `construction-v2.js`: indexed attempt construction and exact clue-footprint allocation.
- `construction-vocabulary-portfolio-v1.js`: active-set portfolio and complete candidate comparison.
- `construction-stage-source-anchor-v2.js`: captures the exact pre-wrapper production source.
- `construction-stage-runtime-v2.js`: directly invokes accepted production stages in order.
- `construction-candidate-state-v1.js`: explicit state contract, cloning, provenance and signatures.
- `construction-pipeline-stages-v1.js`: CandidateState stage functions.
- `construction-pipeline-telemetry-v1.js`: stage timing, candidate counts and signatures.
- `construction-pipeline-v1.js`: sole production orchestrator and rollback selector.
- `construction-wrapper-retirement-audit-v1.js`: default, ownership and rollback audit.
- `renderer.js`, `ui.js`: A5 SVG rendering, controls and export.

Check `index.html` before treating any retained research module as an active default.

## Two-level vocabulary retrieval

The 2,500/3,500 hot working sets are construction priors, not universal legal-domain boundaries. Full-corpus access is allowed only through `ScanwordFullCorpusPatternIndexV1` for bounded constrained searches.

Requirements:

- at least one fixed pattern letter;
- normalized admitted Cyrillic answer;
- exact clue and required metadata;
- deterministic bounded ranking;
- exclusion of used and blocked answers;
- complete hot-only versus retrieval-enhanced chain comparison;
- no structural change and a strict final editorial improvement before selection.

Never expose the complete corpus to unconstrained uniform sampling.

## Clue-feasibility estimation

The exact allocator and validator remain authoritative.

Accepted `shadow` mode may observe one production-ranked placement candidate while preserving placement order, random calls and exact output. The `rank` experiment is rejected; the `guard` experiment is unpromoted. Any future output-changing use must be evaluated as a complete bounded-search policy, not justified by local estimator scores.

## Bounded partial-state search

The accepted late-placement beam:

```text
branch point:        placement 14
beam depth:          4
beam width:          4
branching factor:    3
maximum nodes:       48 per sampled attempt
baseline attempts:   120 per active set
probe attempt IDs:   separate from baseline
```

Every beam-replaced attempt retains an exact greedy replay. Final selection occurs only after real clue allocation, repair, editorial cleanup and active-set portfolio comparison. Exact baseline wins complete ties.

Phase 7's adaptive policy may skip additive probes based only on deterministic baseline evidence. It must never reduce the exact production baseline or conceal fallback ancestry.

## Structural invariants

Every accepted grid must satisfy:

1. Every contiguous letter run of length two or more is exactly one assigned answer.
2. Every letter belongs to at least one assigned answer.
3. Crossing letters agree.
4. Every clue footprint resolves to a real arrow and answer start.
5. Every used answer has an admitted exact clue.
6. The answer graph has exactly one connected component.
7. No accidental runs, orphan letters, duplicate directional occupancy or clue conflicts exist.
8. Residual areas are explicit panel cells.

## Complete candidate objective

Compare complete valid candidates lexicographically:

1. fewer residual panels;
2. more answers;
3. more crossings;
4. greater raw-letter coverage;
5. fewer formulaic short answers and lower short-answer editorial penalty;
6. lower selected-grid clue debt when measured;
7. higher existing solver score;
8. deterministic tie-breakers with exact-baseline preference on complete ties.

Partial-state estimates may guide bounded exploration but may not replace measured complete-grid promotion decisions.

## Feature flags and rollback

```text
SCANWORD_EXPLICIT_PIPELINE=on|off
SCANWORD_PIPELINE_STAGE_RUNTIME=explicit
SCANWORD_WRAPPER_INSTALLATION_LOCK=explicit-pipeline-v1
SCANWORD_VOCABULARY_PORTFOLIO_MODE=full|adaptive
SCANWORD_FULL_CORPUS_RETRIEVAL=on|off
SCANWORD_FULL_CORPUS_RETRIEVAL_MODE=empty|small-poor
SCANWORD_CLUE_FEASIBILITY=off|shadow|rank|guard
SCANWORD_PARTIAL_SEARCH=off|shadow|beam
```

A/B flags must never silently change browser defaults.

## Required checks

For production ownership or explicit-stage changes:

```bash
node tools/wrapper-retirement-test-v1.cjs
node tools/construction-stage-runtime-test-v2.cjs
SCANWORD_EXPLICIT_PIPELINE=off node tools/construction-pipeline-parity-test.cjs
```

For the explicit default promotion boundary:

```bash
node tools/explicit-default-parity-checkpoint-v1.cjs \
  research/baselines/seed-sets/development-20.json \
  research-output/explicit-default/development-20.jsonl
```

Use the dedicated workflow for promotion-50 and stability-100.

Minimum corpus and release checks:

```bash
node tools/bulk-lexicon-audit.cjs
node tools/dictionary-count-v3.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/vocabulary-release-checkpoint.cjs 20
```

Run `node --check` for every changed JavaScript/CommonJS file and the matching deterministic primitive test for every bounded algorithm.

## Research discipline

Every substantive experiment must record:

- question and hypothesis;
- exact baseline and candidate modes;
- corpus digest, seed set, environment and budgets;
- acceptance criteria;
- aggregate and per-seed regressions;
- runtime median/p95/max where meaningful;
- examples, counterexamples and failure modes;
- workflow run, artifact ID, digest and exact evidence commit;
- promotion, rejection or deferral boundary.

Keep negative results. Do not rewrite them out of history.

Do not tune on locked promotion or stability seeds. Use development seeds for iteration, promotion for a frozen candidate and stability only after promotion.

## Archive and integration policy

1. Work on a short-lived branch from current `main`.
2. Run the phase gate on the exact implementation head.
3. Preserve the accepted implementation with an immutable `research/archive-...` ref before documentation-only commits.
4. Update the research ledger, archive manifest, README, AGENTS and milestone when affected.
5. Confirm browser/Node defaults and production ownership.
6. Run exact final-head CI.
7. Squash-merge to `main`.
8. Verify the squash commit and post-merge checks.
9. Start the next investigation from updated `main`.

Only `main` should remain permanently. Archive refs are immutable evidence and are exempt from short-lived branch cleanup.

## Next architectural investigation

The original complete-pipeline Pareto-frontier phase was deferred while search-budget calibration and orchestration migration were completed. The next density branch should restore that work using the explicit pipeline:

```text
exact baseline candidate
+ bounded structural finalists
-> exact clue allocation
-> bounded repair
-> same-geometry editorial cleanup
-> complete validation
-> bounded non-dominated frontier
-> final canonical comparison
```

Do not begin broad release or publication-quality claims before that deferred density boundary is explicitly accepted or rejected.
