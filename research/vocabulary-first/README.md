# Vocabulary-first dense-fill program

## Decision

The primary research direction is now **vocabulary-first dense fill**.

The generator will no longer treat a sub-two-thousand-word lexicon as a fixed constraint and compensate mainly with local geometry repair. A large, clue-bearing answer corpus must be available **before initial construction**, so every slot and crossing pattern has real domain breadth.

Same-geometry editorial repair remains useful, but it is now a secondary cleanup stage.

## Why this is the default direction

The previous effective inventory was too small for publication-style density:

- 857 unique answers were available during initial construction;
- 584 additional unique answers were available only to post-generation repair;
- 1,441 unique answers existed across both layers;
- the combined five-letter domain contained only 391 answers;
- fixing two or three crossing letters frequently collapsed a slot domain to zero.

Search-node budgets were usually not exhausted; compatible answers simply did not exist.

The staged targets are:

1. **15,000+ unique pre-construction answers** — first useful dense-fill corpus;
2. **30,000+** — broader names, geography, terminology and ordinary nouns;
3. **50,000+** — sustained publication-style pattern coverage;
4. **100,000+ reviewed candidates** — long-term source corpus before editorial filtering.

## Experiment history

### Closed-fill and geometry work

The closed-fill snapshot established strict structural validation, one connected answer graph, exact crossing agreement and explicit residual panels. It also showed that local CSP patches can improve a fixed grid but cannot manufacture missing lexical domains.

### Lexical placement pressure

Early penalties against short and weak answers reduced lexical defects but made the 40-answer checkpoint unreachable. Dense-only penalties preserved reachability but did not materially reduce short fill. Coefficient tuning could not replace domain breadth.

### Portfolio selection

Pareto selection improved lexical metrics before downstream construction but amplified later panel damage. Selecting among nearly identical small-dictionary candidates did not solve the fundamental coverage problem.

### Same-geometry editorial repair

The unified pipeline added:

1. exact one-slot replacement;
2. target-plus-crossing pair refit;
3. bounded radius-two component CSP;
4. full-grid validation.

The final 50-seed vocabulary-assisted cleanup reduced the average formulaic count from `3.44` to `0.34`, with `48/50` improved grids and no structural regressions. It did not reduce residual panels or the structural number of two-letter slots.

### Demand-driven repair lexicon

A 584-word unique repair expansion proved that compatible vocabulary has direct measurable effect. It also exposed the correct next step: move a much larger categorized corpus into the initial construction pool.

### First bulk build: 22,500 entries

The reproducible builder generated:

| layer | entries |
| --- | ---: |
| RuWordNet nouns | 15,000 |
| given names, surnames and patronymics | 2,500 |
| GeoNames cities and capitals | 5,000 |
| **total** | **22,500** |

Category counts:

- 4,358 common nouns;
- 10,642 specialist nouns;
- 1,458 given names;
- 983 surnames;
- 59 patronymics;
- 4,829 cities;
- 171 capitals.

Length counts include 3,549 five-letter, 4,344 six-letter and 3,974 seven-letter entries. The source versions, attribution, file hashes and full distribution are pinned in `bulk-lexicon/manifest.json`.

After deduplication with the original project dictionary, the pre-construction inventory contains **22,668 unique answers**. Repair adds only 105 further unique answers, for **22,773 across every layer**. The validated per-seed working set is intentionally smaller than the source corpus.

### Naive full-pool integration: negative result

The first A/B exposed all 22,657 exact-clue entries directly to the existing indexed greedy search.

Three identical seeds produced:

| metric | old 887-word pool | raw 22,657-word pool |
| --- | ---: | ---: |
| average panels | 6.33 | 15.00 |
| average answers | 44.33 | 38.33 |
| average crossings | 46.67 | 44.33 |
| average raw-letter coverage | 50.20% | 50.53% |
| average short answers | 24.00 | 14.00 |
| average formulaic shorts | 3.33 | 0.00 |
| average elapsed time | 7.21 s | 26.92 s |
| old coverage checkpoint | 3/3 | 0/3 |

The corpus removed formulaic fill but displaced short structural bridge words from sampled crossing candidates. The greedy trajectory selected fewer, generally longer answers and left more residual panels.

**Conclusion:** database size and per-generation search working set are separate concerns. A large source corpus requires length-aware sampling rather than uniform occurrence sampling.

Artifact: `vocabulary-first-f28ffbbd5b16163bbb14be42b2c091af45602bbb`.

### Length-balanced 5,000-word working set: first positive density result

The database remained 22,500 entries, but each seed derived a deterministic 5,000-entry working set:

- all available two- and three-letter answers were retained;
- longer lengths received explicit quotas;
- lexical quality and category preference influenced selection;
- different seeds sampled different words from the full corpus.

Three identical seeds produced:

| metric | old 887-word pool | balanced 5,000-word set |
| --- | ---: | ---: |
| average panels | 6.33 | 7.00 |
| average answers | 44.33 | 46.00 |
| average crossings | 46.67 | 50.33 |
| average raw-letter coverage | 50.20% | 51.13% |
| average short answers | 24.00 | 28.67 |
| average formulaic shorts | 3.33 | 1.00 |
| average editorial penalty | 479.67 | 399.33 |
| average elapsed time | 9.41 s | 13.67 s |
| old coverage checkpoint | 3/3 | 3/3 |

The expanded set produced no answer-count regressions, increased crossings on all three seeds, and raised answers on two. Its average panel delta was still `+0.67`, so active-set size required a sweep.

Artifact: `vocabulary-first-15dd6b349f96fe6d3a572ee54ad3922b02dede76`.

### Active working-set sweep: 3,500 selected

The same three seeds compared 2,500, 3,500, 5,000 and 7,500 active entries drawn from the unchanged 22,500-entry source corpus.

| active set | panels | answers | crossings | raw letters | formulaic | checkpoint |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| old 887 | 6.67 | 45.33 | 45.67 | 47.83% | — | 3/3 |
| 2,500 | 7.33 | 47.33 | 52.67 | 51.13% | 2.67 | 3/3 |
| **3,500** | **5.67** | **45.67** | **50.67** | **52.17%** | **1.33** | **3/3** |
| 5,000 | 8.33 | 45.00 | 51.00 | 50.97% | 1.00 | 3/3 |
| 7,500 | 7.00 | 46.33 | 51.33 | 51.87% | 2.00 | 3/3 |

The 3,500-entry set was the smallest tested configuration that simultaneously reduced panels, preserved answer count and materially increased crossings. It is now the browser and Node default. The full source corpus remains available for seed-specific sampling.

Artifact: `vocabulary-pool-sweep-7e3a9163e998d2e7cad1c0756488104739d42c9c`.

### Twenty-seed confirmation: direction validated

The selected 3,500-entry working set was then tested on twenty new identical-seed A/B pairs.

| metric | old 887-word pool | vocabulary-first 3,500 | delta |
| --- | ---: | ---: | ---: |
| average residual panels | 7.35 | **6.20** | **−1.15** |
| average answers | 44.90 | **46.35** | **+1.45** |
| average crossings | 47.20 | **51.05** | **+3.85** |
| average active coverage | 96.67% | **97.18%** | **+0.51 pp** |
| average answer-space coverage | 93.72% | **94.85%** | **+1.13 pp** |
| average raw-letter coverage | 49.21% | **51.39%** | **+2.18 pp** |
| average formulaic short answers | 4.00 | **1.30** | **−2.70** |
| average editorial penalty | 544.95 | **441.10** | **−103.85** |
| average elapsed time | 10.58 s | 13.76 s | +3.18 s |

Outcomes:

- fewer panels: **12/20**;
- equal panels: **3/20**;
- panel regressions: **5/20**;
- more answers: **12/20**;
- equal answers: **2/20**;
- answer regressions: **6/20**;
- more crossings: **17/20**;
- higher raw-letter coverage: **14/20**;
- preserved structural coverage checkpoint: **20/20**;
- valid, connected grids with exact clues: **20/20**.

Average placed categories in expanded grids:

- 19.65 common nouns;
- 8.65 specialist nouns;
- 6.10 given names;
- 5.80 core-reviewed answers;
- 4.95 cities;
- 0.80 capitals;
- 0.40 surnames.

This confirms the central direction: a much larger source corpus, combined with a controlled seed-specific working set, improves density and intersection structure rather than merely reducing a lexical metric.

Artifact: `vocabulary-confirmation-4304e64f11a0184be5b00c6c42d09d47659fbf0f`; digest `sha256:9f2e65bf0c4fe2ce598ce1fb47c62ec43a537ebab8dad819946c8fd98b347656`.

## Corpus architecture

The default corpus is split into auditable layers:

- `core-reviewed` — existing manually reviewed words and clues;
- `ruwordnet-common` — single-word Russian nouns with dictionary definitions;
- `proper-names` — given names, patronymics and surnames with explicit type clues;
- `geography` — countries, cities, regions, rivers, mountains and other place names;
- `specialist` — science, arts, history, sport and traditional crossword terminology;
- `editorial-repair` — small high-precision pattern-demand additions.

Every entry carries at least:

```js
{
  answer,
  clue,
  category,
  lexicalQuality,
  lexicalSource,
  hasExactClue,
  license,
  sourceId
}
```

The full source corpus is available before construction. A deterministic working-set selector prevents huge categories from drowning out structurally important length domains. Repair is not allowed to be the only consumer of bulk vocabulary.

## Quality tiers

A large corpus is not treated as uniformly publishable.

- **A — common:** ordinary dictionary words and familiar names/places;
- **B — specialist:** valid terminology and less frequent proper names;
- **C — rare:** legitimate but editorially costly answers;
- **blocked:** malformed forms, unexplained abbreviations, phrases, profanity, non-Cyrillic answers and entries without a usable clue.

Construction may use A and B by default. C receives a penalty and remains available only when it closes an otherwise empty domain. Blocked entries never enter the pool.

## Source policy and attribution

The first bulk build uses reproducible, attributed sources:

- **RuWordNet 2.0** for Russian lexical senses and definitions;
- **GeoNames** for geographic names, under CC BY 4.0;
- existing project dictionaries for manually reviewed clues;
- generated type clues for names and clearly classified proper nouns.

Generated artifacts record source version, download location, license, filtering rules, counts and digest. Source data is never silently copied into production.

## Filtering rules

Default admission rules:

- one Cyrillic token only;
- normalized `Ё → Е` for matching;
- 2–12 letters for the current grid engine;
- no hyphens, spaces, digits or punctuation;
- nouns and proper names preferred;
- definitions cleaned of markup and examples;
- duplicate normalized answers merged;
- exact clue required;
- profanity and obvious malformed forms rejected;
- frequency and morphology used for tiering, not as the sole truth source.

## Benchmarks

Vocabulary work is accepted only through identical-seed A/B runs.

Primary metrics:

- source-corpus and active working-set size;
- non-empty domain rate by slot length and fixed-letter count;
- answers placed;
- crossings;
- residual panels;
- raw-letter and answer-space coverage;
- elapsed time and candidate lookups;
- category/source use in accepted answers;
- rare and specialist answer count;
- duplicate and clue-validity failures.

The validated hypothesis is:

> A large source corpus improves dense fill when candidate sampling preserves short structural domains and controls the per-seed working-set distribution.

## Current implementation sequence

1. Expand the source corpus toward 40,000–50,000 entries while retaining the 3,500-word active-set boundary.
2. Add countries, regions, rivers, mountains, arts, science, sport and historical names.
3. Improve generic clues for names and geography and add category-sensitive scoring.
4. Add slot-pattern coverage telemetry and expand weak domains by category.
5. Run a new 20-seed comparison after each corpus-generation milestone, then a 50-seed release checkpoint.
6. Apply same-geometry editorial repair as the final cleanup stage.

## Production boundary

This remains a research branch. Production `main` is unchanged. The imported corpus requires license review, editorial sampling, runtime validation and a larger deterministic benchmark before merge.
