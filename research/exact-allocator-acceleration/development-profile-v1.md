# Phase 12 development profile v1

Status: **accepted profiling evidence; no production optimization**

Exact candidate head:

```text
29f4b8866ba3fb0044e8eb806a00a6b3640faa79
```

Source baseline:

```text
eea3d8ada93eecce535ee4054abc8050d64abc53
```

Frozen seed manifest:

```text
sha256:389647aadef2a55df6f8f7ba3e5dd6c3f26ad86cd9b53030a22f58a9e754d2e9
split: development
seeds: 20
```

Evidence:

```text
workflow run: 30471692977
artifact:     8732246943
artifact sha256:e0b47cfd1bb7f9824a065f865ff6d25b0941f8212b841e78e30ad52c09a838ee
```

Reproduction command:

```bash
SCANWORD_EXACT_ALLOCATOR_PROFILE_CONCURRENCY=4 \
  node tools/exact-allocator-profile-checkpoint-v1.cjs \
  development \
  research-output/exact-allocator-acceleration/development-profile-v1.jsonl
```

## Acceptance result

All frozen development seeds retained byte-identical selected outputs.

| metric | result |
| --- | ---: |
| exact grid, placed, clue and geometry digest parity | 20 / 20 |
| valid, connected and exact-clue-only | 20 / 20 |
| profiler parity failures | 0 |
| profiler RNG-draw mismatches | 0 |
| profiler errors | 0 |
| exact allocation calls observed | 10,648 |
| authoritative allocator time observed | 134,511.456 ms |
| replayed allocator time | 172,596.892 ms |
| shadow total-runtime ratio | 1.1777 |

The shadow runtime ratio is profiler overhead, not an optimization result. The authoritative layout is returned before replay and remained byte-identical.

## Work distribution

| measured bucket | elapsed | share |
| --- | ---: | ---: |
| immutable panel-region and footprint-domain setup | 15,647.709 ms | 9.07% |
| randomized restart search | 155,752.498 ms | 90.33% |
| applying the selected layout | 1,031.622 ms | 0.60% |

Restart dominance was stable across all 20 seeds:

| statistic | restart share | setup share |
| --- | ---: | ---: |
| minimum | 89.85% | 8.65% |
| median | 90.27% | 9.03% |
| p95 | 90.77% | 9.37% |
| maximum | 90.88% | 9.46% |

## Restart workload

Across development-20, exact replay performed:

```text
442,103,640 candidate availability checks
188,791,439 available candidates ranked
45,996,341 assignments
305,857,620 random draws
```

Per seed, the median workload was:

```text
531 exact allocation calls
22,087,360 availability checks
9,418,173.5 ranked candidates
15,228,979 random draws
```

## Decision

A cache aimed only at immutable panel-region or footprint-domain construction is deferred as the first optimization. Setup is measurable but consistently below one tenth of allocator core time.

The first bounded optimization hypothesis should target restart work while preserving every RNG draw and comparator result. The preferred initial candidate is an exact top-three selection primitive that replaces full sorting of each jitter-ranked available domain:

```text
consume the same random jitter for every available candidate
-> retain the exact comparator-defined top three in linear time
-> consume the same final selection draw
-> select the byte-identical candidate
```

This candidate is narrow, default-off and independently testable. It must preserve stable tie behavior and exact RNG sequence. An occupied-cell availability index remains the second candidate because availability checks are more numerous, but it has a broader mutation and compatibility surface.

No production feature flag, ownership boundary, validator or canonical comparison changed in this evidence block.
