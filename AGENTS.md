# AGENTS.md

This file is the canonical operating guide for the repository root and every subdirectory unless a more specific `AGENTS.md` exists.

## Source of truth

- `main` is the only long-lived development branch.
- Accepted baselines live in `docs/milestones/`.
- Experiments, harness defects and negative results live in `research/` and must remain reproducible.
- Runtime behavior is determined by `index.html`, Node bootstrap order, explicit environment flags and the latest milestone, not merely by file presence.
- Never weaken the complete validator to make an experiment pass.

## Current baseline

Complete frontier 1.3:

```text
40,966-entry attributed corpus v8
-> deterministic active sets at 2,500 and 3,500 entries
-> indexed construction and exact clue allocation
-> width-four repair-potential frontier
-> directly ordered clue, repair and editorial runtime per finalist
-> complete validation
-> canonical panel-first final comparison
```

Canonical browser defaults:

```text
SCANWORD_EXPLICIT_PIPELINE=on
SCANWORD_PIPELINE_STAGE_RUNTIME=explicit
SCANWORD_WRAPPER_INSTALLATION_LOCK=explicit-pipeline-v1
SCANWORD_COMPLETE_PIPELINE_FRONTIER=on
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4
SCANWORD_FULL_CORPUS_RETRIEVAL=off
SCANWORD_CLUE_FEASIBILITY=off
SCANWORD_PARTIAL_SEARCH=off
```

Exact Phase 9 rollback:

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=off
```

Historical wrapper-chain rollback:

```text
SCANWORD_EXPLICIT_PIPELINE=off
```

Node benchmarks must set frontier mode explicitly. Do not silently change locked historical baseline configurations.

Canonical decision: `docs/milestones/v1.3-complete-pipeline-frontier.md`.

Primary evidence ledgers:

- `research/complete-pipeline-frontier/README.md`
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

`SCANWORD_EXPLICIT_PIPELINE=off` selects the historical complete wrapper chain as a rollback source. It does not release the installation lock.

New algorithms must enter through an explicit stage or an existing explicitly owned production module. Do not add another global `generateBest` wrapper.

## Accepted complete-pipeline frontier

`construction-portfolio.js` retains at most four checkpoint-passing complete candidates. The exact Phase 9 local winner is immutable member zero.

The frontier vector includes:

```text
residual panels
letter cells
weak fill
clue-text cells
external clue capacity
crossings
answers
panel-region count
isolated panels
residual concentration
```

Retention must be deterministic. Record every dominance rejection, width rejection and candidate provenance. Never remove member zero.

Every retained finalist executes:

```text
portfolio polish
-> clue-footprint repack
-> adaptive clue repack
-> clue-tail absorption
-> single-footprint reflow
-> pair-footprint reflow
-> targeted residual-victim repair
-> shared exact legacy guard
-> same-geometry editorial repair
-> complete validation
-> canonical final comparison
```

Generate the legacy guard once and clone it per finalist. Do not multiply unrestricted construction attempts or legacy generation by frontier width.

Only valid, connected, exact-clue candidates are eligible. Complete ties must select the lowest frontier index, preserving member zero.

The heavy transient frontier must remain non-enumerable or otherwise excluded from normal serialized result payloads.

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

The accepted frontier currently begins after exact clue allocation and construction-level victim repair. This does not imply that every historical repair implementation is a pure CandidateState transformation.

New stage contracts should use:

```text
CandidateState -> CandidateState
CandidateState -> CandidateState[]
CandidateState[] -> CandidateState[]
```

Preserve copy-on-write, explicit cloning or otherwise auditable state ownership. Do not allow hidden cross-candidate mutation.

## Browser and Node load order

Changing script order is architectural. Required conceptual order:

```text
base dictionaries and bulk corpus
-> core and dictionary policy
-> lexical policy and full-corpus pattern index
-> solver and construction-v2 runtime
-> clue-feasibility estimator
-> bounded partial-state beam and replay bridge
-> construction portfolio and repair algorithms
-> editorial demand and repair algorithms
-> direct stage source anchor and runtime
-> vocabulary portfolio
-> CandidateState, telemetry and explicit pipeline
-> wrapper-retirement audit
-> renderer and UI
```

The Node benchmark bootstrap must mirror module ownership. Feature mode remains explicit in benchmark environments so historical baselines are reproducible.

## Production modules

- `core.js`: normalization, indexing, deterministic randomness and active-set selection.
- `dictionary-policy.js`: clue and lexical admission.
- `solver.js`: base construction, scoring, metrics and complete validation.
- `construction-v2.js`: indexed attempt construction and exact clue-footprint allocation.
- `construction-portfolio.js`: complete construction ranking and repair-potential frontier retention.
- `construction-stage-source-anchor-v2.js`: exact pre-wrapper production source.
- `construction-stage-runtime-v2.js`: directly ordered finalist processing and final comparison.
- `construction-vocabulary-portfolio-v1.js`: active-set portfolio and complete candidate comparison.
- `construction-candidate-state-v1.js`: explicit state contract, cloning, provenance and signatures.
- `construction-pipeline-stages-v1.js`: CandidateState stage functions.
- `construction-pipeline-telemetry-v1.js`: stage timing, candidate counts and signatures.
- `construction-pipeline-v1.js`: sole production orchestrator and rollback selector.
- `construction-wrapper-retirement-audit-v1.js`: default, ownership and rollback audit.
- `renderer.js`, `ui.js`: A5 SVG rendering, controls and export.

Check `index.html` before treating any retained research module as an active browser default.

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

The exact allocator and validator remain authoritative. `shadow` mode may observe production candidates without changing output. The rejected local `rank` policy and unpromoted `guard` policy must not be presented as accepted defaults.

Future clue-feasibility use should support an earlier bounded structural frontier, not replace measured complete-grid decisions.

## Bounded partial-state search

The retained late-placement beam preserves exact greedy replay and uses separate probe attempt IDs. It remains off by default because its accepted density gain is too expensive.

Every search replacement must preserve the baseline candidate and expose fallback ancestry. Partial estimates may guide exploration but may not replace complete final comparison.

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
5. fewer formulaic short answers;
6. lower editorial penalty;
7. lower selected-grid clue debt when measured;
8. higher existing solver score;
9. deterministic tie-breakers with exact member-zero preference.

Do not replace this boundary with an opaque weighted score.

## Feature flags and rollback

```text
SCANWORD_EXPLICIT_PIPELINE=on|off
SCANWORD_PIPELINE_STAGE_RUNTIME=explicit
SCANWORD_WRAPPER_INSTALLATION_LOCK=explicit-pipeline-v1
SCANWORD_COMPLETE_PIPELINE_FRONTIER=on|off
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=<positive integer>
SCANWORD_VOCABULARY_PORTFOLIO_MODE=full|adaptive
SCANWORD_FULL_CORPUS_RETRIEVAL=on|off
SCANWORD_FULL_CORPUS_RETRIEVAL_MODE=empty|small-poor
SCANWORD_CLUE_FEASIBILITY=off|shadow|rank|guard
SCANWORD_PARTIAL_SEARCH=off|shadow|beam
```

A/B flags must never silently rewrite locked historical evidence.

## Required checks

For frontier or direct-stage changes:

```bash
node tools/complete-pipeline-frontier-test-v1.cjs
SCANWORD_COMPLETE_PIPELINE_FRONTIER=off \
  node tools/construction-stage-runtime-test-v2.cjs
node tools/wrapper-retirement-test-v1.cjs
```

For the complete frontier acceptance boundary:

```bash
SCANWORD_FRONTIER_CONCURRENCY=4 \
SCANWORD_FRONTIER_RUNTIME_RATIO=1.35 \
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4 \
SCANWORD_FRONTIER_REQUIRE_WIN=1 \
  node tools/complete-pipeline-frontier-checkpoint-v1.cjs \
  research/baselines/seed-sets/development-20.json \
  research-output/complete-pipeline-frontier/development-20.jsonl
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
- runtime median, p95 and max where meaningful;
- examples, counterexamples and failure modes;
- workflow run, artifact ID, digest and exact evidence commit;
- promotion, rejection or deferral boundary.

Keep negative results and harness defects. Do not rewrite them out of history.

Do not tune on locked promotion or stability seeds. Use development for iteration, promotion for a frozen candidate and stability only after promotion.

## Archive and integration policy

1. Work on a short-lived branch from current `main`.
2. Run the phase gate on the exact implementation head.
3. Preserve accepted implementation with an immutable `research/archive-...` ref before documentation-only commits.
4. Update the research ledger, archive manifest, README, AGENTS and milestone.
5. Confirm browser defaults, explicit Node benchmark mode and production ownership.
6. Run exact final-head CI.
7. Squash-merge to `main`.
8. Verify the squash commit and post-merge checks.
9. Start the next investigation from updated `main`.

Only `main` should remain permanently. Archive refs are immutable evidence and are exempt from short-lived branch cleanup.

## Next architectural investigation

Move frontier retention earlier without changing accepted semantics:

```text
structural alternatives
-> cheap clue-feasibility filter
-> bounded structural frontier
-> exact clue allocation only for finalists
-> accepted complete-pipeline frontier
```

The next phase must measure exact allocation work saved and prove complete parity or a separately accepted quality improvement. Do not claim zero-panel generation or publication-ready clue prose.