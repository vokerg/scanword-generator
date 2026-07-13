# Construction portfolio checkpoint

## Why this branch moved away from post-layout repair

The post-layout closed-fill CSP remained structurally sound but ineffective: clue-text packing had already fragmented the remaining panels into one- and two-cell islands. A whole-region local CSP could not form legal answer/clue topologies there, and depth-one inline rollback did not produce an accepted replacement.

Research on crossword generation supports a different search order: retain competing structural/fill states, use indexed domains and bounded backtracking or beam search, and delay irreversible layout decisions. The implementation on this branch therefore treats the final clue-text layout as part of candidate evaluation rather than as a cosmetic pass after the winner is chosen.

## Implemented algorithms

### Panel-first portfolio selection

For each deterministic attempt:

1. build the answer graph with the existing indexed placement engine;
2. allocate clue-text footprints using the preserved allocator;
3. run the complete structural validator;
4. retain only candidates that pass every existing production checkpoint;
5. compare valid candidates lexicographically by:
   - fewer residual panels;
   - more raw letter cells;
   - fewer weak lexical entries;
   - smaller clue-text area;
   - more crossings and answers.

The portfolio runs independently from the default browser mode and falls back safely when no candidate passes.

### Exact legacy baseline guard

The R&D mode also regenerates the exact legacy candidate for the same seed. The portfolio result is returned only if it is lexicographically no worse. This makes the comparison monotonic while the new pipeline is still experimental.

### Structural polish

After selecting a portfolio candidate, clue-text footprints may be released temporarily. The solver then probes indexed answer slots, re-packs all clues, and accepts a modification only when:

- full-grid validation passes;
- the answer graph remains connected;
- reviewed clues remain mandatory;
- clue-footprint gates remain intact;
- weak-fill count does not increase;
- the final lexicographic objective improves.

Current telemetry shows that this polish rarely has a non-weak domain. This is evidence that further progress requires victim-word replacement before the grid reaches its saturated final topology, rather than another straight insertion pass.

## Dictionary work

A curated common-fill layer was added with original clues and lexical metadata. Two-letter entries are classified as weak fill.

A 30-seed demand mine found only eleven zero-match pattern families. Almost all were two-letter forms such as `О?`, `С?`, `?Е`, `?К`, `?Л`, and `?О`; the only longer family was the isolated pattern `А?Б`. Therefore the current residual problem is not a shortage of ordinary four-to-eight-letter nouns. Filling these demands by adding particles and prepositions would trade topology for editorial quality and must be controlled by a strict weak-fill budget.

## Measured checkpoints

### 40-seed portfolio, 120 attempts

- valid legacy: 40 / 40;
- valid portfolio: 40 / 40;
- average panels: 14.78 -> 12.85;
- maximum panels: 20 -> 17;
- average raw letter coverage: 49.18% -> 49.38%;
- improved seeds: 31;
- regressed seeds: 4;
- unchanged seeds: 5;
- fallbacks: 0.

### 20-seed portfolio, 240 attempts plus structural polish

- valid legacy: 20 / 20;
- valid portfolio: 20 / 20;
- average panels: 14.35 -> 11.75;
- maximum panels: 18 -> 14;
- average raw letter coverage: 49.21% -> 49.49%;
- improved seeds: 17;
- regressed seeds before the exact baseline guard: 2;
- unchanged seeds: 1;
- fallbacks: 0;
- average generation time: 1.41 s -> 6.97 s.

The exact baseline guard was added after this measurement and must be revalidated on the final head.

## Status

This is a real quality improvement but not checkpoint A. The target remains:

- average residual panels <= 8;
- maximum residual panels <= 12;
- zero structural and lexical regressions.

The next high-value algorithm is bounded victim replacement inside the construction portfolio: remove one low-value boundary answer before clue packing, branch over replacement bundles, and retain the best fully laid-out states. The current PR must remain draft and unmerged until that tested checkpoint is green.
