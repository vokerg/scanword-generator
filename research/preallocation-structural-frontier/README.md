# Phase 11 — pre-allocation structural frontier

Status: **closed research investigation; production promotion rejected**  
Production baseline: Phase 10 complete frontier 1.3  
Research branch: `r-and-d/phase-11-preallocation-structural-frontier`  
Frozen implementation archive: `refs/heads/research/archive-phase-11-preallocation-structural-filter-evidence-2026-07-25`

## Question

Can a deterministic structural frontier immediately before `assignClueTextCellsV2` retain every candidate needed by the accepted Phase 10 complete-pipeline result while avoiding most exact clue-allocation calls?

## Final decision

Decision: **rejected for production default**.

The width-96 rank-only filter passed development-20 and promotion-50 with exact output parity and about 49% fewer exact allocation calls, but stability-100 produced one genuine output regression:

```text
seed:      v8-stability-058
baseline:  4 panels, 44 answers, 44 crossings
filtered:  7 panels, 46 answers, 48 crossings
```

The filtered result was valid, connected and exact-clue-only, but the canonical objective prioritizes fewer residual panels. A 4 → 7 panel change is therefore a hard regression. The browser default remains `off`; Phase 10 remains authoritative.

The failure is not hidden behind aggregate metrics, runtime improvement, fallback, or validity. It proves that the available pre-allocation structural representation is not sufficient to guarantee Phase 10 selection parity at bounded width 96.

## Runtime controls

```text
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off     # canonical Phase 10 path
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=shadow  # diagnostic observation only
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=filter  # rejected authoritative candidate
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH=96
```

Exact rollback/default:

```text
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off
```

All retained Phase 11 modules are default-off research code. They do not replace `generateBest`; the explicit pipeline remains the sole production owner.

## Investigated stage model

```text
structural base states
-> bounded base retention
-> victim variants from retained parents
-> bounded final structural retention
-> exact clue allocation for retained states
-> accepted Phase 10 complete-pipeline frontier
-> complete validation and canonical comparison
```

The authoritative candidate fails open to the exact Phase 10 `generatePortfolio` implementation on any internal error or if no filtered candidate passes the existing construction checkpoint.

## Observation and accounting boundary

The research modules record:

- build-attempt, baseline-fallback and victim-replacement provenance;
- geometry, residual topology and repair-potential metrics;
- clue-feasibility bounds and pressure;
- exact allocation calls and elapsed time;
- Phase 10 construction-frontier ancestry;
- both canonical 2,500- and 3,500-entry active-set runs;
- actual process-wide `assignClueTextCellsV2` calls;
- compact per-run fallback and call-reduction telemetry.

Heavy observation objects are non-enumerable. Normal result payloads contain compact telemetry only.

## Rejected checkpoint A — estimator-first width 16

Exact head:

```text
b577dc849aaa36f1b9777c9792e120e38ba2eb8c
```

Evidence:

```text
workflow run: 30091733180
artifact:     8596292320
artifact sha256:73b78c9d1707cc2f25230c76eced026919e88e820568bfa82d119cb206343d11
```

| metric | result |
| --- | ---: |
| exact output parity | 20 / 20 |
| valid, connected, exact-clue-only | 20 / 20 |
| runtime ratio | 0.9825 |
| exact allocation calls observed | 10,321 |
| projected calls removed at width 16 | 9,681 (93.80%) |
| Phase 10 finalists retained | 4 / 160 (2.50%) |
| required parent bases retained | 4 / 101 (3.96%) |
| seeds with complete recall | 0 / 20 |

Decision: rejected. Feasibility-first ordering preferred sparse, easy-to-clue states and discarded dense repairable states that Phase 10 later selected.

Harness defect preserved: the first aggregate omitted otherwise valid parity and timing totals when recall failed. Per-seed data remained intact; later harnesses aggregate all executed records independently of the promotion decision.

## Rejected checkpoint B — repair-potential Pareto dominance

Exact head:

```text
e5c91bf5bb1a51add2b9cfc9960153325cebd511
```

Evidence:

```text
workflow run: 30123269359
artifact:     8608496756
artifact sha256:73d5b3863bff2e3b3445017010f9b5fccb9fc5a3e3184cb2efd3eddb077bf4c5
```

The ordering moved Phase 10 repair-potential geometry ahead of feasibility, but applied pre-allocation Pareto dominance before width truncation.

| width | projected call reduction | Phase 10 finalist recall | parent recall | full-recall seeds |
| ---: | ---: | ---: | ---: | ---: |
| 8 | 96.90% | 43/160 | 44/101 | 0/20 |
| 16 | 93.80% | 63/160 | 57/101 | 0/20 |
| 24 | 90.70% | 97/160 | 75/101 | 1/20 |
| 32 | 87.60% | 109/160 | 84/101 | 2/20 |
| 48 | 81.40% | 126/160 | 98/101 | 5/20 |
| 64 | 75.20% | 138/160 | 101/101 | 8/20 |
| 96 | 62.79% | 145/160 | 101/101 | 11/20 |
| 128 | 50.39% | 145/160 | 101/101 | 11/20 |
| 192 | 25.70% | 145/160 | 101/101 | 11/20 |
| 256 | 18.71% | 145/160 | 101/101 | 11/20 |

Runtime ratio was 0.9805 with exact output parity on all 20 diagnostic seeds.

Decision: rejected. Once every required parent survived, 15 Phase 10 finalists were still deleted by pre-allocation dominance. A candidate that appears dominated before exact allocation can remain relevant after exact clue layout and downstream repair.

## Development checkpoint C — repair-potential rank only

Exact head:

```text
39f9eea8e4471fbbfc56745acb0d6ee4d1f9e623
```

Evidence:

```text
workflow run: 30126661513
artifact:     8609799109
artifact sha256:fe861426ed327e4edab6f4ff3c47a3bc2929b4f79231e2b5a2ac70a18bcd4e58
```

This removed pre-allocation dominance entirely. Only deterministic top-N truncation could exclude a state.

| metric | result |
| --- | ---: |
| exact output parity | 20 / 20 |
| runtime ratio | 0.9814 |
| smallest full-recall width | 96 |
| Phase 10 finalists retained | 160 / 160 |
| required parent bases retained | 101 / 101 |
| projected call reduction | 6,481 / 10,321 (62.79%) |

Decision: accepted only as the development hypothesis for an authoritative filter. Width 64 retained all required parents but only 147/160 finalists. Width 96 was the first tested development width with complete recall.

## Authoritative width-96 implementation

Initial implementation evidence:

```text
head:         4541603fc2b6847773f66b1949bed1e619ea873f
workflow run: 30128757421
artifact:     8610461904
artifact sha256:94dd04c05310a39173423152496568df206efbe37af0c0040c618b3199315ff1
```

Initial development result:

| metric | result |
| --- | ---: |
| exact parity | 20 / 20 |
| fallback seeds | 0 / 20 |
| filter-boundary calls | 2,554 / 5,155 |
| measured boundary reduction | 50.46% |
| runtime ratio | 0.9146 |

The later acceptance harness added direct process-wide allocation counting across both active-set runs. The frozen implementation used for the final corpus sequence is:

```text
5f8fb8dcb446d1dcf13e1ef5fc1cee0c151906e4
refs/heads/research/archive-phase-11-preallocation-structural-filter-evidence-2026-07-25
```

Final locked workflow:

```text
run: 30149057113
```

### Development-20 — passed

```text
artifact: 8617096214
artifact sha256:a0448c2f9d314681c64a3ce99c150000309848aa99ac7d8a531d393b528137b5
```

| metric | result |
| --- | ---: |
| exact parity | 20 / 20 |
| fallback runs | 0 |
| baseline exact allocations | 10,671 |
| filtered exact allocations | 5,500 |
| calls saved | 5,171 (48.46%) |
| boundary-call reduction | 50.10% |
| runtime ratio | 0.9146 |

### Promotion-50 — passed

```text
artifact: 8617263647
artifact sha256:c9330ec4e2b7bccddec1a5dc407525d7dd09a82921ed2b405bb12aae6034ae5b
```

| metric | result |
| --- | ---: |
| exact parity | 50 / 50 |
| fallback runs | 0 |
| baseline exact allocations | 26,806 |
| filtered exact allocations | 13,727 |
| calls saved | 13,079 (48.79%) |
| boundary-call reduction | 50.27% |
| runtime ratio | 0.9306 |

### Stability-100 — failed promotion

```text
artifact: 8617578520
artifact sha256:f95bc60317f3f777db40ba7dfece3adc99abd5cc851183680aef022c5e7117d5
```

| metric | result |
| --- | ---: |
| exact parity | 99 / 100 |
| fallback runs | 0 |
| baseline exact allocations | 53,362 |
| filtered exact allocations | 27,227 |
| calls saved | 26,135 (48.98%) |
| boundary-call reduction | 50.50% |
| runtime ratio | 0.9442 |
| genuine canonical regressions | 1 |

Failure record:

```text
seed: v8-stability-058
baseline grid digest:  dfb64602e57cbb4e0ec12157b56ae7c823f5faf59c1dfe8123a9eaa0cbd37490
filtered grid digest:  30c366335890b33ea3a85ac6d953f3f25e04f351d02ef221566e5923700da52a
baseline panels: 4
filtered panels: 7
baseline answers/crossings: 44 / 44
filtered answers/crossings: 46 / 48
baseline editorial penalty: 392
filtered editorial penalty: 348
```

The lower editorial penalty, higher answer count and higher crossing count do not override the primary panel objective.

## Preserved harness defects

Two exact-head runs failed due to measurement assertions rather than algorithm behavior. They remain documented and reproducible.

### Global allocation-index identity defect

The first shadow checkpoint compared allocation indices across separate active-set runs. Those indices are run-local, so recall was incorrectly reported as zero despite parity. Stable provenance keys replaced global indices.

### Missing rank-wrapper telemetry defect

A telemetry aggregate referenced `phase10FrontierRetained` instead of the computed `phase10Retained`. The wrapper threw and invoked the legacy fallback. The typo was fixed, and diagnostic wrappers were made fail-open so telemetry defects cannot alter output.

### Boundary-versus-process call-scope defect

Run `30147587043`, artifact `8616619359`, digest `sha256:2b2a3a3b0878954d969e4099155f8f21936158ae7f5e719c498b9cb5714aa6` failed because the harness compared filter-boundary calls with all process-wide allocation calls. The algorithm had 20/20 parity, zero fallback, 48.46% fewer process-wide calls and 0.9137 runtime ratio.

### Non-winning downstream-call equality defect

Run `30147944126`, promotion artifact `8616971618`, digest `sha256:c63779e5436a278d99cba4689da64b76b55450dadad3e7767c6a7c568ba8eca5` failed because the harness required identical allocation counts in downstream work for non-winning frontier candidates. Selected output parity was 50/50, total calls fell 48.79%, zero fallback occurred and runtime ratio was 0.9282. The delta remains telemetry, not an acceptance requirement.

## Why the production promotion is rejected

The accepted Phase 10 result depends on information produced by exact clue allocation and downstream repair. Structural rank-only retention cannot always predict which candidate will win the complete panel-first comparison. Increasing the width after inspecting a stability failure would tune on a locked holdout and violate the repository protocol.

The result is therefore:

- research architecture retained on `main`;
- deterministic tests and checkpoints retained;
- all positive and negative evidence retained;
- browser default remains `off`;
- no Phase 10 behavior or ownership change;
- no width tuning against `v8-stability-058`;
- no claim that structural pre-filtering preserves exact output.

## Reproduction

Deterministic contracts:

```bash
node tools/preallocation-structural-frontier-test-v1.cjs
node tools/preallocation-repair-potential-test-v1.cjs
node tools/preallocation-ranked-frontier-test-v1.cjs
node tools/preallocation-filter-test-v1.cjs
```

Manual corpus diagnostic:

```bash
SCANWORD_PREALLOCATION_CONCURRENCY=4 \
SCANWORD_PREALLOCATION_FILTER_RUNTIME_RATIO=1.05 \
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER_WIDTH=96 \
SCANWORD_PREALLOCATION_MIN_CALL_REDUCTION=0.40 \
  node tools/preallocation-filter-checkpoint-v1.cjs \
  research/baselines/seed-sets/development-20.json \
  research-output/preallocation-structural-frontier/filter-development-20.jsonl
```

The dedicated workflow keeps the corpus sequence under manual dispatch. The stability diagnostic is expected to return a failed promotion result for the frozen width-96 candidate.

## Next architectural investigation

Do not continue by widening or retuning the structural filter on promotion/stability seeds.

Phase 12 should accelerate exact allocation without skipping candidate states:

```text
profile assignClueTextCellsV2
-> cache geometry-derived clue domains and compatibility data
-> reuse immutable domain work across deterministic restarts
-> add admissible branch-and-bound pruning inside the exact allocator
-> preserve RNG order and exact winning layout
-> compare exact Phase 10 outputs on new development seeds
-> promote only after fresh promotion and stability holdouts
```

Primary acceptance rule: byte-identical selected grid, placed-answer, clue and geometry digests. Runtime and allocator-time reduction are secondary. If exact-preserving internal acceleration is exhausted, a later two-stage approximate allocator may be investigated on newly created seed sets, never by tuning against `v8-stability-058`.
