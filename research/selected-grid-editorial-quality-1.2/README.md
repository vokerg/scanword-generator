# Selected-grid editorial quality 1.2

Status: active research; first bounded checkpoint running.

## Question

Can the generator measure clue quality in the selected grid and use those measurements as a final tie-breaker without changing the existing structural and density hierarchy?

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

The corpus already records clue kind, generic-template status, generated-template status, source, category and factual metadata. The baseline portfolio did not summarize those fields for placed answers.

## Implementation

`construction-vocabulary-editorial-tiebreak-v1.js` is an opt-in research wrapper enabled by:

```text
SCANWORD_VOCABULARY_EDITORIAL_TIEBREAK=on
```

The browser default remains off and the wrapper is not loaded by the browser entry point. The research Node bootstrap loads it after the canonical 1.1 portfolio wrapper.

Every selected-grid summary now reports:

- `genericClueCount`;
- `generatedClueCount`;
- `factualTemplateCount`;
- `properNameCount`;
- `distinctCategories`;
- `distinctSources`;
- `repeatedClueCount`;
- `repeatedClueKinds`.

When the flag is off, the wrapper delegates to the 1.1 portfolio and only annotates its selected result. When the flag is on, it evaluates the same configured active limits and inserts editorial comparisons only after every existing structural, density and short-answer objective ties.

Experimental final order:

1. fewer repeated clues;
2. fewer generic clues;
3. fewer proper names;
4. more distinct categories;
5. more distinct sources;
6. solver score;
7. active limit.

## Validation

Deterministic unit coverage:

```bash
node tools/vocabulary-editorial-tiebreak-test.cjs
```

Identical-seed checkpoint:

```bash
NODE_OPTIONS="--require=./tools/node-benchmark-bootstrap-v1.cjs --require=./tools/node-editorial-bootstrap-v1.cjs" \
  node tools/vocabulary-editorial-checkpoint.cjs 20
```

The checkpoint compares baseline and editorial selection on the same seeds and reports:

- changed answer sets;
- panel, answer, crossing and coverage regressions;
- short-answer editorial regressions;
- repeated-clue, generic-clue, proper-name and diversity deltas;
- runtime.

Workflow: `.github/workflows/vocabulary-editorial-quality.yml`.

## Acceptance boundary

- complete structural validity remains mandatory;
- panel, answer, crossing, coverage and short-answer editorial metrics may not regress because of the tie-breaker;
- the browser default remains unchanged;
- identical-seed output, editorial deltas and runtime are reported per seed;
- negative or zero-impact results remain documented;
- no promotion decision is made from fewer than 20 seeds.
