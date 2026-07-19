# Phase 1 — Selected-grid clue quality 1.2

Status: **IN PROGRESS**  
Date started: **2026-07-19**  
Branch: `r-and-d/phase-1-selected-grid-clues`  
Base: Phase 0 merge `b6327046f79d258d236dccc79d152a0cecbed8fa`

## Question

Can repeated generic clues be reduced after the final grid is selected without changing answers, geometry, density, crossings, coverage or short-answer editorial quality?

## Accepted scope

This phase is deliberately narrow:

1. measure clue debt in the selected grid;
2. rewrite only repeated clues whose source metadata has `genericTemplate=true`;
3. preserve one natural original clue when an entire duplicate group is generic;
4. prefer truthful source facts before mechanical letter hints;
5. reject clue candidates that reveal too much of a short answer;
6. leave browser defaults unchanged.

The phase does **not** search for alternate full grids.

## Preserved negative result from PR #10

The original research branch `r-and-d/selected-grid-editorial-quality-1.2` tested two grid-selection ideas:

- a final editorial tie-break after all structural metrics;
- extra deterministic full-grid variants admitted only through a strict non-regression and editorial-Pareto filter.

The tie-break changed `0/3` selections because complete structural ties were too rare.

One extra variant per active limit also changed `0/3` selections and added about `23.68 s` average runtime. The filter was safe but low-yield. That implementation remains preserved in draft PR #10 and is not ported into the Phase 1 runtime.

Historical evidence:

- tie-break run `29648452138`, artifact `8430776390`, digest `sha256:a449c4d800df070c1542ca10a52102bf4d14b7c3966f67c5afa2bb1cac79eafd`;
- variant-search run `29648750346`, artifact `8430862640`, digest `sha256:f3f28632664693d189adbcceeda7b6e7673c4829f40e2cfbd63c0b46b0dbe085`.

## Previous clue-only signal

The old three-seed clue-only prototype reduced average repeated clues from `2.67` to `0.33` while preserving answers and structural metrics. It rewrote every member of a generic duplicate group and could expose first and last letters plus answer length. That result was promising but insufficient for promotion.

Historical evidence:

- run `29649291669`;
- artifact `8431000529`;
- digest `sha256:0b10849fc6e678960873ea839595248b2444a92d473625ba8fa7041e0bdc351a`.

## Phase 1 implementation

### Selected-grid metrics

`construction-selected-grid-clue-metrics-v1.js` records:

- `genericClueCount`;
- `generatedClueCount`;
- `factualTemplateCount`;
- `properNameCount`;
- `distinctCategories`;
- `distinctSources`;
- `repeatedClueCount` and `repeatedClueKinds`;
- `repeatedGenericClueCount` and `repeatedGenericClueKinds`;
- rewritten and over-revealing generated clue counts;
- deterministic answer and geometry signatures.

Metrics are attached to `result.constructionV2.selectedGridClues` and copied into the selected vocabulary-portfolio summary when present.

### Clue-only cleanup

`construction-clue-disambiguation-v1.js` is enabled only with:

```text
SCANWORD_SELECTED_GRID_CLUE_DISAMBIGUATION=on
```

For each repeated clue group:

1. ignore groups without generic-template entries;
2. preserve non-generic clues;
3. when all entries are generic, keep one original clue unchanged;
4. rewrite the remaining entries using the first safe unique candidate.

Candidate preference:

1. existing sourced clue fields;
2. `clueFacts` such as region, elevation, population or area;
3. a compact category-and-length description;
4. a bounded letter-position hint.

The cleanup updates:

- `result.placed[*].clue`;
- the matching arrow-cell clue text;
- selected-grid metrics and telemetry.

It intentionally does not mutate `result.pool` or the global corpus.

### Revealingness policy

Generated wording must not contain the complete answer.

Maximum exposed letters:

- answer length `<= 2`: zero;
- length `3–6`: one;
- length `>= 7`: two.

The exposed-letter fraction must not exceed `0.34`. Unsafe candidates are skipped and counted rather than admitted.

## Required checks

```bash
node tools/selected-grid-clue-metrics-test.cjs
node tools/clue-disambiguation-test.cjs

NODE_OPTIONS="--require=./tools/node-benchmark-bootstrap-v1.cjs --require=./tools/node-editorial-bootstrap-v1.cjs" \
SCANWORD_EDITORIAL_ENFORCE=1 \
  node tools/vocabulary-editorial-checkpoint.cjs 20

node tools/render-selected-grid-clues.cjs \
  selected-grid-clues-sample \
  research-output/selected-grid-clues.svg
```

Workflow: `.github/workflows/vocabulary-editorial-quality.yml`.

## Exit gate

- all 20 selected grids remain valid and connected;
- answer and geometry signatures are identical within every pair;
- panels, answers, crossings, raw-letter coverage, formulaic-short count and editorial penalty are unchanged;
- no over-revealing generated clue is admitted;
- overall repeated clues do not increase;
- repeated generic clues materially decrease on the full sample;
- rendered wording and clue-cell fit pass visual inspection;
- alternate-grid search remains research-only.

## Evidence pending

The first current-main 20-seed workflow and rendered artifact have not yet completed. Record the exact head SHA, workflow run, artifact ID, digest, aggregate metrics, per-seed regressions and visual counterexamples here before promotion.
