# AGENTS.md

This file is the canonical operating guide for this repository. It applies to the repository root and every subdirectory unless a more specific `AGENTS.md` is added later.

## Source of truth

- `main` is the only long-lived development and release branch.
- Production milestone decisions live in `docs/milestones/`.
- Experiments, including negative results, live in `research/` and must remain reproducible from `main`.
- Historical experiment commits are anchored in the `main` commit graph; a permanent research branch is not required.
- Do not describe an experiment as production merely because its files are present in `main`. Production status is determined by browser defaults, load order, release gates and the latest milestone document.

## Current production milestone

Vocabulary-first 1.0 is the default pipeline:

```text
39,586-entry attributed corpus
-> deterministic active sets at 2,500 and 3,500 entries
-> complete construction and clue allocation
-> same-geometry editorial repair
-> panel-first candidate selection
-> complete validation
```

The canonical evidence is `docs/milestones/v1.0-vocabulary-first.md`.

## Runtime structure

### Browser entry point

`index.html` owns:

- production feature flags;
- script load order;
- default grid and UI values.

Changing script order is an architectural change. The production wrapper order must remain:

```text
base dictionaries and bulk corpus
-> core and dictionary policy
-> solver and construction stages
-> editorial lexical policy and demand lexicons
-> single replacement
-> pair refit
-> radius-two bundle refit
-> unified editorial repair
-> vocabulary portfolio
-> renderer and UI
```

The vocabulary portfolio must wrap the already repaired single-candidate generator, so both active-set candidates are repaired before panel-first selection.

### Production modules

```text
core.js
```

Dictionary normalization, indexing utilities, deterministic randomization and seed-specific working-set selection.

```text
dictionary-policy.js
```

Admission policy for clues, lexical categories and generated corpus entries.

```text
solver.js
```

Base grid construction, crossing rules, scoring, metrics and complete validation.

```text
construction-*.js
```

Bounded construction, clue allocation, rollback and repair stages. Several retained research modules are not independent production claims; check `index.html` and the current milestone before treating a module as active.

```text
construction-editorial-repair-v3.js
construction-vocabulary-portfolio-v1.js
```

The final production wrappers. Their relative load order is mandatory.

```text
renderer.js
ui.js
```

A5 SVG rendering, browser controls and JSON/SVG export.

## Dictionary architecture

### Hand-maintained sources

```text
words.js
short-words.js
clues.js
extra-dictionary.js
two-letter-words.js
editorial-demand-*.js
```

Use these for small, reviewed additions and targeted repair vocabulary.

### Generated bulk corpus

```text
bulk-lexicon-runtime.js
bulk-lexicon/loader.js
bulk-lexicon/manifest.json
bulk-lexicon/*.js
```

The generated chunks are build artifacts. Do not hand-edit them.

To change the bulk corpus:

1. modify `tools/build-bulk-lexicon.py` or its documented source/filter policy;
2. rebuild every chunk, the loader and the manifest together;
3. run the corpus audit and dictionary count;
4. inspect category and length distributions;
5. run identical-seed density benchmarks;
6. document source, license and editorial consequences.

Every accepted entry must retain:

- normalized answer;
- usable clue;
- lexical category;
- quality score or tier;
- source and license;
- source identifier where available.

Do not increase the corpus by adding unreviewable inflections, malformed abbreviations or entries without usable clues merely to raise a count.

## Structural invariants

Every accepted generated grid must satisfy all of the following:

1. Every contiguous letter run of length two or more is exactly one assigned answer.
2. Every letter belongs to at least one assigned answer.
3. Crossing letters agree.
4. Every arrow and clue footprint resolves to an existing answer start.
5. Every used answer has an admitted exact clue.
6. The answer graph has exactly one connected component.
7. No accidental runs, orphan letters or conflicting slots exist.
8. Residual areas are explicit panels, never unassigned answer cells.

Never weaken the complete validator to make a benchmark pass.

## Objective hierarchy

For the 1.0 production line, compare complete valid candidates in this order:

1. fewer residual panels;
2. more answers;
3. more crossings;
4. greater raw-letter coverage;
5. lower editorial penalty and fewer formulaic short answers;
6. higher existing solver score;
7. deterministic tie-breakers.

Do not replace this lexicographic policy with one opaque weighted score without a separately documented experiment and identical-seed A/B result.

## Feature flags and rollback

```text
SCANWORD_BULK_LEXICON=off
```

Use the former construction dictionary.

```text
SCANWORD_VOCABULARY_PORTFOLIO=off
```

Disable the 2,500/3,500 portfolio and construct one active working set.

```text
SCANWORD_EDITORIAL_REPAIR=off
```

Disable same-geometry lexical cleanup.

```text
SCANWORD_CATEGORY_BALANCE=on
```

Enable the retained, non-default category-cap experiment.

```text
SCANWORD_CONSTRUCTION_MODE=legacy
```

Use the original construction path.

Feature flags used for A/B tests must not silently change browser defaults.

## Required checks

Minimum checks for dictionary or production-pipeline changes:

```bash
node tools/bulk-lexicon-audit.cjs
node tools/dictionary-count-v3.cjs
node tools/vocabulary-release-checkpoint.cjs 20
```

Also run syntax checks for every changed JavaScript or CommonJS file:

```bash
node --check path/to/file.js
node --check path/to/tool.cjs
```

For changes to a specific bounded stage, run its matching `tools/*-test.cjs` file before the release checkpoint.

A production promotion must verify:

- complete structural validity;
- one connected component;
- exact clues only;
- corpus counts and audit status;
- browser defaults and script order;
- identical-seed baseline and candidate metrics;
- runtime change;
- regressions by seed, not averages alone.

## Research discipline

Every substantive experiment belongs in `research/` and should state:

- question and hypothesis;
- exact baseline and candidate modes;
- seed set and environment limits;
- acceptance criteria;
- aggregate and per-seed regressions;
- runtime;
- examples of accepted changes;
- negative result or limitation;
- workflow run, artifact ID, digest and commit SHA when available.

Keep failed approaches. Do not rewrite a negative experiment as though it were never attempted.

Prefer a new explicit pipeline stage over another global `generateBest` wrapper. When a wrapper is unavoidable, document its load-order contract and add a test that exercises real generation rather than only a synthetic fixture.

## Canonical directories

```text
.github/workflows/       production gates and manual research reproduction
bulk-lexicon/            generated corpus chunks, loader and manifest
docs/milestones/         accepted release decisions and evidence
research/closed-fill/    historical topology and clue-allocation work
research/lexical-quality/ same-geometry lexical repair experiments
research/vocabulary-first/ corpus expansion and active-set experiments
tools/                   builders, audits, tests, reports and benchmarks
```

## Documentation rules

- `README.md` describes the current production system and points to canonical documents.
- `AGENTS.md` describes architecture, repository ownership and change procedure.
- `docs/milestones/` records accepted production boundaries.
- `research/` records experiments and must clearly distinguish tested observations from inference.
- Metrics must include the baseline, sample size and validation boundary.
- Do not claim zero-panel or publication-ready output unless a release gate explicitly proves it.

## Release process

1. Complete and document the experiment on a short-lived branch.
2. Run the production release checkpoint on the exact candidate head.
3. Update the relevant milestone document with metrics and debt.
4. Confirm browser defaults and wrapper order.
5. Merge to `main` through a reviewed pull request or an explicit milestone commit.
6. Run or verify the post-merge `main` gate.
7. Anchor any historically important experiment heads in the `main` commit graph before deleting their branches.
8. Delete merged short-lived branches once no open pull request uses them.

## Branch policy

Only `main` should remain permanently.

A non-`main` branch may be removed when:

- its pull request is merged or closed;
- its canonical conclusions and reproduction data are present in `main`;
- any historically important head is reachable from `main` through the history-anchor commit;
- no workflow or script fetches the branch name;
- no open pull request uses it as a head or base.

Deleting a branch is not a substitute for documenting the experiment first.
