# Phase 1 — Selected-grid clue quality 1.2

Status: **ACCEPTED RESEARCH**  
Date: **2026-07-19**  
Branch: `r-and-d/phase-1-selected-grid-clues`  
Base: Phase 0 merge `b6327046f79d258d236dccc79d152a0cecbed8fa`  
Accepted evidence head: `935d23d3886d5f4a8de5c0856e65429f0fcdc140`

The evidence head is preserved by:

```text
refs/heads/research/archive-phase-1-evidence-2026-07-19
```

## Question

Can repeated generic clues be reduced after the final grid is selected without changing answers, geometry, density, crossings, coverage or short-answer editorial quality?

## Decision

Yes, within a bounded research-only clue pass.

Keep:

1. selected-grid clue metrics;
2. deterministic answer and geometry signatures;
3. repeated-generic clue cleanup behind an explicit flag;
4. source-fact and safe letter-class alternatives;
5. exact per-seed structural identity gates;
6. real A5 before/after rendering.

Do not:

- enable the pass in `index.html` yet;
- mutate the source corpus or working pool;
- port the alternate full-grid search from draft PR #10;
- claim that compact letter-class notation is publication-edited prose.

## Preserved negative result from PR #10

The original branch `r-and-d/selected-grid-editorial-quality-1.2` tested:

- a final editorial tie-break after all structural metrics;
- extra deterministic full-grid variants admitted only through strict non-regression and editorial-Pareto filters.

The tie-break changed `0/3` selections because complete structural ties were too rare.

One extra variant per active limit also changed `0/3` selections and added about `23.68 s` average runtime. The filter was safe but low-yield, so it is not part of the Phase 1 runtime.

Historical evidence:

- tie-break run `29648452138`, artifact `8430776390`, digest `sha256:a449c4d800df070c1542ca10a52102bf4d14b7c3966f67c5afa2bb1cac79eafd`;
- variant-search run `29648750346`, artifact `8430862640`, digest `sha256:f3f28632664693d189adbcceeda7b6e7673c4829f40e2cfbd63c0b46b0dbe085`.

## Previous clue-only signal

The old three-seed prototype reduced average repeated clues from `2.67` to `0.33` while preserving answers and structural metrics. It rewrote every generic duplicate and could expose first and last letters plus answer length. That result justified a larger experiment but was not safe enough to promote.

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
4. rewrite the remaining entries using the first safe unique candidate;
5. leave the entry unchanged when no safe candidate exists.

Candidate preference:

1. existing sourced clue fields;
2. `clueFacts` such as region, elevation, population or area;
3. compact repeated-letter or vowel/consonant patterns;
4. an exact letter-position hint only as a last resort.

The cleanup updates:

- `result.placed[*].clue`;
- the matching arrow-cell clue text;
- selected-grid metrics and telemetry.

It intentionally does not mutate `result.pool` or the global corpus.

### Revealingness policy

Generated wording must not contain the complete answer.

Maximum exact letters exposed:

- answer length `<= 3`: zero;
- length `4–7`: one;
- length `>= 8`: two.

The exact-letter fraction must not exceed `0.25`. Unsafe candidates are skipped and counted rather than admitted.

## Rejected Phase 1 candidate

The first current-main 20-seed run was structurally green but failed editorial review.

It rewrote `74` clues, including `67` three-letter answers:

- `33` rewrites merely restated visible answer length;
- `39` used exact-letter hints, often revealing one-third of a three-letter answer;
- repeated generic clues fell from `74` to `5`, but the metric improvement overstated the editorial value.

This candidate was rejected rather than promoted.

Evidence:

- run `29702779870`;
- artifact `8447110990`;
- digest `sha256:d48e87c7dcac0b3828783d8ab5080fc49d306b69c00935f680dafe9b77353a39`.

## Accepted 20-seed checkpoint

The stricter candidate ran twenty identical baseline/editorial pairs against the committed 40,966-entry corpus.

| metric | baseline | clue-only | delta |
| --- | ---: | ---: | ---: |
| residual panels | 5.20 | 5.20 | 0 |
| answers | 47.95 | 47.95 | 0 |
| crossings | 52.30 | 52.30 | 0 |
| raw-letter coverage | 51.04% | 51.04% | 0 |
| formulaic short answers | 0.10 | 0.10 | 0 |
| editorial penalty | 414.85 | 414.85 | 0 |
| repeated clues | 3.90 | 1.10 | **−2.80** |
| repeated generic clues | 3.70 | 0.90 | **−2.80** |
| average runtime | 24.606 s | 24.542 s | −0.064 s |

Aggregate outcomes:

- valid connected grids: `20/20` in both modes;
- changed answer sets: `0`;
- changed geometries: `0`;
- structural regressions: `0`;
- seeds with fewer repeated clues: `20/20`;
- seeds with fewer repeated generic clues: `20/20`;
- repeated generic instances: `74 -> 18`;
- rewritten clues: `56` across `30` duplicate groups;
- exact letters exposed by accepted rewrites: `0`;
- factual rewrites: `2`;
- letter-class rewrites: `54`;
- unresolved entries left unchanged: `18`;
- unsafe candidates skipped: `54`.

Runtime distribution:

| mode | median | p95 | maximum |
| --- | ---: | ---: | ---: |
| baseline | 24.746 s | 26.481 s | 28.821 s |
| clue-only | 24.434 s | 26.588 s | 28.680 s |

The measured runtime difference is noise-level because cleanup happens after construction and only touches selected clue records.

Evidence:

- exact head `935d23d3886d5f4a8de5c0856e65429f0fcdc140`;
- workflow run `29703438843`;
- artifact `8447307373`;
- digest `sha256:a1d659ff364b463565ce2e140e95a3793be93a144f83330a5f396d9eb669795c`.

Production guards on the same head:

- Arrowword quality run `29703438833`: success;
- rollback-cross run `29703438838`: success.

## Visual review

The artifact includes:

```text
selected-grid-clues-before.svg
selected-grid-clues-after.svg
selected-grid-clues.svg
```

The real A5 renderer showed:

- identical answers and geometry;
- sample repeated generic clues `3 -> 0`;
- renderer ellipses `17 -> 17`, so the pass introduced no additional truncation;
- all changed clue footprints remained legible.

The accepted sample replaced exact-letter hints with zero-letter patterns such as `М. имя: С-Г-С` and `М. имя с повтором`. These are safer than the rejected candidate, but the `Г/С` notation still needs a product-level editorial convention before browser enablement.

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

## Exit-gate result

- all 20 selected grids valid and connected: **pass**;
- identical answer and geometry signatures: **pass**;
- zero panel, answer, crossing, coverage or short-editorial regression: **pass**;
- zero over-revealing accepted clue: **pass**;
- repeated generic clues materially reduced: **pass**;
- real clue-footprint rendering inspected: **pass**;
- alternate-grid search remains research-only: **pass**.

## Accepted debt and next step

Phase 1 is accepted as research, not as a browser-default release.

Remaining debt:

- `18` repeated generic instances remain because safe distinguishing metadata was unavailable;
- generic proper-name clues still dominate the debt;
- vowel/consonant shorthand is compact but not yet a reviewed publication convention;
- source-level generic clue count is unchanged because this pass rewrites only the selected result.

Phase 2 should build the explicit pipeline skeleton without enabling any new algorithmic stage by default. Browser enablement of Phase 1 should wait for a reviewed clue-style convention or richer source metadata for short proper names.
