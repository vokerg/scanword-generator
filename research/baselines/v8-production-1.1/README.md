# Phase 2 — Locked v8 production baseline

Status: **ACCEPTED**  
Date: **2026-07-19**  
Branch: `r-and-d/phase-2-baseline-lock`  
Base: Phase 1 merge `87dc59c1b47bcee9846bb1f8243f552fd5d2038b`  
Accepted evidence head: `3590819c6aad7e8b8178b5106dcb15b61722e8a0`

The evidence head is preserved by:

```text
refs/heads/research/archive-phase-2-baseline-evidence-2026-07-19
```

## Goal

Create one reproducible measurement baseline for every later architectural phase using the committed 40,966-entry v8 corpus and the browser-equivalent vocabulary-first 1.1 path.

This phase changes benchmark infrastructure only. It does not change solver behavior or browser defaults.

## Locked inputs

Configuration:

```text
research/baselines/v8-production-1.1/config.json
```

Seed sets:

```text
research/baselines/seed-sets/development-20.json
research/baselines/seed-sets/promotion-50.json
research/baselines/seed-sets/stability-100.json
```

The three sets are explicit, immutable and disjoint.

- `development-20` may be used for ordinary iteration after Phase 2.
- `promotion-50` is reserved for promotion decisions.
- `stability-100` is reserved for broader stability checks.
- Later phases must not tune against promotion or stability results.

## Browser-equivalent execution

Each seed runs through:

```text
tools/node-benchmark-bootstrap-v1.cjs
-> tools/node-baseline-bootstrap-v1.cjs
-> tools/benchmark-seed-v3.cjs
```

The production bootstrap loads the committed browser path, including the full v8 corpus and the 2,500/3,500 active-set portfolio. The baseline bootstrap adds selected-grid metrics only; clue disambiguation remains off.

The exact flags and every search/repack budget are committed in `config.json`.

Accepted environment:

- Node `v22.23.1`;
- Linux x64 GitHub-hosted runner;
- benchmark concurrency `2`;
- corpus version `8`, entries `40,966`;
- corpus manifest digest `sha256:10f84f4ba9e06704f213106851d8d5ee48183b1a3dd744604d9be7a5c347c892`;
- configuration digest `sha256:3ea1f06d13e80f9c3d00a338fee54ee8389f84a76b7745e276105c8c6b4ebdb7`.

## Output contract

For each set, `tools/v8-baseline-checkpoint.cjs` writes:

```text
per-seed.jsonl
aggregate.json
environment.json
run-manifest.json
```

The environment record includes the exact source SHA, operating system, runner, concurrency, corpus/configuration/seed digests, bootstrap versions and all generation budgets.

The aggregate records validity, runtime distribution, panel distribution, zero-panel rate, answers, crossings, coverage, short-fill metrics, clue debt and category/source concentration.

Percentiles use the nearest-rank method.

Selected-grid clue debt is explicitly defined as:

```text
genericClueCount
+ repeatedClueCount
+ overRevealingGeneratedClueCount
```

The individual components remain present in every record.

## Accepted results

All `170/170` seeds were structurally valid, connected, exact-clue only and passed the preserved coverage checkpoint. There were no worker failures.

| metric | development-20 | promotion-50 | stability-100 |
| --- | ---: | ---: | ---: |
| valid seeds | 20/20 | 50/50 | 100/100 |
| average panels | 5.30 | 5.10 | 4.82 |
| maximum panels | 7 | 8 | 8 |
| zero-panel rate | 0% | 0% | 0% |
| average answers | 47.45 | 47.70 | 48.45 |
| average crossings | 51.70 | 51.96 | 52.78 |
| average answer-space coverage | 95.50% | 95.67% | 95.92% |
| average raw-letter coverage | 50.64% | 50.59% | 50.97% |
| median runtime | 25.969 s | 26.317 s | 25.320 s |
| p95 runtime | 28.645 s | 28.824 s | 27.721 s |
| maximum runtime | 28.803 s | 29.964 s | 29.045 s |
| average two-letter answers | 5.20 | 5.34 | 5.85 |
| average formulaic short answers | 0.00 | 0.02 | 0.04 |
| average selected-grid clue debt | 15.35 | 13.82 | 13.16 |
| average proper-name share | 28% | 26% | 26% |

Panel distributions:

- development: `3×3, 4×2, 5×4, 6×8, 7×3`;
- promotion: `2×1, 3×6, 4×8, 5×17, 6×9, 7×8, 8×1`;
- stability: `1×1, 2×2, 3×17, 4×22, 5×24, 6×21, 7×12, 8×1`.

## Interpretation

This phase locks the current baseline; it does not claim the long-term target has been reached.

The 100-seed result confirms:

- validity is stable;
- the current density frontier is approximately five residual panels, not two;
- no zero-panel seed appeared in the locked 170-seed sample;
- browser-equivalent runtime is approximately 25–30 seconds;
- clue debt and proper-name concentration remain measurable editorial constraints.

Later phases must compare against the committed manifest rather than against the older 39,586-entry predecessor or short exploratory samples.

## Evidence

Workflow run: `29705221147`.

| set | artifact | artifact digest |
| --- | ---: | --- |
| development | `8447723720` | `sha256:abce1c9f880c4956516da9b2ddf2491aee184d28adc02eac98656906c9f2bcb5` |
| promotion | `8447785216` | `sha256:525f634eb458156197a0305c9cd875529d6fbfadf833c707b6bb89bb88d78fbc` |
| stability | `8447877774` | `sha256:443eca6248d04b2c57f5cc62af4597609b25597fb8d2d7a0362c4c8d1f8c66d2` |

The machine-readable artifact, environment and per-file digests are recorded in `manifest.json`.

## Commands

```bash
node tools/v8-baseline-test.cjs

SCANWORD_BASELINE_ENFORCE=1 node tools/v8-baseline-checkpoint.cjs development
SCANWORD_BASELINE_ENFORCE=1 node tools/v8-baseline-checkpoint.cjs promotion
SCANWORD_BASELINE_ENFORCE=1 node tools/v8-baseline-checkpoint.cjs stability
```

Workflow:

```text
.github/workflows/v8-baseline-lock.yml
```

## Exit gate

- [x] committed corpus is version 8 with exactly 40,966 entries;
- [x] all three seed sets are committed, disjoint and reproducible;
- [x] development-20 completed;
- [x] promotion-50 completed;
- [x] stability-100 completed;
- [x] every grid is valid, connected and exact-clue only;
- [x] per-seed, aggregate, environment and run manifests are published;
- [x] immutable evidence head and durable archive ref exist;
- [x] machine-readable evidence manifest is populated;
- [x] no production runtime behavior changed.
