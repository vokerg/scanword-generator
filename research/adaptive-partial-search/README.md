# Phase 7 — adaptive bounded-search budget

## Decision

Phase 7 accepts an **opt-in adaptive budget policy** for the Phase 6 bounded partial-state beam. The exact complete baseline remains mandatory; only the additive beam probes are reduced.

The browser default remains unchanged:

```text
SCANWORD_PARTIAL_SEARCH=off
```

The accepted experiment is enabled with:

```text
SCANWORD_PARTIAL_SEARCH=beam
SCANWORD_PARTIAL_SEARCH_POLICY=adaptive
```

The adaptive policy is not promoted to the browser default. It retains the Phase 6 structural gains at materially lower cost, but runtime is still about 34% above the unchanged generator and the zero-panel rate remains 0%.

## Policy

For each seed the outer vocabulary portfolio first evaluates the complete exact 2,500- and 3,500-entry baseline candidates.

The beam plan is then deterministic:

1. if the best complete baseline has fewer than five residual panels, skip every beam probe;
2. otherwise probe the active-set limit that produced the best baseline;
3. also probe the second limit only when its baseline is at least three panels worse, or when panels are equal and its editorial penalty is at least 80 points better;
4. use 48 additive attempts per selected limit, over attempt IDs 120–167;
5. preserve the exact complete baseline on every complete tie.

This keeps search attribution clean: no baseline attempt is removed or repartitioned.

## Accepted evidence

```text
accepted implementation: 036e4c6d2296e57d9fb679c42728203178110f97
archive ref:             refs/heads/research/archive-phase-7-adaptive-search-evidence-2026-07-23
workflow run:            30009055813
artifact ID:             8564773554
artifact digest:         sha256:3d9a9b95c0a528d47418e71a18a8b91556d327c6f240bf3a4458de614bc84b46
per-seed digest:         sha256:e9584019ab0b49dc72c5700141029fc4183fa1232edac1794ff70956b3f4231e
aggregate digest:        sha256:86f0a3bded3f8d1e7da2fa1fed4236a1369924c5005538fcb65af12de8ba9029
environment digest:      sha256:e5851399488ce032e4a1d000f1aa8d9b9a691a1c1bf1f6c35097d5ee336aafb4
acceptance digest:       sha256:24863cfe8bb5e711db0646b79ef4cb165c81d35d0932657202cb4c5f42a769be
run-manifest digest:     sha256:885298f4157f1a74a512fff38aec7ebe567f8e85047ffd5cb28e42b8e9f4ae95
console digest:          sha256:8da040811b50f93b63a2d67aef36d39b3a0b2a58f406894dd85bce821fdbf707
```

Only the locked Phase 2 `development-20` set was used.

## Development-20 results

| metric | off | shadow | adaptive beam |
| --- | ---: | ---: | ---: |
| completed | 20/20 | 20/20 | 20/20 |
| invalid / disconnected | 0 / 0 | 0 / 0 | 0 / 0 |
| average panels | 5.30 | 5.30 | **4.85** |
| maximum panels | 7 | 7 | **6** |
| zero-panel rate | 0% | 0% | 0% |
| average answers | 47.45 | 47.45 | 47.20 |
| average crossings | 51.70 | 51.70 | 51.70 |
| average clue-text cells | 60.55 | 60.55 | 60.65 |
| average external clues | 33.45 | 33.45 | 33.50 |
| average two-letter answers | 5.20 | 5.20 | **5.05** |
| average editorial penalty | 408.90 | 408.90 | **363.35** |
| average runtime | 26.48 s | 42.20 s | 35.59 s |
| runtime ratio | 1.0000 | 1.5937 | **1.3438** |

Acceptance recorded:

- seven complete-objective improvements;
- six panel improvements;
- zero complete-objective regressions;
- five selected grids with complete beam ancestry;
- 22 active-set probes executed and 18 skipped;
- 720 probe attempts instead of Phase 6's 1,200;
- 4,590 expanded nodes instead of 7,644;
- maximum beam result of six panels instead of seven.

## Panel improvements

| seed | off | adaptive beam |
| --- | ---: | ---: |
| `v8-dev-002` | 5 | 3 |
| `v8-dev-006` | 7 | 6 |
| `v8-dev-007` | 6 | 5 |
| `v8-dev-013` | 7 | 5 |
| `v8-dev-015` | 7 | 6 |
| `v8-dev-018` | 6 | 4 |

The new `v8-dev-013` win replaces the Phase 6 `v8-dev-005` change. The latter had come from an extra baseline fallback rather than beam ancestry; the 48-attempt adaptive window intentionally removes that confound.

Some panel improvements use fewer answers because residual panels are the first canonical objective. These changes are disclosed but are not objective regressions.

## Shadow boundary

Phase 7 does not optimize the all-attempt shadow diagnostic. Shadow still evaluates the original Phase 6 sampling policy and retains 20/20 exact output parity. Its accepted runtime ceiling therefore remains 1.65. The new 1.45 ceiling applies only to the adaptive complete-pipeline beam portfolio.

## Reproduction

```bash
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/adaptive-partial-search-test.cjs

SCANWORD_PARTIAL_SEARCH_CONCURRENCY=2 \
SCANWORD_PARTIAL_SEARCH_MODES=off,shadow,beam \
SCANWORD_PARTIAL_SEARCH_POLICY=adaptive \
SCANWORD_PARTIAL_SEARCH_RATE=0.20 \
SCANWORD_PARTIAL_SEARCH_START=14 \
SCANWORD_PARTIAL_SEARCH_DEPTH=4 \
SCANWORD_PARTIAL_SEARCH_BEAM=4 \
SCANWORD_PARTIAL_SEARCH_BRANCHING=3 \
SCANWORD_PARTIAL_SEARCH_NODES=48 \
SCANWORD_PARTIAL_SEARCH_BEAM_ATTEMPTS=48 \
SCANWORD_PARTIAL_SEARCH_BEAM_OFFSET=120 \
  node tools/bounded-partial-search-checkpoint.cjs \
  research-output/adaptive-partial-search 20

node tools/adaptive-partial-search-acceptance-v1.cjs \
  research-output/adaptive-partial-search
```

## Remaining boundary

Phase 7 makes bounded search affordable enough for controlled opt-in investigation. It does not make it the browser default and does not complete the pipeline migration. The next phase moves production execution from the historical cumulative wrapper chain into one direct, explicitly ordered stage runtime while requiring exact complete-result parity.
