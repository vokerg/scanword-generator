# Selected-grid editorial quality 1.2

Status: active research.

## Question

Can the generator measure clue quality in the selected grid and use those measurements as a final tie-breaker without changing the existing structural and density hierarchy?

## Baseline

Vocabulary-first 1.1 evaluates 2,500- and 3,500-entry candidates in this order: validation, connectivity, panels, answers, crossings, raw-letter coverage, short-answer editorial cost, solver score and active-limit tie-break.

The source corpus records clue kind, generic-template status, generated-template status, source, category and factual metadata. Those fields are not yet summarized for placed answers.

## Experiment

Add an opt-in portfolio wrapper that reports:

- generic clues among placed answers;
- generated factual templates;
- proper-name load;
- distinct categories and sources;
- repeated normalized clue text.

Only after all existing structural, density and short-answer objectives tie may the experiment prefer fewer repeated clues, fewer generic clues, fewer proper names and broader category/source diversity.

## Acceptance boundary

- complete structural validity remains mandatory;
- panel, answer, crossing and coverage metrics may not regress because of the tie-breaker;
- the browser default remains unchanged;
- identical-seed output, editorial deltas and runtime are reported per seed;
- negative or zero-impact results remain documented.
