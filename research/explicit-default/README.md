# Phase 9 — explicit pipeline default and wrapper retirement

## Decision

Phase 9 accepts the direct explicit orchestrator as the canonical browser and Node production owner.

The production defaults are:

```text
SCANWORD_EXPLICIT_PIPELINE=on
SCANWORD_PIPELINE_STAGE_RUNTIME=explicit
SCANWORD_WRAPPER_INSTALLATION_LOCK=explicit-pipeline-v1
```

The historical cumulative `generateBest` wrapper chain is retained only as an explicit rollback path:

```text
SCANWORD_EXPLICIT_PIPELINE=off
```

Rollback changes execution selection, not installation ownership. The explicit pipeline remains the sole installed `generateBest` owner, while `legacyGenerateBestV1` preserves the historical complete chain as a callable rollback source.

## Accepted implementation

```text
accepted implementation: f77be9fed8223925819830fad6956f1018717bbb
archive ref:             refs/heads/research/archive-phase-9-explicit-default-evidence-2026-07-23
workflow run:            30021580067
```

Artifacts:

| seed set | artifact ID | digest |
| --- | ---: | --- |
| development-20 | 8569741999 | `sha256:cfca01bf610f82f423ac6a80de435a87c12a02fd63a32d5e6aa320564ae12bf0` |
| promotion-50 | 8570088676 | `sha256:6d69354993cc61e872f01eef3ff7908d75c3a33a996a48aa69f2cbfab263dfd8` |
| stability-100 | 8570371023 | `sha256:f73bb804d69fb585d0d1290298451494f9be2b41e9db3fd2c50331242033caa6` |

The archive ref preserves the exact output-changing implementation before documentation-only commits.

## Production ownership contract

After initialization:

```text
active generateBest owner: construction-pipeline-v1
execution owner:            direct-production-stage-runtime-v2
rollback owner:             legacy-wrapper-chain
installation lock:          explicit-pipeline-v1
```

The explicit CandidateState contract remains:

```text
production-stage-source
-> base-construction
-> clue-allocation
-> current-repair-chain
-> validation
-> comparison
```

`production-stage-source` invokes the directly ordered production runtime established in Phase 8. No later historical wrapper may replace the explicit orchestrator.

The direct single-candidate production sequence remains:

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

## Exact parity evidence

| metric | development-20 | promotion-50 | stability-100 |
| --- | ---: | ---: | ---: |
| completed pairs | 20/20 | 50/50 | 100/100 |
| failures | 0 | 0 | 0 |
| exact grid parity | 100% | 100% | 100% |
| exact placed-answer parity | 100% | 100% | 100% |
| exact clue parity | 100% | 100% | 100% |
| exact geometry parity | 100% | 100% | 100% |
| validity/connectivity parity | 100% | 100% | 100% |
| exact-clue parity | 100% | 100% | 100% |
| rollback runtime | 943.300 s | 2,225.838 s | 3,297.496 s |
| explicit runtime | 914.239 s | 2,192.462 s | 3,269.376 s |
| aggregate runtime ratio | **0.9692** | **0.9850** | **0.9915** |
| runtime gate | pass | pass | pass |

The maximum accepted aggregate runtime ratio was 1.10. The candidate passed all three locked sets without output differences.

## Deterministic checks

`tools/wrapper-retirement-test-v1.cjs` verifies:

- explicit mode is the browser and Node default;
- `construction-pipeline-v1` is the active `generateBest` owner;
- `direct-production-stage-runtime-v2` owns source execution;
- the source anchor and direct runtime are installed;
- the legacy complete chain remains callable for rollback;
- the explicit installation lock is preserved in both default and rollback modes.

`tools/explicit-default-parity-checkpoint-v1.cjs` executes each seed twice in isolated processes, once with `SCANWORD_EXPLICIT_PIPELINE=off` and once with it `on`, then compares complete output digests and structural metrics.

## Browser and Node defaults

`index.html`, `tools/node-benchmark-bootstrap-v1.cjs`, the locked Phase 2 config and the seed runner all resolve absent values to the explicit defaults. Research flags remain off unless separately enabled:

```text
SCANWORD_FULL_CORPUS_RETRIEVAL=off
SCANWORD_CLUE_FEASIBILITY=off
SCANWORD_PARTIAL_SEARCH=off
```

The default grid quality is intentionally unchanged. Phase 9 is an ownership and orchestration promotion, not a density or editorial algorithm change.

## Reproduction

```bash
node tools/wrapper-retirement-test-v1.cjs
node tools/construction-stage-runtime-test-v2.cjs
SCANWORD_EXPLICIT_PIPELINE=off node tools/construction-pipeline-parity-test.cjs

node tools/explicit-default-parity-checkpoint-v1.cjs \
  research/baselines/seed-sets/development-20.json \
  research-output/explicit-default/development-20.jsonl

node tools/explicit-default-parity-checkpoint-v1.cjs \
  research/baselines/seed-sets/promotion-50.json \
  research-output/explicit-default/promotion-50.jsonl

node tools/explicit-default-parity-checkpoint-v1.cjs \
  research/baselines/seed-sets/stability-100.json \
  research-output/explicit-default/stability-100.jsonl
```

## Remaining boundary

Phase 9 retires wrapper ownership, but it does not claim that every historical repair implementation has been rewritten internally as a pure CandidateState transformation. The directly ordered runtime is now the sole production source and provides the stable boundary for that later cleanup.

The original roadmap's complete-pipeline Pareto-frontier investigation was deferred while Phases 7–9 completed search-budget calibration and orchestration migration. The next density investigation should return to that deferred frontier before broad release claims. Selected-grid clue editorial work remains a separate subsequent phase.
