# Phase 10 — bounded complete-pipeline frontier

## Decision

Accepted on 2026-07-24.

Promote a deterministic width-four repair-potential frontier to the browser production default. Preserve the exact Phase 9 single-candidate result as immutable frontier member zero and as the complete-tie fallback.

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=on
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4
```

Exact Phase 9 rollback:

```text
SCANWORD_COMPLETE_PIPELINE_FRONTIER=off
```

Node experiments and historical baselines set this flag explicitly; the browser default is the accepted production boundary.

## Question

Could candidates discarded by the construction portfolio outperform its local winner after the complete downstream repair and editorial chain?

Phase 9 returned one checkpoint-passing construction winner before portfolio polish, clue repacks, clue reflows, targeted residual-victim repair, baseline guard and editorial repair. That early deletion could remove a candidate with worse current metrics but better residual repair potential.

## Accepted boundary

`construction-portfolio.js` now retains a bounded non-dominated set after exact clue allocation and construction-level victim repair. The exact historical winner is always member zero.

The repair-potential vector is:

```text
minimize residual panels
maximize letter cells
minimize weak fill
minimize clue-text cells
maximize external clue capacity
maximize crossings
maximize answers
minimize residual panel regions
minimize isolated panels
maximize residual concentration = largest panel region / residual panels
```

The topology dimensions are essential. The first strict frontier using only ordinary complete metrics retained no alternatives in the invalid early diagnostic runs. The accepted hypothesis explicitly models whether residual cells are concentrated and therefore more repairable.

The frontier is truncated to four candidates by deterministic canonical order. Every dominance and width rejection records its vector and provenance.

## Downstream finalist chain

Each retained candidate independently receives:

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
-> complete validation
-> canonical final comparison
```

The historical legacy guard candidate is generated once and cloned for every finalist. Frontier width therefore multiplies only the downstream chain, not unrestricted construction attempts or legacy generation.

The heavy candidate set is non-enumerable and does not enter normal serialized result payloads.

## Final objective

Only valid, connected, exact-clue-only candidates are eligible. Final comparison is lexicographic:

1. fewer residual panels;
2. more answers;
3. more crossings;
4. greater raw-letter coverage;
5. fewer formulaic short answers;
6. lower editorial penalty;
7. lower selected-grid clue debt;
8. higher solver score;
9. lower frontier index, preserving the exact Phase 9 result on complete ties.

No weighted scalar score hides these priorities. Lower-priority editorial changes remain visible in every A/B record.

## Harness defect preserved

Two early green runs were invalid as algorithm evidence:

```text
runs:        30040602957, 30041156501
old head:    e212992d3d2a915a2c41d963b918d19ad89fb035
archive ref: refs/heads/research/archive-phase-10-complete-candidate-frontier-negative-2026-07-23
```

The checkpoint omitted the locked browser-equivalent environment. `SCANWORD_CONSTRUCTION_MODE` defaulted to `legacy`, so both A/B sides bypassed `construction-portfolio.js` and produced no frontier telemetry.

The corrected checkpoint imports `research/baselines/v8-production-1.1/config.json`, requires portfolio construction and fails when frontier telemetry is missing. The old archive name predates diagnosis and is superseded by this ledger.

## Frozen implementation

```text
implementation head: df537dd5f47712062fb6224d4e42cb67e41876b3
archive ref:         refs/heads/research/archive-phase-10-complete-pipeline-frontier-evidence-2026-07-23
baseline:            v8-production-1.1-explicit-browser-equivalent
```

Documentation and default-promotion commits follow the immutable implementation ref.

## Acceptance workflow

```text
run: 30042371319
head: 499a242bf5e4b84aa01148a6e1db042fc50ea44a
runtime cap: 1.35
frontier width: 4
required retained-alternative win: yes
```

Artifacts:

| set | artifact | digest |
| --- | ---: | --- |
| development-20 | 8577930403 | `sha256:8dda1942b6df412137be3d727b5e87b14fe86224f6229eaed6769182e41f4c1c` |
| promotion-50 | 8578472962 | `sha256:c149908d738ffbaff853e86993eb3e604e4f3c001ffc3fdcb13d797609768134` |
| stability-100 | 8579529487 | `sha256:8056807b2eb7c6abe03a74924696080dddfc70159899656f21c7367f95380c7f` |

Every one of the 170 A/B pairs completed with a valid grid, one connected component and exact clues. No pair regressed under the canonical complete objective.

## Development-20

| metric | Phase 9 | frontier |
| --- | ---: | ---: |
| wins / ties / regressions | — | **16 / 4 / 0** |
| average residual panels | 5.30 | **4.65** |
| average answers | 47.45 | **48.35** |
| average crossings | 51.70 | **52.00** |
| average raw-letter coverage | 0.5063 | 0.5041 |
| average formulaic short count | 0.00 | 0.05 |
| average editorial penalty | 408.90 | 424.60 |
| runtime ratio | — | **1.1676** |

Selected frontier members:

```text
member 0: 4
member 1: 5
member 2: 4
member 3: 7
```

Examples include `v8-dev-017` at 6 → 2 panels and `v8-dev-003` at equal panels with one additional answer and crossing.

## Promotion-50

| metric | Phase 9 | frontier |
| --- | ---: | ---: |
| wins / ties / regressions | — | **41 / 9 / 0** |
| average residual panels | 5.10 | **4.60** |
| average answers | 47.70 | 47.88 |
| average crossings | 51.96 | 51.72 |
| average raw-letter coverage | 0.5059 | 0.5055 |
| average formulaic short count | 0.02 | 0.04 |
| average editorial penalty | 401.12 | 408.04 |
| runtime ratio | — | **1.1815** |

Selected frontier members:

```text
member 0: 9
member 1: 15
member 2: 17
member 3: 9
```

## Stability-100

| metric | Phase 9 | frontier |
| --- | ---: | ---: |
| wins / ties / regressions | — | **63 / 37 / 0** |
| average residual panels | 4.84 | **4.37** |
| average answers | 48.49 | **48.90** |
| average crossings | 52.78 | 52.82 |
| average raw-letter coverage | 0.5099 | 0.5099 |
| average formulaic short count | 0.05 | 0.05 |
| average editorial penalty | 415.10 | 426.33 |
| runtime ratio | — | **1.1850** |

Selected frontier members:

```text
member 0: 37
member 1: 25
member 2: 22
member 3: 16
```

The stability result confirms that the improvement is not development-set tuning: retained alternatives won on 63% of the frozen stability seeds with zero canonical regressions.

## Acceptance rationale

Phase 10 passes the required boundary:

- 170/170 complete valid connected exact-clue pairs;
- zero canonical regressions;
- 120 retained-alternative wins across the three disjoint sets;
- deterministic width four and immutable member-zero fallback;
- complete provenance and per-stage telemetry;
- aggregate runtime ratios between 1.1676 and 1.1850, below the 1.35 cap;
- no additional unrestricted construction restarts;
- one shared legacy guard generation per active set.

The disclosed editorial averages are subordinate to the accepted structural objective. The implementation does not claim universal editorial improvement.

## Reproduction

```bash
node tools/complete-pipeline-frontier-test-v1.cjs
SCANWORD_COMPLETE_PIPELINE_FRONTIER=off \
  node tools/construction-stage-runtime-test-v2.cjs

SCANWORD_FRONTIER_CONCURRENCY=4 \
SCANWORD_FRONTIER_RUNTIME_RATIO=1.35 \
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4 \
SCANWORD_FRONTIER_REQUIRE_WIN=1 \
  node tools/complete-pipeline-frontier-checkpoint-v1.cjs \
  research/baselines/seed-sets/development-20.json \
  research-output/complete-pipeline-frontier/development-20.jsonl
```

Use the dedicated workflow for the sequential development-20, promotion-50 and stability-100 gate.

## Known limitation and next phase

The accepted frontier begins after exact clue allocation and construction-level victim repair. It fixes measured downstream candidate deletion but does not reduce exact allocation work.

The next bounded optimization should move retention earlier:

```text
structural alternatives
-> cheap clue-feasibility filter
-> bounded structural frontier
-> exact clue allocation only for finalists
-> accepted complete-pipeline frontier
```

That work must separately prove output parity or a newly accepted quality boundary and measure the allocation work saved.

## Status

Accepted. Browser default on at width four. Exact Phase 9 rollback retained with `SCANWORD_COMPLETE_PIPELINE_FRONTIER=off`.