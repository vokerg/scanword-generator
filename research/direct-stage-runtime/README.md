# Phase 8 — direct explicit stage runtime

## Decision

Phase 8 accepts a direct, explicitly ordered production stage runtime behind `SCANWORD_EXPLICIT_PIPELINE=on`.

The browser default remains unchanged during this phase:

```text
SCANWORD_EXPLICIT_PIPELINE=off
```

When explicit mode is enabled, production generation no longer calls the complete cumulative wrapper chain as its source. It invokes the vocabulary portfolio with `SCANWORD_PIPELINE_STAGE_RUNTIME=explicit`, and every active-set candidate is produced by `construction-stage-runtime-v2.js`.

The historical wrapper chain remains available only through:

```text
SCANWORD_EXPLICIT_PIPELINE=off
```

Phase 9 promotes the accepted direct orchestrator to the default and formalizes the wrapper chain as rollback-only behavior.

## Direct single-candidate sequence

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

`construction-stage-source-anchor-v2.js` captures the exact pre-portfolio source before any historical outer wrapper is installed.

`construction-stage-runtime-v2.js` calls the exported algorithms directly in the order above. It does not install another `generateBest` wrapper.

`construction-vocabulary-portfolio-v1.js` chooses the direct single-candidate generator only when:

```text
SCANWORD_PIPELINE_STAGE_RUNTIME=explicit
```

`construction-pipeline-v1.js` is the sole opt-in orchestrator. Its source stage is now `production-stage-source`, owned by `direct-production-stage-runtime-v2`. The former `legacy-source` compatibility boundary is removed from explicit execution.

## State and fallback rules

- The complete vocabulary portfolio still evaluates the configured active-set limits.
- The same construction attempts, random seeds, clue restart budgets and repair thresholds are used.
- Targeted-victim candidates pass the unchanged complete checkpoint.
- The baseline guard uses the exact pre-portfolio source under `SCANWORD_CONSTRUCTION_MODE=legacy`.
- Editorial repair remains the final single-candidate stage.
- Any direct-stage exception preserves the incoming candidate and records the stage error.
- `SCANWORD_EXPLICIT_PIPELINE=off` delegates to the unchanged cumulative wrapper chain.

## Accepted evidence

```text
accepted implementation: 76f4cb8cbeee14b111e678e5646ccf3983a3d5d6
archive ref:             refs/heads/research/archive-phase-8-direct-stage-runtime-evidence-2026-07-23
workflow run:            30012296202
artifact ID:             8566057042
artifact digest:         sha256:3d72ff4ac071e7287161dc96198502b6d6e25ca30bd301ba1266dd9ff2bd30ec
parity evidence digest:  sha256:03388ab4b7393b39cb325af897e111ec402c86ba86002d2f38fd0346497033a6
console digest:          sha256:022f4fa7f4528e933ae85c77cb93ec53a4cd5aa34e8866dc6a038668e5d45af2
```

Only the locked Phase 2 `development-20` set was used.

## Development-20 result

| metric | result |
| --- | ---: |
| completed pairs | 20/20 |
| exact grid digest parity | 20/20 |
| exact placed-answer digest parity | 20/20 |
| exact clue digest parity | 20/20 |
| exact geometry digest parity | 20/20 |
| validity/connectivity parity | 20/20 |
| panel/answer/crossing parity | 20/20 |
| mismatches | 0 |
| wrapper-chain runtime | 520.338 s |
| direct-stage runtime | 519.457 s |
| runtime ratio | **0.9983** |

Every explicit result reported:

```text
executionOwner=direct-production-stage-runtime-v2
```

and the explicit stage contract:

```text
production-stage-source
-> base-construction
-> clue-allocation
-> current-repair-chain
-> validation
-> comparison
```

The observed middle stages remain CandidateState contract audits around the complete direct production result. Output-changing ownership is now inside the direct single-candidate runtime and vocabulary portfolio, not inside `legacy-source`.

## Deterministic contracts

`tools/construction-stage-runtime-test-v2.cjs` verifies the exact direct single-candidate stage order and confirms that the source anchor is installed.

`tools/construction-pipeline-parity-test.cjs` verifies that:

- explicit mode calls the direct vocabulary source exactly once;
- the captured legacy complete generator is not called in explicit mode;
- rollback mode still calls the legacy chain;
- the explicit execution owner and source stage are correct;
- CandidateState copy-on-write and signatures remain valid.

## Reproduction

```bash
node tools/construction-stage-runtime-test-v2.cjs
node tools/construction-pipeline-parity-test.cjs

SCANWORD_PIPELINE_CONCURRENCY=2 \
SCANWORD_PIPELINE_RUNTIME_RATIO=1.10 \
  node tools/construction-pipeline-checkpoint.cjs \
  20 research-output/direct-stage-runtime/development-parity.jsonl
```

## Remaining boundary

Phase 8 proves that direct stage execution is behaviorally identical and cost-neutral. It does not change browser defaults. Phase 9 promotes the explicit orchestrator, records the cumulative wrapper chain as rollback-only, validates promotion and stability sets, and completes the migration documentation.
