# Vocabulary Greatness 1.1

Status: completed project-baseline experiment; follow-up continues in 1.2 research.

Date: 2026-07-18

## Objective

Improve vocabulary-first 1.0 without losing its density frontier, while making corpus provenance and editorial debt measurable rather than implicit.

Tracks:

1. make Node release benchmarks reproduce browser corpus and wrapper order;
2. reduce generic template-clue debt;
3. broaden attributed coverage beyond cities and personal names;
4. prefer canonical Russian geographic names;
5. test a conservative adaptive portfolio fast path;
6. retain failed corpus-selection variants as evidence.

## Baseline

Vocabulary-first 1.0:

- 39,586 attributed entries;
- deterministic 2,500/3,500 active-set portfolio;
- same-geometry editorial repair;
- 20-seed result: 5.30 panels, 48.45 answers, 53.00 crossings;
- 38.24% generic-template clues;
- previously reported runtime was based on an incomplete Node load order.

## Finding 1 — benchmark bootstrap was incomplete

`tools/benchmark-seed-v3.cjs` predated the final browser script order. Direct Node runs could omit the bulk corpus, final portfolio wrapper and editorial demand modules while installing superseded research wrappers.

`tools/node-benchmark-bootstrap-v1.cjs` now preloads the canonical browser-equivalent module order and blocks the two research-only wrappers that must not be installed after production wrappers.

Corrected 20-seed release checkpoint:

| metric | former dictionary | 39,586 portfolio |
| --- | ---: | ---: |
| panels | 7.05 | 5.30 |
| answers | 44.75 | 48.45 |
| crossings | 47.35 | 53.00 |
| answer-space coverage | 93.98% | 95.53% |
| formulaic short answers | 0.40 | 0.15 |
| runtime | 10.86 s | 24.48 s |

The structural conclusion was reproduced. The truthful runtime is approximately 3.4 seconds higher than the earlier milestone report.

Evidence:

- workflow run `29641076841`;
- artifact `8428683600`;
- digest `sha256:b468325b4910c593d64a31779a234cde53244d455144d9202a6b87839254d080`.

## Finding 2 — generic clues and factual templates are different debt classes

The 1.0 corpus counted all generated templates together. That obscured the difference between generic name clues and sourced factual descriptions for cities, countries and natural features.

The 1.1 builders preserve:

- `clueKind`;
- `genericTemplate`;
- `generatedTemplate`;
- source-specific `clueFacts`;
- source and license identifiers.

Selected v8 corpus:

- total entries: 40,966;
- sourced noun definitions: 24,457;
- descriptive factual templates: 10,841;
- generic templates: 5,668 / 13.84%;
- generated templates of any kind: 16,509.

Generic-template debt fell below the 20% target without pretending that factual templates are hand-edited prose.

## Finding 3 — geographic expansion required several rejected selection policies

### v3 — broad entity import

Added 3,000 natural and administrative entities. It raised total breadth above 42k, but shortest-alias selection admitted malformed transliterations and weak alternate names.

### v4 — morphology-heavy filtering

Reduced some bad aliases, but ordinary Russian homographs could still survive as rivers or regions.

### v5 — canonical-lemma admission

Automatic lemmatization damaged foreign place names and was rejected as a general canonicalization strategy.

### v6 — surface alternate clusters

Removed many inflected answers and introduced stable factual clue formats, but still selected nonstandard transliterations when the source lacked a clean Russian preference.

### v7 — preferred Russian GeoNames

Used language-tagged preferred Russian alternate names where available. This repaired many city names, but fallback aliases survived when preferred answers collided with already admitted entries.

### v8 — selected corpus

Final policy:

- use preferred Russian GeoNames where available;
- drop colliding fallback aliases;
- retain filtered surface-cluster fallback only when necessary;
- allow a tiny source-ID keyed letters-only override map;
- validate canonical examples in the builder.

Selected corpus checkpoint:

- 40,966 total entries;
- 9,915 cities/capitals after collision and duplicate removal;
- 125 countries;
- 1,469 non-city geographic entities;
- 8,996 city entries with preferred Russian mappings available;
- 13.84% generic-template debt;
- canonical examples: `МЕХИКО`, `БОГОТА`, `ЛОМЕ`, `ХАНОЙ`, `ТАЙБЕЙ`, `ПРЕТОРИЯ`, `ЯУНДЕ`, `УЛАНБАТОР`.

The committed corpus was taken from workflow artifact `8428738377`, digest `sha256:7308f455b33311cc63959ee4cfad194c46061fc475b334765b0e64fdb5cd081f`.

## Finding 4 — adaptive portfolio is promising but conservative

`construction-vocabulary-portfolio-v1.js` gained an explicit `adaptive` mode. It may accept the first 2,500-entry candidate only when strict panel, answer, crossing and editorial thresholds are all satisfied.

Initial 10-seed result:

- exact selected-grid matches: 10/10;
- panel regressions: 0;
- answer regressions: 0;
- crossing regressions: 0;
- editorial regressions: 0;
- fast-path acceptance: 1/10;
- mean runtime reduction: 6.57%.

Evidence:

- workflow run `29641076837`;
- artifact `8428661665`;
- digest `sha256:1c53356e9327cfa2dc7ae716d7d8b5c952bb4d90a7cdbd5d781043ce0202112b`.

Adaptive mode remains explicit. The browser default is still `full`.

## Promotion decision

Because the entire application is an evolving draft, the selected v8 corpus, truthful benchmark bootstrap, metadata model and adaptive experiment are squash-merged as the 1.1 project baseline.

This decision does **not** claim:

- publication-ready clue prose;
- zero-panel generation;
- that the 40,966-entry corpus has already completed a 50-seed density checkpoint;
- that adaptive mode should replace the full portfolio by default.

Those limitations are carried into the next branch rather than blocking integration of useful draft infrastructure.

## Reproduction

```bash
node tools/bulk-lexicon-audit.cjs

NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/vocabulary-release-checkpoint.cjs 20

NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/vocabulary-adaptive-checkpoint.cjs 20
```

Corpus regeneration requires RuWordNet, GeoNames cities, all-country features, alternate names and country information as documented in `.github/workflows/vocabulary-greatness-build.yml`.

## Follow-up boundary

The next investigation should measure editorial quality in the **selected grid**, not only in the source corpus. Candidate summaries should expose generic-clue count, generated factual-template count, proper-name load and clue repetition so density-preserving tie-breakers can be tested on identical seeds.
