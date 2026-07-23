# Phase 10 — bounded complete-pipeline frontier

## Question

Can a small non-dominated set of construction candidates survive the complete downstream repair and editorial chain and produce a better final grid than the current early single-candidate selection?

## Baseline

Phase 9 makes the explicit orchestrator the canonical production owner. Within each active vocabulary set, `construction-portfolio.js` performs construction, clue allocation and pre-layout victim repair, ranks complete checkpoint-passing candidates, and returns one local winner. `construction-stage-runtime-v2.js` then runs polish, clue-footprint repairs, targeted residual-victim repair, the preserved legacy guard and same-geometry editorial repair only for that winner.

That boundary can delete a candidate whose current complete metrics are worse but whose residual topology has more downstream repair potential.

## Feature controls

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=on
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4
```

Browser default remains:

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=off
```

The exact Phase 9 winner must remain immutable frontier member zero. The historical guard candidate is generated once and cloned for each finalist. Frontier width may multiply only the downstream chain, not unrestricted construction restarts or legacy guard generation.

## Downstream finalist chain

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

## Attempt 1 — strict complete-candidate Pareto frontier

### Hypothesis

Retain non-dominated candidates at the existing construction-portfolio exit using:

```text
minimize residual panels
maximize letter cells
minimize weak fill
minimize clue-text cells
maximize external clue capacity
maximize crossings
maximize answers
```

### Preserved implementation and evidence

```text
implementation head: e212992d3d2a915a2c41d963b918d19ad89fb035
archive ref:         refs/heads/research/archive-phase-10-complete-candidate-frontier-negative-2026-07-23
workflow run:        30040602957
artifact ID:         8577076298
artifact digest:     sha256:2b62492e6f133c0f58bed51cc206434c5749f40f6e6f40449321667f345981f5
```

### Development-20 result

| metric | result |
| --- | ---: |
| completed pairs | 20/20 |
| invalid / disconnected / non-exact | 0 |
| canonical regressions | 0 |
| canonical wins | 0 |
| exact ties | 20 |
| output changes | 0 |
| downstream selection changes | 0 |
| retained construction candidates | 1 on every seed |
| baseline elapsed | 90.696 s |
| candidate elapsed | 90.205 s |
| runtime ratio | 0.9946 |

### Decision

Reject this frontier definition.

The strict vector did not produce a frontier in production data: the existing construction winner dominated every other checkpoint-passing candidate on all twenty development seeds. The downstream multi-finalist chain therefore never ran. The result proves exact parity and safe default-off integration, but it provides no evidence for candidate retention or density improvement.

Do not increase width. Width was not the limiting factor; dominance eliminated every alternative before the width bound applied.

## Attempt 2 — repair-potential topology frontier

### New hypothesis

Current panel count and letter count are insufficient proxies for downstream opportunity. A candidate with a small panel disadvantage may be more repairable when its residual cells are concentrated, connected and free of isolated singleton panels.

The next construction frontier will retain candidates under explicit repair-potential dimensions in addition to complete metrics:

```text
minimize residual panel regions
minimize isolated panels
maximize residual concentration = largest panel region / residual panels
preserve clue-area and lexical dimensions
```

This is a new topology hypothesis, not arbitrary width expansion. Member zero remains the exact Phase 9 winner, width remains four, and final selection remains unchanged.

The diagnostic telemetry must record why each alternative survives—especially panel-region, isolated-panel or concentration trade-offs—and must remain visible even when only member zero is retained.

## Telemetry requirements

The selected result records:

- construction frontier vectors and provenance;
- every dominance or width rejection;
- residual-region topology and repair-potential dimensions;
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

Promotion additionally requires at least one reproducible complete-grid win caused by a retained alternative. If repair-potential dimensions still retain no alternatives or never change final selection, preserve the negative result and move the frontier earlier rather than weakening dominance indefinitely.

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

The current frontier boundary retains candidates after exact clue allocation and construction-level victim repair. It tests downstream candidate deletion, but it does **not yet** move exact clue allocation to only bounded structural finalists. The roadmap's more efficient long-term sequence remains:

```text
structural alternatives
-> cheap feasibility
-> bounded frontier
-> exact clue allocation only for finalists
```

If the repair-potential complete-candidate frontier is also empty or unproductive, the next justified redesign is that earlier structural boundary—not a larger complete-candidate width.

## Status

Attempt 1 is a preserved negative result. Attempt 2 is in progress on `r-and-d/phase-10-complete-pipeline-frontier`. The feature remains off by default and is not accepted.
