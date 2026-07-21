# Phase 4 — Bounded full-corpus pattern retrieval

Status: **ACCEPTED ARCHITECTURAL BOUNDARY**  
Date: **2026-07-21**  
Branch: `r-and-d/phase-4-full-corpus-retrieval`  
Base: Phase 3 squash merge `5424e339430e9be176b58f2546b93fcde29eb092`  
Accepted evidence head: `054a8188a5395404c7c4dba20211aa9521ad5f23`

The accepted evidence head is preserved by:

```text
refs/heads/research/archive-phase-4-full-corpus-retrieval-evidence-2026-07-21
```

## Question

Can the 2,500/3,500-entry seed-specific vocabulary remain the normal construction prior while constrained same-geometry repair searches retrieve bounded exact-pattern candidates from the complete admitted runtime vocabulary?

The phase must not reintroduce uniform full-pool construction sampling, weaken exact-clue admission, change structural geometry or allow a locally attractive fallback to degrade the final complete repair-chain result.

## Accepted boundary

Phase 4 adds:

```text
full-corpus-pattern-index-v1.js
```

The index covers **41,118 unique admitted runtime entries**: the committed 40,966-entry generated v8 corpus plus reviewed hand-maintained runtime vocabulary. It indexes by:

- normalized answer length;
- answer position and fixed letter;
- intersected constrained buckets.

A normal query must contain at least one fixed letter. An all-wildcard pattern is rejected and counted in telemetry. Results remain bounded and must have an exact clue, valid normalized spelling and admitted metadata.

The current integration is deliberately limited to same-geometry editorial searches:

- single-pattern replacement;
- crossing-pair refit.

Unconstrained base construction still uses only the seed-specific hot working set.

## Flags

```text
SCANWORD_FULL_CORPUS_RETRIEVAL=off|on
SCANWORD_FULL_CORPUS_RETRIEVAL_MODE=empty|small-poor
```

The committed browser default is:

```text
SCANWORD_FULL_CORPUS_RETRIEVAL=off
SCANWORD_FULL_CORPUS_RETRIEVAL_MODE=empty
```

`empty` retrieves only when the hot domain is empty. `small-poor` also evaluates bounded fallback for small or uniformly poor hot domains. Neither mode may sample an unconstrained full corpus.

## Ranking

Fallback candidates are ranked deterministically by:

1. formulaic-short status;
2. weak-fill status;
3. generic/generated clue status;
4. editorial penalty;
5. proper-name load;
6. current category and source concentration;
7. clue kind;
8. lexical quality;
9. answer tie-break.

The existing hot domain always retains priority. Full-corpus entries are considered only after the complete established hot-domain search fails.

## Complete-chain acceptance

The important acceptance boundary is the **complete editorial repair chain**, not a local pair or slot.

When retrieval is enabled, the unified repair stage evaluates two cloned candidates:

```text
hot-only complete repair chain
retrieval-enhanced complete repair chain
```

The retrieval candidate is accepted only when all of the following hold:

- identical structural signature, including grid types, slots, clue footprints and answer geometry;
- complete validation;
- one connected component;
- exact clues only;
- no two-letter increase;
- strict final editorial improvement: fewer formulaic short answers, or equal formulaic count with lower editorial penalty.

Equal or worse retrieval output preserves the hot-only candidate exactly. Retrieval telemetry records the evaluated candidate, rescue counts and rejection reason without claiming that rejected fallback answers entered the final grid.

## Locked development experiment

The Phase 2 `development-20` set was used. Promotion and stability sets were not touched.

Compared modes:

```text
hard-active-set
empty-domain
small-poor-domain
```

Environment:

- Node 22 on GitHub-hosted Linux x64;
- concurrency 2;
- the exact Phase 2 browser-equivalent corpus, budgets and bootstrap;
- explicit pipeline enabled for stage telemetry;
- 20 identical seeds per mode, 60 production generations total.

### Accepted evidence

```text
commit:          054a8188a5395404c7c4dba20211aa9521ad5f23
workflow run:    29809100387
artifact ID:     8487002183
artifact digest: sha256:0a68c73b4766ab94c964fe2f995fc17a41ea8ee4ce704767f855d29d4882664c
per-seed digest: sha256:fbb9425e511d593975fe0a678dfdd06e8c85d8d18cfa22f0478d393128bc6f02
aggregate digest:sha256:5d7dcbf147ccac91a81a0de7f55328ba134a00e843b7315d331cf2d3c62dd3f8
environment:     sha256:98df86214a7f578597f9f27217f5ea3d76a3cf718e3d66fa5844b7d05824da1e
```

### Results

| metric | hard active set | empty-domain | small/poor-domain |
| --- | ---: | ---: | ---: |
| valid, connected, exact-clue seeds | 20/20 | 20/20 | 20/20 |
| structural parity seeds | — | 20/20 | 20/20 |
| average panels | 5.30 | 5.30 | 5.30 |
| average answers | 47.45 | 47.45 | 47.45 |
| average crossings | 51.70 | 51.70 | 51.70 |
| average editorial penalty | 408.90 | 408.90 | 408.90 |
| average formulaic short count | 0.00 | 0.00 | 0.00 |
| average runtime | 26.35 s | 27.38 s | 26.89 s |
| runtime ratio | 1.0000 | 1.0392 | 1.0206 |
| fallback lookups | 0 | 14 | 53 |
| full-corpus candidate checks | 0 | 14 | 544 |
| rescued constrained domains | 0 | 0 | 4 |
| returned fallback candidates | 0 | 0 | 14 |
| fallback answers accepted into final grids | 0 | 0 | 0 |
| editorial regression seeds | 0 | 0 | 0 |

The broad mode measurably expanded four small constrained domains and surfaced fourteen candidates. None produced a strict complete-chain improvement over the hot-only result, so the accepted comparator retained all twenty baseline outputs.

This is a successful architectural result, not a claim of current output-quality gain. The active set is no longer a hard legal-domain boundary for constrained repair, but the full corpus remains unable to displace a stronger hot-chain result without complete evidence.

## Rejected ordering attempts

The negative evidence is retained because it determined the final acceptance boundary.

### Globally merged fallback ordering

```text
commit:          386ea300dfc76c0eb019dae5ad6494f7afdc8fda
workflow run:    29806006145
artifact ID:     8485755367
artifact digest: sha256:f0e7460094cb2c4d3174e4bdf1e2786ed5a4ad73db06421426a2761a8925cf86
```

The broad mode rescued four domains and selected `АНИТ` from `wordfreq+pymorphy3`, but seed `v8-dev-010` gained 13 editorial-penalty points. The workflow initially appeared green because `tee` masked the checkpoint exit status. `set -o pipefail` is now part of the gate.

### Hot-domain ordering inside each pair

```text
commit:          88f901931bc6ed9cfb34cd7a42b2de893f388eaf
workflow run:    29807093163
artifact ID:     8486165536
artifact digest: sha256:ec49c639c562deeb859cb221d02e56d1fa22f9cc863c6957f7df9a65dbb37b17
```

Preserving hot entries inside each domain was insufficient. A fallback on an earlier partner could still preempt a later hot-only partner repair.

### Hot-first partner passes

```text
commit:          e20b36b8f6ae5c6ffd099c6afd574e49bbdeedef
workflow run:    29808148586
artifact ID:     8486528967
artifact digest: sha256:a038443df34a670a954ff74b5a13c430cb91169d331c5ebc81231e5dd3817b7a
```

Exhausting all hot partner repairs before fallback still allowed a locally improved fallback pair to block a better later stage in the complete repair chain. This proved that local acceptance was the wrong boundary.

## Telemetry

Per result, the implementation records:

- indexed runtime entries;
- hot lookups;
- fallback lookups;
- full-corpus checks;
- empty, small and poor-domain rescues;
- returned fallback candidates;
- candidate and final selected fallback answers;
- category, source, stage and slot provenance;
- complete-chain acceptance/rejection reason;
- baseline and retrieval candidate editorial summaries.

## Deterministic tests

```text
node tools/full-corpus-pattern-index-test.cjs
node tools/full-corpus-pair-priority-test.cjs
node tools/full-corpus-repair-selection-test.cjs
```

The tests cover:

- length and position/letter intersection;
- deterministic ranking;
- malformed, blocked and no-clue admission rejection;
- unconstrained-query rejection;
- empty, small and poor-domain rescue;
- used-answer and duplicate exclusion;
- hot partner priority over fallback;
- complete-chain structural identity;
- strict improvement, validation and two-letter gates.

## Reproduction

```bash
node tools/full-corpus-pattern-index-test.cjs
node tools/full-corpus-pair-priority-test.cjs
node tools/full-corpus-repair-selection-test.cjs

SCANWORD_RETRIEVAL_CONCURRENCY=2 \
SCANWORD_RETRIEVAL_ENFORCE=1 \
node tools/full-corpus-retrieval-checkpoint.cjs \
  20 research-output/full-corpus-retrieval
```

## Limitations and next work

- No fallback answer was good enough to enter the final development grids under the strict complete-chain gate.
- Empty-domain mode found no nonempty rescue on the locked development set.
- Bundle refit still uses its established hot domain; expanding it should be a separately measured change.
- The index is built lazily but currently in memory; later search phases may need more compact precomputed buckets.
- Phase 4 does not improve residual panel density.
- The next phase should estimate clue feasibility before structural search rather than treating vocabulary access alone as a density solution.
