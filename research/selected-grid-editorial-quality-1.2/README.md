# Selected-grid editorial quality 1.2

Status: active research; fast clue disambiguation is promising, portfolio variant search remains negative so far.

## Question

Can the generator improve clue quality in the selected grid without changing answers, geometry or the accepted density frontier?

## Baseline

Vocabulary-first 1.1 evaluates 2,500- and 3,500-entry candidates in this order:

1. complete validation;
2. one connected answer component;
3. fewer panels;
4. more answers;
5. more crossings;
6. greater raw-letter coverage;
7. lower short-answer editorial penalty;
8. fewer formulaic short answers;
9. solver score;
10. deterministic active-limit tie-break.

The corpus records clue kind, generic-template status, generated-template status, source, category and factual metadata. The baseline portfolio did not summarize those fields for placed answers and could display the same generic clue several times in one grid.

## Selected-grid metrics

`construction-vocabulary-editorial-tiebreak-v1.js` annotates selected results with:

- `genericClueCount`;
- `generatedClueCount`;
- `factualTemplateCount`;
- `properNameCount`;
- `distinctCategories`;
- `distinctSources`;
- `repeatedClueCount`;
- `repeatedClueKinds`.

The browser entry point does not load the research wrappers. Node research uses `tools/node-editorial-bootstrap-v1.cjs` after the canonical 1.1 bootstrap.

## Experiment A — final portfolio tie-break

Flag:

```text
SCANWORD_VOCABULARY_EDITORIAL_TIEBREAK=on
```

The first implementation inserted repeated-clue, generic-clue, proper-name and diversity comparisons only after every accepted structural and short-answer objective tied.

Three-seed result:

- changed selections: 0/3;
- structural regressions: 0;
- clue-metric changes: 0;
- runtime difference: noise-level.

Conclusion: exact ties are too sparse for this to be an effective primary intervention.

Evidence:

- run `29648452138`;
- artifact `8430776390`;
- digest `sha256:a449c4d800df070c1542ca10a52102bf4d14b7c3966f67c5afa2bb1cac79eafd`.

## Experiment B — non-regressing alternate grids

The wrapper can generate deterministic alternate grids and admit one only when it is no worse than the 1.1 baseline on panels, answers, crossings, raw-letter coverage, short-answer penalty and formulaic fill, while also Pareto-improving repeated clues, generic clues, proper-name load or diversity.

One extra variant per active limit, three seeds:

- changed selections: 0/3;
- structural regressions: 0;
- editorial improvements: 0;
- average runtime increase: 23.68 seconds.

Conclusion: the strict Pareto filter is safe but low-yield and too expensive as a default checkpoint. Variant search is now a manual workflow option rather than part of the fast path.

Evidence:

- run `29648750346`;
- artifact `8430862640`;
- digest `sha256:f3f28632664693d189adbcceeda7b6e7673c4829f40e2cfbd63c0b46b0dbe085`.

## Experiment C — repeated generic clue disambiguation

`construction-clue-disambiguation-v1.js` performs an answer-preserving postprocess after the final grid is selected.

It changes only repeated clues backed by `genericTemplate=true`. Compact category-aware hints are generated from truthful answer properties:

```text
Имя на А
Фамилия: К…В
Город: М…О, 6 б.
```

The operation updates the placed answer, the arrow-cell clue record and the pool entry for the same answer. Geometry, answers, crossings, validation and source metadata remain unchanged.

Fast three-seed result with variant search disabled:

| metric | baseline | disambiguated | delta |
| --- | ---: | ---: | ---: |
| panels | 5.00 | 5.00 | 0 |
| answers | 46.67 | 46.67 | 0 |
| crossings | 50.33 | 50.33 | 0 |
| raw-letter coverage | 51.57% | 51.57% | 0 |
| short editorial penalty | 398.67 | 398.67 | 0 |
| repeated clues | 2.67 | **0.33** | **-2.33** |
| repeated clue kinds | 1.33 | **0.33** | **-1.00** |
| runtime | 23.92 s | 23.48 s | -0.44 s |

Per-seed outcome:

- fewer repeated clues: 3/3;
- changed answer sets: 0/3;
- panel regressions: 0;
- answer regressions: 0;
- crossing regressions: 0;
- coverage regressions: 0;
- short-answer editorial regressions: 0;
- average clues rewritten: 4.0;
- average repeated groups rewritten: 1.33.

The negative runtime delta is treated as measurement noise; the postprocess itself is effectively negligible compared with construction.

Evidence:

- run `29649291669`;
- artifact `8431000529`;
- digest `sha256:0b10849fc6e678960873ea839595248b2444a92d473625ba8fa7041e0bdc351a`.

## Controls

Fast clue-only comparison:

```bash
NODE_OPTIONS="--require=./tools/node-benchmark-bootstrap-v1.cjs --require=./tools/node-editorial-bootstrap-v1.cjs" \
  node tools/vocabulary-editorial-checkpoint.cjs 20
```

Optional variant search:

```bash
SCANWORD_EDITORIAL_VARIANT_SEARCH=on \
SCANWORD_VOCABULARY_EDITORIAL_VARIANTS=2 \
NODE_OPTIONS="--require=./tools/node-benchmark-bootstrap-v1.cjs --require=./tools/node-editorial-bootstrap-v1.cjs" \
  node tools/vocabulary-editorial-checkpoint.cjs 20
```

Deterministic tests:

```bash
node tools/vocabulary-editorial-tiebreak-test.cjs
node tools/clue-disambiguation-test.cjs
```

Workflow: `.github/workflows/vocabulary-editorial-quality.yml`.

## Acceptance boundary

- complete structural validity remains mandatory;
- no answer, geometry, crossing, coverage or short-answer editorial regression is allowed for clue-only cleanup;
- only repeated generic templates are rewritten;
- generated hints must remain truthful, compact and deterministic;
- the browser default remains unchanged;
- the wording itself must be visually inspected before promotion;
- no promotion decision is made from fewer than 20 seeds.

## Next work

1. run the clue-only path on 20 identical seeds;
2. render before/after samples and inspect clue-footprint fit;
3. audit whether first/last-letter hints are too revealing for any category;
4. replace mechanical hints with richer source facts where available;
5. keep variant search manual unless a broader sample produces real Pareto wins.
