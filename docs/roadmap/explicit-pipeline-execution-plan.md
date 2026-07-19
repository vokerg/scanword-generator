# Explicit Pipeline Execution Plan

Status: **active implementation runbook**  
Last audited: **2026-07-19**  
Baseline branch: `main`  
Baseline release commit at audit time: `f33233519e3e6902bf2eae9c97c4affb83ffab25`  
Current open research PR at audit time: **#10**, `r-and-d/selected-grid-editorial-quality-1.2`, head `8203dc044969afc59d00d7cb5a207d219cb71957`

This document is the canonical execution plan for continuing the scanword generator after the vocabulary-first 1.1 baseline. It is intentionally detailed enough for another coding agent to resume work without reconstructing the full repository history.

The plan must be executed **phase by phase**. Do not begin a later phase until the previous phase has met its exit gate or has been explicitly documented as a rejected experiment.

---

## 1. Executive decision

The project direction is valid, but the current orchestration has reached its architectural limit.

Keep:

- the complete structural validator;
- deterministic seeded experiments;
- the attributed bulk corpus and corpus builders;
- indexed candidate retrieval;
- panel-first complete-candidate comparison;
- exact and adaptive clue-footprint allocation;
- victim and bundle replacement ideas;
- same-geometry editorial repair;
- renderer, UI, SVG and JSON export;
- experiment ledgers, negative results and rollback controls.

Replace or retire over time:

- the chain of global `ScanwordSolver.generateBest` wrappers;
- nested whole-grid portfolio reruns;
- hard exclusion of all vocabulary outside the selected 2,500/3,500 active set;
- greedy single-state construction as the only partial-state search;
- late discovery of clue-anchor and clue-footprint infeasibility;
- branch preservation that depends on unreachable or unanchored commit objects.

The intended long-term construction path is:

```text
attributed source corpus
-> hot seed-specific working set + full-corpus pattern index
-> bounded partial-state structural search
-> cheap clue-feasibility estimation
-> bounded Pareto frontier
-> exact clue allocation for finalists
-> bounded victim/bundle replacement
-> same-geometry editorial repair
-> complete validation
-> final selection
```

No phase may weaken the complete validator or silently change browser defaults.

---

## 2. Current baseline and known evidence

### 2.1 Production baseline

Vocabulary-first 1.1 currently uses:

```text
40,966-entry attributed corpus v8
-> deterministic 2,500- and 3,500-entry working sets
-> construction and clue allocation
-> same-geometry editorial repair
-> panel-first selection
-> complete validation
```

The canonical documented 20-seed predecessor checkpoint is:

| Metric | Former dictionary + repair | Vocabulary portfolio + repair |
| --- | ---: | ---: |
| Average residual panels | 7.05 | **5.30** |
| Average answers | 44.75 | **48.45** |
| Average crossings | 47.35 | **53.00** |
| Average answer-space coverage | 93.98% | **95.53%** |
| Average formulaic short answers | 0.40 | **0.15** |
| Average browser-equivalent runtime | 10.86 s | **24.48 s** |

Do not present these numbers as a completed 50-seed result for the committed 40,966-entry v8 corpus. The repository explicitly records that longer v8 validation is unfinished.

### 2.2 Structural invariants

Every accepted grid must satisfy all of the following:

1. Every contiguous letter run of length two or more is exactly one assigned answer.
2. Every letter belongs to at least one assigned answer.
3. Every crossing letter agrees.
4. Every clue footprint resolves to a real arrow and answer start.
5. Every used answer has an admitted exact clue.
6. The answer graph has exactly one connected component.
7. There are no accidental runs, orphan letters, duplicate directional occupancy or clue conflicts.
8. Remaining unused areas are explicit panel cells, not unassigned letter cells.

The validator is the acceptance authority. Never relax it to make an experiment pass.

### 2.3 Historical progression

The branches were not equivalent competing implementations. They formed this progression:

```text
validation and split clue areas
-> one connected component and strict checkpoint selection
-> indexed candidate retrieval
-> closed-fill portfolios and repair research
-> lexical same-geometry repair
-> vocabulary-first construction
-> selected-grid clue quality research
```

Important retained findings:

- Indexed retrieval solved the dictionary-scan scaling bottleneck but not topology.
- More independent greedy restarts have diminishing returns.
- Clue cells and clue-text footprints are construction topology, not decoration.
- Selecting complete candidates after clue allocation materially improved density.
- Late local CSP often sees only impossible one- and two-cell residual islands.
- Saturated grids usually need rollback and replacement, not direct insertion.
- Atomic multi-slot moves can be valid even when intermediate single-slot states are disconnected.
- Early lexical penalties can destroy structural reachability.
- Same-geometry lexical replacement is safe and useful.
- A large corpus helps only when per-generation retrieval preserves structurally important short domains.
- Directly exposing the whole large corpus to the existing greedy sampler worsened panels and runtime.

### 2.4 Current architectural bottlenecks

The current browser path loads many modules that wrap the same global entry point. Load order is therefore part of the algorithm.

The default path also multiplies substantial work:

```text
2,500 active-set portfolio candidate
+ legacy baseline guard rerun
+ 3,500 active-set portfolio candidate
+ legacy baseline guard rerun
+ editorial repair and selection
```

This is a major contributor to the 20–25 second runtime.

The base construction still follows one greedy partial state per attempt. Independent restarts explore different basins, but they cannot retain competing local decisions inside the same attempt.

The selected active set is also a hard vocabulary boundary: an answer outside the current 2,500/3,500 entries is unavailable even if it is the only good answer matching a later constrained pattern.

---

## 3. Branch and experiment policy for this program

Each phase uses a new short-lived branch based on the latest accepted `main`.

Recommended naming:

```text
r-and-d/phase-0-research-archive
r-and-d/phase-1-selected-grid-clues
r-and-d/phase-2-baseline-lock
r-and-d/phase-3-explicit-pipeline-parity
r-and-d/phase-4-pattern-fallback
r-and-d/phase-5-clue-feasibility
r-and-d/phase-6-partial-state-search
r-and-d/phase-7-complete-pipeline-frontier
r-and-d/phase-8-repair-stage-migration
r-and-d/phase-9-wrapper-retirement
r-and-d/phase-10-editorial-clues
release/explicit-pipeline-2.0
```

For every substantive phase:

1. Create the branch from current `main`.
2. Add or update a research ledger under `research/`.
3. State the exact hypothesis, baseline, candidate, seed set and budgets before running experiments.
4. Add deterministic unit tests for new primitives.
5. Add an identical-seed paired checkpoint.
6. Record aggregate and per-seed regressions.
7. Record runtime median, p95 and maximum where sample size permits.
8. Preserve negative results.
9. Keep browser defaults unchanged until the phase is explicitly promoted.
10. Squash-merge only after the accepted boundary is documented.

Do not accumulate several unreviewed architectural phases on one long-running branch.

---

## 4. Global acceptance hierarchy

### 4.1 Mandatory validity gate

A candidate is never eligible unless it is:

- fully structurally valid;
- one connected answer component;
- exact-clue only;
- deterministic for the same seed and configuration;
- free of fallback clues and malformed corpus entries.

### 4.2 Candidate comparison hierarchy

Until a phase explicitly tests another ordering, compare eligible complete candidates in this order:

1. fewer residual panels;
2. more answers;
3. more crossings;
4. greater raw-letter coverage;
5. lower short-answer editorial penalty;
6. fewer formulaic short answers;
7. lower selected-grid clue debt;
8. higher existing solver score;
9. deterministic tie-breakers.

Partial-state search may use estimates, but final promotion decisions must use measured complete-grid metrics.

### 4.3 Long-term target gate

The long-term research target remains:

- 100/100 structurally valid grids;
- average residual panels `<= 2`;
- at least 80% zero-panel seeds;
- explicitly bounded maximum panel count;
- no more than two genuinely weak fillers per grid;
- bounded repeated formulaic short fill;
- no clue fallback;
- deterministic timeout behavior;
- median, p95 and maximum runtime reported;
- a fast production fallback preserved until the replacement is proven.

This is a target, not a claim about the current baseline.

---

# Phase 0 — Repair research preservation and repository integrity

Status: `NOT STARTED`

## Goal

Make every historically referenced experiment reproducible from a fresh clone without relying on GitHub retaining otherwise unreachable commit objects.

## Why this is first

At audit time, the repository documentation claimed that closed-fill snapshot commit:

```text
d1c12d8acca31edb3b38775db5166f4f5f59ce04
```

was anchored in `main`. However, GitHub commit comparison reported no common ancestor between that SHA and current `main`, and the documented snapshot branch was not resolvable through branch search. The commit was still directly fetchable, which means the evidence may survive only as an unreferenced GitHub object.

Treat archival preservation as broken until a fresh-clone reproduction test proves otherwise.

## Inputs

- `research/closed-fill/README.md`
- `research/closed-fill/ARCHITECTURE.md`
- `research/closed-fill/RESULTS.md`
- `research/closed-fill/EXPERIMENT_LOG.md`
- `research/closed-fill/manifest.json`
- `research/closed-fill/reproduce.sh`
- `.github/workflows/research-closed-fill.yml`
- snapshot SHA `d1c12d8acca31edb3b38775db5166f4f5f59ce04`
- historical vocabulary/lexical heads referenced in milestone and research documents

## Required implementation

1. Enumerate every commit SHA and branch name referenced by:
   - `README.md`;
   - `AGENTS.md`;
   - `docs/milestones/`;
   - `research/**`;
   - manual reproduction workflows.
2. Verify each referenced commit is fetchable from a clean clone.
3. Create durable archive refs for required historical snapshots. Prefer clearly named immutable tags or `research/archive-*` branches.
4. Update `research/closed-fill/reproduce.sh` to fetch the explicit archive ref instead of requiring the snapshot to be an ancestor of `origin/main`.
5. Update `.github/workflows/research-closed-fill.yml` to check out the durable archive ref and verify the expected SHA.
6. Correct any documentation that claims a squash-merged research commit is in `main` ancestry when it is not.
7. Add a fresh-clone smoke script or workflow that:
   - clones with shallow history;
   - fetches the archive ref explicitly;
   - checks out the exact SHA;
   - runs the deterministic smoke tests;
   - runs the seed-40 probe.
8. Record the final archive refs and SHAs in a machine-readable manifest.

## Required tests

```bash
bash research/closed-fill/reproduce.sh smoke
```

Also test from a separate newly created shallow clone, not only from an existing local repository with cached objects.

## Exit gate

- Every required historical SHA has a durable reachable ref.
- Fresh shallow clone reproduction succeeds.
- Documentation and scripts describe the actual preservation model.
- No production runtime behavior changes.

## Rollback

If an archive ref cannot be created for a historical object, immediately export the complete patch, file tree and experiment artifacts into a documented repository directory before the object is lost. Mark exact commit reproduction as unavailable rather than claiming otherwise.

## Handoff note for next agent

Do not begin solver work before this phase is green. Historical negative results are needed to avoid repeating already disproven strategies.

---

# Phase 1 — Finish selected-grid clue quality research narrowly

Status: `NOT STARTED`

## Goal

Complete PR #10 as a narrow answer-preserving clue-quality improvement, while retaining expensive alternate-grid search as a documented negative result.

## Existing branch

```text
r-and-d/selected-grid-editorial-quality-1.2
```

Existing useful files:

- `construction-vocabulary-editorial-tiebreak-v1.js`
- `construction-clue-disambiguation-v1.js`
- `tools/node-editorial-bootstrap-v1.cjs`
- `tools/vocabulary-editorial-checkpoint.cjs`
- `tools/vocabulary-editorial-tiebreak-test.cjs`
- `tools/clue-disambiguation-test.cjs`
- `research/selected-grid-editorial-quality-1.2/README.md`
- `.github/workflows/vocabulary-editorial-quality.yml`

## Known result

The final editorial tie-break produced no changed selections in the initial short run because exact ties after all structural metrics were too rare.

Extra full-grid variants were safe but low-yield and approximately doubled the relevant runtime in the initial experiment.

Repeated generic clue disambiguation was promising because it changed only clue text and preserved answers and geometry.

## Required implementation

1. Rebase or recreate the useful work on current `main` if PR #10 is stale.
2. Keep selected-grid metrics:
   - generic clue count;
   - generated clue count;
   - factual-template count;
   - proper-name count;
   - distinct categories;
   - distinct sources;
   - repeated clue count;
   - repeated clue kinds.
3. Keep clue-only repeated generic clue disambiguation behind an explicit flag.
4. Do not enable alternate full-grid editorial variant generation by default.
5. Prefer clue alternatives in this order:
   1. existing sourced factual clue alternatives;
   2. category-specific truthful metadata;
   3. compact descriptive templates;
   4. letter-pattern hints only as the last fallback.
6. Add a measurable answer-revealingness policy. At minimum, avoid exposing too much of a short answer through first/last letters and length.
7. Ensure updates are applied consistently to:
   - `result.placed`;
   - arrow-cell clue records;
   - any selected-grid summary;
   - pool entry only if mutating the shared pool is intentional and safe.
8. Render before/after samples and inspect clue-footprint fit.
9. Update the research README with the actual final seed count and evidence.

## Required experiments

Run at least 20 identical seeds. Prefer 50 before promotion.

Report:

- repeated clues before/after;
- repeated clue kinds before/after;
- clues rewritten per grid;
- answer changes;
- panel changes;
- crossing changes;
- coverage changes;
- editorial penalty changes;
- runtime delta;
- number of potentially over-revealing generated clues;
- rendered examples and counterexamples.

## Exit gate

- All selected grids remain structurally identical.
- No answer, panel, crossing, coverage or short-answer editorial regression.
- Repeated generic clues materially decrease on the full sample.
- Generated wording passes visual inspection.
- Alternate-grid search remains manual unless it demonstrates reproducible Pareto wins on a broader sample.

## Promotion decision

Merge only the metrics and the accepted clue-only cleanup. Preserve low-yield alternate-grid search as research-only code or documentation.

---

# Phase 2 — Lock the v8 baseline and benchmark protocol

Status: `NOT STARTED`

## Goal

Create an unambiguous measurement baseline for all later architectural work.

## Required implementation

1. Run the committed 40,966-entry v8 corpus through:
   - a 20-seed development checkpoint;
   - a locked 50-seed promotion checkpoint;
   - a 100-seed stability checkpoint when practical.
2. Define seed sets in committed machine-readable files. Example:

```text
research/baselines/seed-sets/development-20.json
research/baselines/seed-sets/promotion-50.json
research/baselines/seed-sets/stability-100.json
```

3. Do not tune on the locked promotion or stability sets.
4. Record environment details:
   - Node version;
   - operating system/runner;
   - concurrency;
   - every search and repack budget;
   - corpus manifest digest;
   - exact commit SHA;
   - browser-equivalent bootstrap version.
5. Add summary metrics:
   - average, median, p95 and maximum runtime;
   - panel-count distribution;
   - zero-panel rate;
   - maximum panels;
   - answers;
   - crossings;
   - active, answer-space and raw-letter coverage;
   - two-letter count;
   - formulaic short count;
   - selected-grid clue debt;
   - proper-name and category concentration;
   - fallback/failure rate;
   - validation status.
6. Save per-seed JSON Lines and aggregate JSON.
7. Add a baseline manifest that points to artifacts, digests and exact commands.

## Exit gate

- The committed v8 corpus has a reproducible baseline independent of the predecessor 39,586-entry reference.
- Seed sets and budgets are locked.
- All later phases can compare against one canonical manifest.

## No-go conditions

Do not start interpreting small density changes from later phases until this baseline is complete. A three-seed result may guide development but cannot promote architecture.

---

# Phase 3 — Introduce an explicit pipeline with behavior parity

Status: `NOT STARTED`

## Goal

Create a normal function-based pipeline over an explicit candidate state without changing accepted output quality.

This phase is architectural parity, not a density experiment.

## Proposed modules

Names may be adjusted to repository conventions, but ownership must remain explicit.

```text
construction-candidate-state-v1.js
construction-pipeline-v1.js
construction-pipeline-stages-v1.js
construction-pipeline-telemetry-v1.js
tools/construction-pipeline-parity-test.cjs
tools/construction-pipeline-checkpoint.cjs
research/explicit-pipeline/README.md
```

## Candidate state contract

```text
CandidateState
  rows
  cols
  grid
  answers
  usedAnswers
  answerGraph
  clueAnchors
  clueFootprints
  residualRegions
  sourcePool
  hotWorkingSet
  structuralMetrics
  lexicalMetrics
  clueMetrics
  provenance
  budgets
```

Use immutable, copy-on-write or explicitly cloned state transitions. Avoid hidden mutation across candidates.

## Stage contract

Every stage should be a normal function of one of these forms:

```text
CandidateState -> CandidateState
CandidateState -> CandidateState[]
CandidateState[] -> CandidateState[]
```

No new stage may globally replace `generateBest`.

## Required implementation

1. Define state cloning, signatures and provenance.
2. Wrap the existing production generator as a legacy source stage.
3. Express current operations as explicit calls in one orchestrator, initially using existing implementations:
   - base construction;
   - clue allocation;
   - current repair chain;
   - validation;
   - comparison.
4. Preserve the old browser path behind the existing flags.
5. Add a new opt-in flag such as:

```text
SCANWORD_EXPLICIT_PIPELINE=on
```

6. Add telemetry identifying every executed stage, elapsed time and candidate count.
7. Prevent research-only wrappers from installing when explicit mode is active.
8. Keep the full validator unchanged.

## Parity tests

For at least 20 development seeds:

- same validity result;
- same component count;
- same panel count;
- same answer count;
- same crossing count;
- same exact clues;
- ideally identical selected grids when no algorithm has changed;
- no more than 10% runtime regression during the temporary parity phase.

If exact output parity is impossible because of refactoring order, require metric parity and document every deterministic ordering difference.

## Exit gate

- The explicit pipeline can reproduce the current accepted baseline.
- Stage timing and candidate flow are visible.
- No production default changes.
- New algorithm phases can be implemented without another global wrapper.

---

# Phase 4 — Add two-level vocabulary retrieval

Status: `NOT STARTED`

## Goal

Keep a high-quality seed-specific hot working set while allowing constrained slots to retrieve bounded candidates from the complete corpus.

## Rationale

The active 2,500/3,500 set should be a prior, not a hard legal-domain boundary. Increasing the active set uniformly has already shown poor behavior. Full-corpus access should be demand-driven by exact slot patterns.

## Required implementation

1. Build or reuse full-corpus indexes by:
   - answer length;
   - position and letter;
   - optionally multi-fixed-letter signatures or intersected buckets.
2. Preserve the hot working set selection for normal unconstrained growth.
3. Add an on-demand fallback when:
   - the hot-set domain is empty;
   - the hot-set domain is below a small threshold;
   - all hot-set candidates are editorially poor;
   - a replacement search needs a constrained pattern unavailable in the hot set.
4. Rank full-corpus results by:
   - lexical quality;
   - clue quality and clue kind;
   - familiarity/frequency where available;
   - proper-name load;
   - source quality;
   - category balance;
   - duplicate/repetition risk;
   - structural value.
5. Bound the returned fallback domain.
6. Add telemetry:
   - hot lookups;
   - fallback lookups;
   - full-corpus checks;
   - empty-domain rescues;
   - selected fallback answers;
   - category and source distribution;
   - runtime cost.
7. Ensure fallback results still pass the same dictionary admission policy and exact-clue requirement.

## Tests

- Unit tests for pattern intersection and deterministic ranking.
- Tests proving no malformed or blocked entry can enter through fallback.
- Fixtures where the hot set has an empty domain but the full corpus has a valid answer.
- Duplicate-answer and used-answer exclusion tests.

## Experiments

Compare on development seeds:

1. current hard active set;
2. hot set plus fallback only for empty domains;
3. hot set plus fallback for low-quality/small domains.

Measure density, lexical quality and lookup cost separately.

## Exit gate

- Empty or poor constrained domains are measurably rescued.
- No structural validity regression.
- Runtime growth is bounded and explained.
- Full-pool uniform sampling is not reintroduced.

---

# Phase 5 — Add cheap clue-feasibility estimation during construction

Status: `NOT STARTED`

## Goal

Detect partial states likely to become impossible after clue allocation before they consume most of the search budget.

## Required estimates

For each partial state, estimate at least:

- whether every answer has at least one legal clue anchor;
- local clue-footprint domain size;
- aggregate free panel capacity for clue text;
- overlap pressure between high-demand clue regions;
- likely creation of isolated one-cell panels;
- number and size of residual panel regions;
- whether long clues have any plausible footprint;
- whether adding a placement destroys all footprint options for an existing clue.

## Implementation guidance

Do not run the full exact clue allocator at every partial node.

Use cheap necessary conditions and bounded approximations:

- anchor-domain counting;
- local footprint candidate counts;
- region-capacity lower bounds;
- overlap graphs;
- incremental island-risk updates;
- cached footprint templates by local geometry.

## Calibration

For a sample of partial and complete states:

1. record the estimator result;
2. run the real clue allocator;
3. measure false-positive and false-negative rates;
4. tune only on development seeds.

A false negative that prunes a state capable of producing a strong final grid is more dangerous than a false positive that merely keeps extra work.

## Exit gate

- The estimator rejects clearly impossible states with low false-negative risk.
- Exact clue allocation success becomes more predictable.
- Runtime saved or downstream candidate quality improved on development seeds.
- Estimator telemetry is available per state and per selected grid.

---

# Phase 6 — Replace independent greedy restarts with bounded partial-state search

Status: `NOT STARTED`

## Goal

Retain competing local topology decisions before they become irreversible.

## Candidate algorithms

Implement one bounded deterministic approach first:

- beam search;
- limited discrepancy search;
- best-first search with strict node limits;
- or a hybrid beam over selected placement depths.

Do not implement several search families simultaneously.

## Partial-state ranking features

Use explicit features rather than one opaque score where possible:

- current answer count;
- current crossings;
- new-letter efficiency;
- legal future crossing opportunities;
- constrained-domain entropy;
- rare-pattern risk;
- clue-anchor capacity;
- clue-footprint pressure;
- residual-island risk;
- connectivity risk;
- lexical debt;
- repeated short-fill risk;
- estimated remaining runtime cost.

## Dominance and deduplication

1. Define a structural state signature.
2. Deduplicate equivalent answer/geometry states.
3. Retain non-dominated or best-ranked states per depth/signature bucket.
4. Keep deterministic tie-breakers.
5. Record why each state was pruned.

## Budget controls

Expose explicit limits:

```text
beam width
branching factor
maximum nodes
maximum depth or placement count
time budget
fallback threshold
```

Timeout behavior must be deterministic and must return the best fully valid candidate or the old production fallback.

## Experiments

Compare:

1. current 240 independent greedy attempts;
2. fewer base attempts plus bounded beam;
3. equivalent runtime budget comparison;
4. equivalent node/check budget comparison.

Measure whether the new search reduces isolated panels and improves exact clue-allocation success, not only aggregate score.

## Exit gate

- 100% validity on the development set.
- No material lexical regression.
- A reproducible density improvement or equivalent density at materially lower runtime.
- Search telemetry demonstrates that retained alternatives, not merely extra work, produced the gain.

## Rejection condition

If the beam behaves like a more expensive restart portfolio without improving topology classes, document the negative result and revisit state features or discrepancy points before increasing width.

---

# Phase 7 — Retain a complete-pipeline Pareto frontier

Status: `NOT STARTED`

## Goal

Avoid deleting promising candidates before clue allocation, replacement and editorial repair reveal their final trade-offs.

## Frontier dimensions

At minimum, track:

```text
residual panels
weak/editorial fill
raw letter cells
answer count
crossings
clue area
clue feasibility
selected-grid clue debt
runtime cost
```

## Required implementation

1. Maintain a bounded non-dominated frontier after structural search.
2. Run exact clue allocation only on finalists.
3. Apply bounded repair to frontier finalists, not only the single panel-minimum candidate.
4. Apply same-geometry editorial repair before final promotion comparison.
5. Select only after the complete pipeline.
6. Record candidate provenance through every stage.
7. Add frontier size and dominance telemetry.

## Important historical constraint

A prior lexical Pareto experiment selected candidates before downstream stages and later suffered panel regressions. This phase must compare **complete pipeline outputs**, not pre-repair candidates alone.

## Exit gate

- The frontier finds reproducible complete-grid wins that single lexicographic early selection misses.
- Frontier size remains bounded.
- Runtime cost is justified by measured wins.
- No hidden weighted score replaces the documented final hierarchy.

---

# Phase 8 — Migrate successful repair algorithms into explicit stages

Status: `NOT STARTED`

## Goal

Reuse proven closed-fill and lexical repair ideas without preserving wrapper orchestration.

## Algorithms worth migrating

Structural/clue stages:

- exact clue repack;
- adaptive clue repack;
- clue tail absorption/reflow where still useful;
- boundary victim replacement;
- depth-two victim replacement;
- atomic disjoint pair replacement;
- targeted exact replacement;
- rollback-aware joint crossing replacement.

Editorial stages:

- exact same-pattern replacement;
- crossing-pair refit;
- radius-two component CSP;
- demand-driven repair lexicon extension.

## Required migration rules

1. Every algorithm consumes and returns explicit `CandidateState` values.
2. No migrated module wraps `generateBest`.
3. Every stage declares:
   - preconditions;
   - invariants preserved;
   - node/time budget;
   - accepted metric hierarchy;
   - telemetry schema.
4. Intermediate disconnected states are allowed only inside an atomic operation and may never escape as accepted candidates.
5. Complete validation runs after each accepted atomic replacement.
6. Preserve baseline fallback until parity is proven.
7. Delete or disable migrated legacy wrappers only after equivalent tests exist.

## Exit gate

- Migrated stages reproduce or improve the best historical measured behavior.
- Stage-level runtime attribution is possible.
- No duplicate old and new active implementation remains in browser load order.

---

# Phase 9 — Retire wrapper chain and duplicated full-grid execution

Status: `NOT STARTED`

## Goal

Make the explicit pipeline the single understandable construction path and remove repeated whole-grid work.

## Required work

1. Map every current wrapper and its feature flag.
2. Identify which wrappers are:
   - active production behavior;
   - research-only;
   - superseded;
   - dead compatibility code.
3. Replace `construction-guard.js` duplicated whole-generation comparison with:
   - phase-level fallback;
   - or one explicit legacy candidate evaluated inside the same orchestrator only when required.
4. Remove nested portfolio multiplication.
5. Consolidate browser and Node load order.
6. Update `index.html`, `AGENTS.md`, README and milestone documentation.
7. Keep explicit rollback flags for one release cycle.
8. Add a load-order test proving browser and Node use the same production stages.
9. Report runtime by stage and compare with the v8 baseline manifest.

## Exit gate

- One explicit production orchestration path.
- No global wrapper ambiguity.
- Browser-equivalent and Node-equivalent output.
- Material runtime reduction or a clearly justified density trade-off.
- Legacy fallback remains available behind an explicit flag until release promotion.

---

# Phase 10 — Build a real selected-grid clue editorial pipeline

Status: `NOT STARTED`

## Goal

Move from truthful but generic clue templates toward publication-quality selected-grid clue prose without coupling editorial work to structural search unnecessarily.

## Data model

Support multiple clue candidates per answer with metadata:

```text
text
source
license
clue kind
factual fields used
difficulty
length/footprint demand
answer-revealingness
generic-template flag
generated-template flag
review status
```

## Selection objectives

For a completed grid, choose clues to reduce:

- repeated wording;
- generic proper-name clues;
- answer-revealing hints;
- excessive clue length for available footprint;
- subject/category monotony;
- source monotony;
- awkward generated prose.

Preserve truthfulness and exact answer mapping.

## Required implementation

1. Generate or import richer factual alternatives where source metadata supports them.
2. Keep category labels only as fallback.
3. Add clue-footprint fit estimates.
4. Add repeated-phrase detection beyond exact string equality.
5. Add deterministic per-grid clue selection.
6. Produce a human-review report listing every generated or generic clue in selected grids.
7. Keep structural geometry unchanged unless a separately documented joint clue/topology experiment is run.

## Exit gate

- Repeated and generic clues decrease on locked seeds.
- No increase in invalid or misleading clues.
- Rendered samples pass manual review.
- Every generated clue remains traceable to source facts or an explicit fallback rule.

---

# Phase 11 — Release promotion and long-run validation

Status: `NOT STARTED`

## Goal

Promote the explicit pipeline only after structural, density, lexical, editorial and runtime dimensions are all documented.

## Required release runs

- development set for diagnostics;
- locked 50-seed promotion set;
- 100-seed stability set;
- targeted difficult-tail set;
- browser smoke rendering;
- fresh-clone corpus and historical reproduction checks.

## Required release report

Include:

- exact commit and corpus digest;
- browser flags and script order;
- stage budgets;
- structural validity rate;
- panel distribution and zero-panel rate;
- answer/crossing/coverage metrics;
- lexical metrics;
- clue metrics;
- fallback rate;
- median, p95 and maximum runtime;
- per-seed regressions;
- rendered representative and worst-case examples;
- known debt;
- rollback procedure.

## Promotion rule

Do not promote solely because average panels improve.

All three primary dimensions must be acceptable:

1. structural validity;
2. coverage/density;
3. lexical and clue quality.

Runtime and maintainability are independent release constraints, not optional notes.

---

## 5. Work that should not be repeated as a primary strategy

Do not restart the following without new evidence that changes the original failure mode:

- blindly increasing independent restarts;
- directly exposing the entire corpus to the current occurrence sampler;
- uniformly increasing the active set to 5,000–10,000;
- adding broad vocabulary without pattern-demand telemetry;
- applying strong lexical penalties during early greedy growth;
- selecting lexical Pareto candidates before downstream clue and repair stages;
- post-layout local CSP over already fragmented singleton regions;
- straight insertion into saturated grids;
- direct isolated-cross search based only on visual adjacency;
- composing rollback with an algorithm whose preconditions rollback destroys;
- extra full-grid generation only for a late editorial tie-break;
- increasing CSP node limits when telemetry shows empty/incompatible domains rather than node exhaustion;
- adding another global `generateBest` wrapper.

Negative results belong in `research/`; do not delete them to make the history look cleaner.

---

## 6. Module ownership map

### Source corpus and admission

- `bulk-lexicon-runtime.js`
- `bulk-lexicon/`
- `tools/build-bulk-lexicon-v8.py`
- `dictionary-policy.js`
- `core.js`

### Base construction and validation

- `solver.js`
- `construction-v2.js`
- `construction-portfolio.js`
- `construction-guard.js`

### Structural and clue repair research

- `closed-fill.js`
- `closed-fill-rollback.js`
- `construction-clue-*.js`
- `construction-victim*.js`
- `construction-polish.js`

### Editorial repair

- `editorial-lexical-policy-v3.js`
- `editorial-demand-*.js`
- `construction-editorial-replace-v3.js`
- `construction-editorial-pair-refit-v3.js`
- `construction-editorial-bundle-refit-v3.js`
- `construction-editorial-repair-v3.js`

### Vocabulary portfolio

- `construction-vocabulary-portfolio-v1.js`

### Current clue-quality research

- `construction-vocabulary-editorial-tiebreak-v1.js`
- `construction-clue-disambiguation-v1.js`

### Entry points and presentation

- `index.html`
- `renderer.js`
- `ui.js`

Before changing a module, verify whether it is actually loaded by `index.html` and whether a later wrapper replaces its entry point.

---

## 7. Required command inventory

Baseline corpus checks:

```bash
node tools/bulk-lexicon-audit.cjs
node tools/dictionary-count-v3.cjs
```

Canonical browser-equivalent release checkpoint:

```bash
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/vocabulary-release-checkpoint.cjs 20
```

Adaptive checkpoint:

```bash
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/vocabulary-adaptive-checkpoint.cjs 20
```

Current selected-grid editorial checkpoint:

```bash
NODE_OPTIONS="--require=./tools/node-benchmark-bootstrap-v1.cjs --require=./tools/node-editorial-bootstrap-v1.cjs" \
  node tools/vocabulary-editorial-checkpoint.cjs 20
```

Closed-fill historical reproduction after Phase 0 repair:

```bash
bash research/closed-fill/reproduce.sh smoke
bash research/closed-fill/reproduce.sh tail
bash research/closed-fill/reproduce.sh full
```

Every changed JavaScript or CommonJS file must pass `node --check`. Every bounded algorithm must have a deterministic primitive test and a real generation checkpoint.

---

## 8. Standard phase report template

Every phase research README should contain:

```text
Status
Date
Branch and head SHA
Question
Hypothesis
Baseline mode
Candidate mode
Corpus version and digest
Seed set
Environment and budgets
Acceptance criteria
Implementation summary
Aggregate results
Per-seed regressions
Runtime median/p95/max
Examples
Counterexamples
Failure modes
Decision
Promotion or rejection boundary
Reproduction commands
Workflow run IDs
Artifact IDs and digests
```

Do not publish a conclusion from aggregate averages without per-seed regressions.

---

## 9. Progress tracker

Update this table after each accepted or rejected phase.

| Phase | Status | Branch/PR | Decision | Evidence |
| --- | --- | --- | --- | --- |
| 0. Research preservation | Not started | — | — | — |
| 1. Selected-grid clue quality | Not started | PR #10 | — | — |
| 2. v8 baseline lock | Not started | — | — | — |
| 3. Explicit pipeline parity | Not started | — | — | — |
| 4. Full-corpus pattern fallback | Not started | — | — | — |
| 5. Clue-feasibility estimator | Not started | — | — | — |
| 6. Partial-state search | Not started | — | — | — |
| 7. Complete-pipeline frontier | Not started | — | — | — |
| 8. Repair-stage migration | Not started | — | — | — |
| 9. Wrapper retirement | Not started | — | — | — |
| 10. Editorial clue pipeline | Not started | — | — | — |
| 11. Release validation | Not started | — | — | — |

Allowed status values:

```text
NOT STARTED
IN PROGRESS
BLOCKED
REJECTED WITH EVIDENCE
ACCEPTED RESEARCH
MERGED TO MAIN
```

---

## 10. Immediate next action

The next coding agent should execute **Phase 0 only**.

Initial checklist:

- [ ] Create `r-and-d/phase-0-research-archive` from current `main`.
- [ ] Search all repository Markdown, JSON, shell and workflow files for 40-character SHAs and historical branch names.
- [ ] Build a table of referenced object -> current reachability -> required archive ref.
- [ ] Create durable refs for required snapshots.
- [ ] Fix `research/closed-fill/reproduce.sh` so it fetches the archive ref explicitly.
- [ ] Fix `.github/workflows/research-closed-fill.yml` accordingly.
- [ ] Add a fresh shallow-clone smoke test.
- [ ] Update preservation documentation and manifest.
- [ ] Run the smoke reproduction.
- [ ] Open a draft PR with exact evidence.
- [ ] Do not modify solver behavior in the Phase 0 PR.

When Phase 0 is merged, update this document’s progress table and begin Phase 1 from the new `main`.

---

## 11. Handoff summary for another coding agent

The current generator is a valid and measured draft. The vocabulary-first pivot was correct, but the next density frontier requires search architecture changes, not more wrappers or a larger uniformly sampled active set.

The most important constraints are:

- never weaken the validator;
- preserve deterministic identical-seed A/B comparisons;
- model clue feasibility before topology is fixed;
- retain multiple partial states rather than only independent greedy restarts;
- use the full corpus through bounded pattern fallback;
- compare candidates after the complete pipeline;
- migrate proven repair algorithms into explicit stages;
- keep browser defaults unchanged until a phase is promoted;
- preserve negative results and exact historical evidence;
- execute this plan sequentially, starting with repository preservation.
