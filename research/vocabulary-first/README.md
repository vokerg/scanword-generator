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

The database remains 22,500 entries, but each seed now derives a deterministic 5,000-entry working set:

- all available two- and three-letter answers are retained;
- longer lengths receive explicit quotas;
- lexical quality and category preference influence selection;
- different seeds sample different words from the full corpus.

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

The expanded set produced no answer-count regressions, increased crossings on all three seeds, and raised answers on two. One seed retained the same panel count, one improved structural content at equal panels, and one regressed by two panels, leaving an average panel delta of `+0.67`.

**Conclusion:** vocabulary expansion can improve answer and crossing density once the working set is balanced, but active-set size and category composition still need tuning before a larger confirmation run.

Artifact: `vocabulary-first-15dd6b349f96fe6d3a572ee54ad3922b02dede76`.

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

The current hypothesis is more precise than the original:

> A large source corpus improves dense fill only when candidate sampling preserves short structural domains and controls category composition.

## Current implementation sequence

1. Complete the active working-set sweep at 2,500, 3,500, 5,000 and 7,500 entries.
2. Select the smallest non-regressing configuration that improves answers and crossings.
3. Reduce overuse of generic name and city clues through category quotas and penalties.
4. Run 20-seed confirmation, then 50 seeds.
5. Add countries, rivers, mountains, regions, arts, science, sport and historical names toward 30,000–50,000 source entries.
6. Add slot-pattern coverage telemetry and expand weak domains by category.
7. Apply same-geometry editorial repair as the final cleanup stage.

## Production boundary

This remains a research branch. Production `main` is unchanged. The imported corpus requires license review, editorial sampling, runtime validation and a larger deterministic benchmark before merge.
