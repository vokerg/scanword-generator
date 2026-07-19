# Phase 2 — Locked v8 production baseline

Status: **IN PROGRESS**  
Date started: **2026-07-19**  
Branch: `r-and-d/phase-2-baseline-lock`  
Base: Phase 1 merge `87dc59c1b47bcee9846bb1f8243f552fd5d2038b`

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

## Output contract

For each set, `tools/v8-baseline-checkpoint.cjs` writes:

```text
per-seed.jsonl
aggregate.json
environment.json
run-manifest.json
```

`environment.json` records:

- exact commit SHA;
- Node version;
- operating system and architecture;
- runner and concurrency;
- configuration and seed-set digests;
- corpus-manifest digest;
- browser-equivalent bootstrap versions;
- all generation budgets.

`aggregate.json` records:

- validity, connectivity, exact-clue and failure rates;
- average, median, p95, minimum and maximum runtime;
- panel distribution, zero-panel rate and maximum panels;
- answers and crossings;
- active, answer-space and raw-letter coverage;
- two-letter and formulaic-short counts;
- editorial penalty;
- selected-grid clue debt;
- proper-name share and category/source concentration.

Percentiles use the nearest-rank method.

Selected-grid clue debt is explicitly defined as:

```text
genericClueCount
+ repeatedClueCount
+ overRevealingGeneratedClueCount
```

The individual components remain present in every record.

## Commands

Deterministic contract test:

```bash
node tools/v8-baseline-test.cjs
```

Checkpoints:

```bash
SCANWORD_BASELINE_ENFORCE=1 node tools/v8-baseline-checkpoint.cjs development
SCANWORD_BASELINE_ENFORCE=1 node tools/v8-baseline-checkpoint.cjs promotion
SCANWORD_BASELINE_ENFORCE=1 node tools/v8-baseline-checkpoint.cjs stability
```

Workflow:

```text
.github/workflows/v8-baseline-lock.yml
```

## Exit gate

- the committed corpus resolves to version 8 and exactly 40,966 entries;
- all three locked seed sets are committed, disjoint and reproducible;
- development-20 and promotion-50 complete successfully;
- stability-100 completes successfully;
- every grid is valid, connected and exact-clue only;
- all per-seed and aggregate artifacts include environment and digest metadata;
- a repository manifest records immutable evidence heads, workflow runs, artifact IDs, digests and exact commands;
- no production runtime behavior changes.

## Evidence pending

Record the exact evidence commit, durable archive ref, workflow run, three artifact IDs and digests, and aggregate metrics before promotion.
