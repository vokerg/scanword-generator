# Phase 3 — Explicit construction pipeline parity

Status: **ACCEPTED**  
Date: **2026-07-20**  
Branch: `r-and-d/phase-3-explicit-pipeline`  
Base: Phase 2 squash merge `00cdba3c47433cef67b847fe575261324961188c`  
Accepted evidence head: `4c3a72ea4b14a9b57ab9acaa526900b9a2b45047`

The accepted evidence head is preserved by:

```text
refs/heads/research/archive-phase-3-explicit-pipeline-evidence-2026-07-20
```

## Question

Can the accepted vocabulary-first 1.1 generator run behind a normal, inspectable pipeline over an explicit candidate-state contract without changing any selected grid, answer, clue, structural metric or production default?

## Decision

Yes. The opt-in explicit pipeline reproduced the complete accepted production output exactly on all 20 locked development seeds. The candidate introduces no density or editorial change and remains disabled by default in the browser.

The complete accepted production generator is invoked once through the `legacy-source` stage. Phase 3 then materializes a `CandidateState`, observes the existing construction, clue-allocation and repair boundaries, reruns the unchanged complete metric validator, performs an explicit comparison stage and attaches stage telemetry.

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

## Parity protocol

The locked Phase 2 `development-20` seeds were used. Promotion and stability sets were intentionally untouched because Phase 3 changes architecture only and achieved exact output parity on the complete development gate.

Each isolated legacy and explicit process pair was compared on:

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

All six pipeline stages also had to execute successfully. Aggregate explicit runtime was required to remain at or below 110% of the identical-seed legacy runtime.

## Accepted evidence

```text
commit:          4c3a72ea4b14a9b57ab9acaa526900b9a2b45047
workflow run:    29753475790
artifact ID:     8465887053
artifact digest: sha256:acde86884e02efbfcfe5de25d7beb0164f19d7fdc26ecd54f18b995f5d78de82
```

Artifact payload digests:

```text
development-parity.jsonl  sha256:ad7020f82161d8c220171e1cd8f76e4b0b8d826ffedc20dd3cb06983ec1c9c48
console.jsonl             sha256:a2bccfa2bec161eeb866fc22bd331f085a01ed9e63e72f55593c2af2ae9024b7
```

Aggregate result:

```text
requested seeds:      20
passed seeds:         20
mismatches:           0
exact parity rate:    100%
legacy runtime:       519631 ms
explicit runtime:     519161 ms
runtime ratio:        0.9991
maximum allowed:      1.1000
runtime gate:         passed
```

Every seed was valid, connected, exact-clue only, and identical between legacy and explicit modes on all four content digests and all structural metrics.

## Commands

```bash
node tools/construction-pipeline-parity-test.cjs

SCANWORD_PIPELINE_CONCURRENCY=2 \
  node tools/construction-pipeline-checkpoint.cjs \
  20 research-output/explicit-pipeline/development-parity.jsonl
```

## Accepted boundary and remaining debt

Phase 3 makes candidate state, stage order, elapsed time, candidate flow, signatures and validation visible without changing production output. It does not yet decompose the historical internal wrapper chain into independent algorithms. The `legacy-source` stage remains the temporary compatibility boundary.

Phase 4 should add two-level vocabulary retrieval as a normal explicit-pipeline capability. It must use the locked development set for iteration and preserve the Phase 2 promotion and stability sets for frozen candidates only.
