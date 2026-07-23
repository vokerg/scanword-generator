# Phase 10 — bounded complete-pipeline frontier

## Question

Can a small non-dominated set of already-valid construction candidates survive the complete downstream repair and editorial chain and produce a better final grid than the current early single-candidate selection?

## Baseline

Phase 9 makes the explicit orchestrator the canonical production owner. Within each active vocabulary set, `construction-portfolio.js` currently performs construction, clue allocation and pre-layout victim repair, ranks complete checkpoint-passing candidates, and returns one local winner. `construction-stage-runtime-v2.js` then runs polish, clue-footprint repairs, targeted residual-victim repair, the preserved legacy guard and same-geometry editorial repair only for that winner.

That boundary can delete a candidate whose construction metrics are non-dominated but whose downstream repair potential is better.

## Hypothesis

Retain a bounded Pareto set at the construction-portfolio exit, preserve the exact Phase 9 winner as immutable member zero, and run the unchanged downstream production chain independently for every retained finalist. Select only after complete validity, connectivity, exact clues and the canonical final objective are known.

## Current implementation boundary

The feature is opt-in:

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=on
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4
```

Browser default remains:

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=off
```

Construction-level frontier dimensions are:

```text
minimize residual panels
maximize letter cells
minimize weak fill
minimize clue-text cells
maximize external clue capacity
maximize crossings
maximize answers
```

The exact current construction winner is always frontier member zero. Later members may be retained only when they are not dominated, and the complete set is bounded by deterministic canonical order.

Every retained member then receives:

```text
portfolio polish
-> clue-footprint repack
-> adaptive clue repack
-> clue-tail absorption
-> single-footprint reflow
-> pair-footprint reflow
-> targeted residual-victim repair
-> shared exact legacy guard
-> same-geometry editorial repair
-> complete final validation and comparison
```

The historical guard candidate is generated once and cloned for each finalist. Frontier width therefore multiplies only the downstream chain, not the exact legacy baseline or unrestricted construction restarts.

## Final comparison

Only candidates that are valid, connected and exact-clue-only are eligible. Final selection uses the canonical lexicographic objective:

1. fewer residual panels;
2. more answers;
3. more crossings;
4. greater raw-letter coverage;
5. fewer formulaic short answers;
6. lower editorial penalty;
7. lower selected-grid clue debt;
8. higher solver score;
9. exact Phase 9 baseline preference on complete ties.

No weighted scalar score is used to hide the frontier.

## Telemetry

The selected result records:

- construction frontier vectors and provenance;
- every dominance or width rejection;
- per-finalist downstream stages and elapsed time;
- final dominance relationships;
- selected frontier index;
- whether selection changed from member zero;
- shared legacy-guard cost.

The heavy transient candidate set is non-enumerable and is not serialized into normal production result payloads.

## Development protocol

The locked Phase 2 `development-20` set is used for iteration. Each seed compares:

```text
Phase 9 exact path: SCANWORD_COMPLETE_PIPELINE_FRONTIER=off
candidate path:     SCANWORD_COMPLETE_PIPELINE_FRONTIER=on, width 4
```

Mandatory diagnostic gate:

- 20/20 complete results;
- 100% validity;
- one connected component;
- exact clues only;
- zero regression under the canonical complete objective;
- aggregate runtime ratio no greater than 2.50;
- deterministic bounded frontier telemetry.

Promotion additionally requires at least one reproducible complete-grid win caused by a retained alternative. If the diagnostic run produces no changed selection or no canonical win, preserve the result and revise the hypothesis rather than widening the frontier blindly.

## Reproduction

```bash
node tools/complete-pipeline-frontier-test-v1.cjs
node tools/construction-stage-runtime-test-v2.cjs

SCANWORD_FRONTIER_CONCURRENCY=4 \
SCANWORD_FRONTIER_RUNTIME_RATIO=2.50 \
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4 \
  node tools/complete-pipeline-frontier-checkpoint-v1.cjs \
  research/baselines/seed-sets/development-20.json \
  research-output/complete-pipeline-frontier/development-20.jsonl
```

## Known limitation

This first frontier boundary retains candidates after exact clue allocation and construction-level victim repair. It prevents downstream repair/editorial candidate deletion, but it does **not yet** move exact clue allocation to only the bounded frontier finalists. The roadmap's more efficient long-term sequence remains:

```text
structural alternatives
-> cheap feasibility
-> bounded frontier
-> exact clue allocation only for finalists
```

Do not claim that optimization until a later implementation proves identical correctness and measures the saved allocation work.

## Status

Implementation and deterministic contract tests are present on `r-and-d/phase-10-complete-pipeline-frontier`. The development-20 diagnostic evidence is pending. The feature is not accepted and remains off by default.
