# Phase 3 — Explicit construction pipeline parity

Status: **IN PROGRESS**  
Branch: `r-and-d/phase-3-explicit-pipeline`  
Base: Phase 2 squash merge `00cdba3c47433cef67b847fe575261324961188c`

## Question

Can the accepted vocabulary-first 1.1 generator run behind a normal, inspectable pipeline over an explicit candidate-state contract without changing any selected grid, answer, clue, structural metric or production default?

## Scope

This is an architectural parity phase. It is not a density or editorial-quality experiment.

The complete accepted production generator remains the source of truth and is invoked once through the `legacy-source` stage. Phase 3 then materializes a `CandidateState`, observes the existing construction, clue-allocation and repair boundaries, reruns the unchanged complete metric validator, performs an explicit comparison stage and attaches stage telemetry.

The existing algorithms remain inside the legacy source during this phase. This is deliberate: migrating individual internal wrappers while simultaneously proving parity would confound architecture changes with algorithm changes. Later phases can replace or insert normal pipeline stages without adding another outer `generateBest` wrapper.

## Modules

```text
construction-candidate-state-v1.js
construction-pipeline-telemetry-v1.js
construction-pipeline-stages-v1.js
construction-pipeline-v1.js
tools/construction-pipeline-parity-test.cjs
tools/construction-pipeline-seed-v1.cjs
tools/construction-pipeline-checkpoint.cjs
```

## CandidateState contract

The committed contract exposes:

```text
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
result
```

Transitions return a new top-level state and append provenance rather than mutating the prior candidate state. The legacy result is retained explicitly so parity mode can return the accepted browser-compatible shape.

## Stage contract

The parity orchestrator executes:

```text
legacy-source
-> base-construction
-> clue-allocation
-> current-repair-chain
-> validation
-> comparison
```

The first stage owns the current production wrapper chain. The three middle stages are explicit contract observations in Phase 3; they verify that the legacy source produced the required answer, clue and repair structures. Validation calls the unchanged `ScanwordSolver.resultMetrics`. Comparison is an identity selection over the one accepted legacy candidate. Candidate counts, elapsed time and signatures are recorded for every stage.

## Feature flag and default

```text
SCANWORD_EXPLICIT_PIPELINE=on
```

The browser commits the flag as `off`. With the flag disabled, the wrapper delegates directly to the captured production generator and attaches no pipeline metadata. No corpus, solver budget, validator, selection hierarchy or browser default changes in this phase.

The canonical Node bootstrap blocks the two known research-only benchmark wrappers and records `SCANWORD_WRAPPER_INSTALLATION_LOCK=explicit-pipeline-v1` when explicit mode is loaded.

## Parity gate

The locked Phase 2 `development-20` seeds are used. Promotion and stability sets remain untouched.

For each seed, isolated legacy and explicit processes must match exactly on:

- complete validity;
- component count;
- panel count;
- answer count;
- crossing count;
- exact-clue status;
- normalized full-grid digest;
- normalized placed-answer digest;
- clue digest;
- geometry digest.

All six pipeline stages must execute successfully. Aggregate explicit runtime must remain at or below 110% of the identical-seed legacy runtime.

## Commands

```bash
node tools/construction-pipeline-parity-test.cjs

SCANWORD_PIPELINE_CONCURRENCY=2 \
  node tools/construction-pipeline-checkpoint.cjs \
  20 research-output/explicit-pipeline/development-parity.jsonl
```

## Acceptance record

Pending exact-head CI evidence. Record the candidate commit, workflow run, artifact ID, artifact digest, exact parity rate and runtime ratio before promotion.
