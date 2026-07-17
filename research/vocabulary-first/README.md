# Vocabulary-first dense-fill program

## Decision

The primary research direction is now **vocabulary-first dense fill**.

The generator will no longer treat a sub-two-thousand-word lexicon as a fixed constraint and compensate mainly with local geometry repair. A large, clue-bearing answer corpus must be available **before initial construction**, so every slot and crossing pattern has real domain breadth.

Same-geometry editorial repair remains useful, but it is now a secondary cleanup stage.

## Why this is the default direction

The current effective inventory is too small for publication-style density:

- 857 unique answers are available during initial construction;
- 584 additional unique answers are available only to the post-generation repair pipeline;
- 1,441 unique answers exist across both layers;
- the five-letter domain contains only 391 answers before crossing constraints;
- fixing two or three letters often collapses a slot domain to zero.

This explains the repeated empty-domain telemetry. Search-node budgets were usually not exhausted; compatible answers simply did not exist.

The target is therefore not a small incremental expansion. The staged targets are:

1. **15,000+ unique pre-construction answers** — first useful dense-fill corpus;
2. **30,000+** — broad names, geography, terminology and ordinary nouns;
3. **50,000+** — sustained publication-style pattern coverage;
4. **100,000+ reviewed candidates** — long-term corpus before editorial filtering.

## Experiment history

### Closed-fill and geometry work

The closed-fill snapshot established strict structural validation, one connected answer graph, exact crossing agreement and explicit residual panels. It also showed that local CSP patches can improve a fixed grid but cannot manufacture missing lexical domains.

### Lexical placement pressure

Early penalties against short and weak answers reduced lexical defects but made the 40-answer checkpoint unreachable. Dense-only penalties preserved reachability but did not materially reduce short fill. This demonstrated that coefficient tuning cannot replace domain breadth.

### Portfolio selection

Pareto selection improved lexical metrics before downstream construction but amplified later panel damage. Selecting among nearly identical small-dictionary candidates did not solve the fundamental coverage problem.

### Same-geometry editorial repair

The unified pipeline added:

1. exact one-slot replacement;
2. target-plus-crossing pair refit;
3. bounded radius-two component CSP;
4. full-grid validation.

It reduced formulaic two-letter answers without changing geometry. The final 50-seed vocabulary-assisted run reduced the average formulaic count from 3.44 to 0.34, with 48/50 improved grids and no structural regressions. This was a successful cleanup system, but not a dense-fill solution: the number of panels and structural two-letter slots remained unchanged.

### Demand-driven repair lexicon

A 584-word unique repair expansion proved that adding compatible vocabulary has direct measurable effect. It also exposed the correct next step: move a much larger, categorized corpus into the initial construction pool.

## Corpus architecture

The default generator corpus is split into auditable layers:

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
  hasExactClue
}
```

The initial constructor receives all enabled layers. Repair is not allowed to be the only consumer of the bulk corpus.

## Quality tiers

A large corpus is not treated as uniformly publishable.

- **A — common:** ordinary dictionary words and familiar names/places;
- **B — specialist:** valid terminology and less frequent proper names;
- **C — rare:** legitimate but editorially costly answers;
- **blocked:** abbreviations without a clear convention, malformed forms, phrases, profanity, non-Cyrillic answers and entries without a usable clue.

Construction may use A and B by default. C receives a penalty and remains available only when it closes otherwise empty domains. Blocked entries never enter the pool.

## Source policy and attribution

The first bulk build uses reproducible, attributed sources:

- **RuWordNet 2.0** for Russian lexical senses and definitions;
- **GeoNames** for geographic names, under CC BY 4.0;
- existing project dictionaries for manually reviewed clues;
- generated type clues for names and clearly classified proper nouns.

Generated artifacts must record source version, download URL, license, filtering rules, counts and digest. Source data is never silently copied into production.

## Filtering rules

Default admission rules:

- one Cyrillic token only;
- normalized `Ё → Е` for matching while preserving display spelling where possible;
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

- unique pre-construction pool size;
- non-empty domain rate by slot length and fixed-letter count;
- answers placed;
- crossings;
- residual panels;
- raw-letter and answer-space coverage;
- elapsed time and candidate lookups;
- rare/specialist answer count;
- duplicate and clue-validity failures.

The central hypothesis is:

> Increasing high-quality pre-construction domain breadth should increase answer count and intersections while reducing residual panels, without weakening structural validation.

## Immediate implementation sequence

1. Pin this document and the complete experiment history.
2. Add a reproducible bulk-lexicon builder and license manifest.
3. Generate the first 15,000–25,000-entry corpus.
4. Load it before `core.js` and `solver.js` in both browser and benchmark paths.
5. Raise the default UI pool limit from 1,000 to the full indexed corpus.
6. Run 20-seed smoke and 50-seed confirmation benchmarks.
7. Mine remaining empty patterns and expand the corpus by category rather than by isolated words.

## Production boundary

This remains a research branch. Production `main` is unchanged. A large imported corpus requires license review, editorial sampling and performance validation before merge.
