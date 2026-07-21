# Phase 6 — bounded partial-state search

## Decision

Phase 6 accepts an **opt-in bounded late-placement beam** that retains competing construction states before the dense tail becomes irreversible, then compares beam-influenced and exact baseline results only after the complete production pipeline.

The browser default remains unchanged:

```text
SCANWORD_PARTIAL_SEARCH=off
```

The accepted experiment is enabled with:

```text
SCANWORD_PARTIAL_SEARCH=beam
```

It is not promoted to browser-default behavior because development runtime increases by about 65% and no zero-panel grid was produced. The accepted boundary demonstrates that retained partial states can produce reproducible complete-grid wins without canonical objective regressions.

## Problem

The production generator normally evaluates independent greedy attempts. Each attempt commits one placement at a time and cannot revisit an earlier topology decision. By the time clue allocation and repair expose a bad residual shape, the alternative placement that would have avoided it is gone.

Phase 6 asks whether a small deterministic beam at one selected placement depth can retain materially different topology classes, rather than behaving as a more expensive restart portfolio.

## Historical distinction

`construction-v2.js` already contains a historical beam, but it is not this phase's search:

- it starts from a completed greedy grid;
- it searches residual slots after construction;
- it owns a legacy `generateBest` wrapper.

Phase 6 instead operates at the active `ScanwordSolver.buildAttempt` placement boundary and does not add another `generateBest` wrapper.

## Accepted search

The implementation is `late-placement-beam-v1`.

For a sampled attempt it:

1. builds an explicit partial state to placement 14;
2. expands up to three placement alternatives per parent;
3. retains at most four states per depth;
4. searches four depths;
5. enforces a hard maximum of 48 expanded nodes;
6. deduplicates deterministic structural signatures;
7. prunes states exceeding the bounded weak-fill allowance;
8. completes each finalist greedily with deterministic fork random streams;
9. ranks partial states using structure plus the accepted Phase 5 clue-feasibility estimates;
10. retains the exact original greedy state as fallback.

The implementation deep-clones grids, placed answers, used-answer sets and clue metadata before committing alternatives. Every accepted beam state records its initial, greedy and beam ancestry.

## Modes

### Off

```text
SCANWORD_PARTIAL_SEARCH=off
```

Runs the unchanged production path.

### Shadow

```text
SCANWORD_PARTIAL_SEARCH=shadow
```

Executes the bounded search but always returns the exact original greedy state. This mode proves random-stream and output parity and measures search cost.

### Beam

```text
SCANWORD_PARTIAL_SEARCH=beam
```

Runs the complete exact baseline portfolio plus a bounded beam probe. A beam result can be selected only through the existing complete-pipeline candidate hierarchy.

## Complete-pipeline safety boundary

Attempt-level preference is insufficient. The accepted architecture preserves the full default candidate set and adds beam alternatives:

```text
exact baseline attempts 0–119
+
bounded beam probe attempts 120–179
-> exact clue allocation
-> baseline replay for every replaced beam attempt
-> victim replacement and clue repair
-> editorial repair
-> active-set portfolio comparison
-> complete validation
-> final complete-pipeline selection
```

For every attempt where the beam replaces the greedy state, `construction-bounded-partial-search-fallback-v1.js` replays the exact original random sequence and reconstructs the baseline state. Both states are then independently evaluated by the real clue allocator and downstream repair chain.

The outer vocabulary portfolio always includes the full exact 120-attempt baseline for both 2,500- and 3,500-entry working sets. The beam probe is additive. Therefore a beam candidate cannot remove the default complete result.

Final candidates use the repository's canonical lexicographic objective:

1. fewer residual panels;
2. more answers;
3. more crossings;
4. greater raw-letter coverage;
5. fewer formulaic short answers and lower editorial penalty;
6. deterministic fallback preference for the exact baseline on complete ties.

## Accepted configuration

```text
branch point:          placement 14
beam depth:            4
beam width:            4
branching factor:      3
maximum nodes:         48 per sampled attempt
sample rate:           0.20
baseline attempts:     120 per active set
beam probe attempts:   60 per active set
beam attempt IDs:      120–179
active-set limits:     2500,3500
```

Only the locked Phase 2 `development-20` set was used for tuning and acceptance.

## Accepted evidence

```text
accepted implementation: 2c01178849005747f4a2e06876e40a992bb7a7f4
archive ref:             refs/heads/research/archive-phase-6-bounded-search-evidence-2026-07-21
workflow run:            29854808637
artifact ID:             8505251750
artifact digest:         sha256:223c100a5541efe2807300984a869b75d45988dc9d1abeca9b1eac1e5cba86d0
per-seed digest:         sha256:cde9a8233cf553579a4d4487578998ad723d6b5653b1a35675739e058cca07b4
aggregate digest:        sha256:2354349bf4a55efbafcb4545419954fc2196afc1cd694b74832b0945c925bb63
environment digest:      sha256:bd0a85726be10a4d952ebc828d0f515086be41ea2e9cd17026337f6dee6e97b5
acceptance digest:       sha256:23786c2e6b8a02ab55314962b437509941f537dcecdda7532370032a90279606
run-manifest digest:     sha256:1c51012c03e073a060bd3c598e8a9c2d506c41347640fb443b0ea0d3607b7ba9
console digest:          sha256:c71bc678a1222b0b6fc20f04023fbff7a253c57ec8448f60362a71545cf7302b
```

The complete-objective acceptance gate passed with:

- 20/20 valid, connected, exact-clue and checkpoint-passing results in all modes;
- 20/20 exact output parity in shadow mode;
- zero canonical objective regressions in beam mode;
- eight complete-objective improvements;
- six panel-count improvements;
- five selected results with explicit beam ancestry;
- all selected beam results carrying at least one recorded beam step.

## Development-20 results

| metric | off | shadow | beam |
| --- | ---: | ---: | ---: |
| completed | 20/20 | 20/20 | 20/20 |
| invalid / disconnected | 0 / 0 | 0 / 0 | 0 / 0 |
| average panels | 5.30 | 5.30 | **4.90** |
| maximum panels | 7 | 7 | 7 |
| zero-panel rate | 0% | 0% | 0% |
| average answers | 47.45 | 47.45 | 47.35 |
| average crossings | 51.70 | 51.70 | 51.85 |
| average clue-text cells | 60.55 | 60.55 | 60.90 |
| average external clues | 33.45 | 33.45 | 33.65 |
| average two-letter answers | 5.20 | 5.20 | 5.30 |
| average formulaic short answers | 0.00 | 0.00 | 0.00 |
| average editorial penalty | 408.90 | 408.90 | 361.25 |
| average runtime | 20.35 s | 31.71 s | 33.55 s |
| runtime ratio | 1.0000 | 1.5579 | 1.6484 |

### Panel improvements

| seed | off | beam |
| --- | ---: | ---: |
| `v8-dev-002` | 5 | 3 |
| `v8-dev-005` | 6 | 5 |
| `v8-dev-006` | 7 | 6 |
| `v8-dev-007` | 6 | 5 |
| `v8-dev-015` | 7 | 6 |
| `v8-dev-018` | 6 | 4 |

There were no panel regressions.

Some panel wins use fewer answers because residual-panel count is the first canonical objective. This occurred on `v8-dev-006`, `v8-dev-015` and `v8-dev-018`. These are not objective regressions.

Two selected results had higher editorial penalty in isolation:

- `v8-dev-000`: unchanged panels and answers, but crossings increased from 49 to 53;
- `v8-dev-005`: panels decreased from six to five.

Both remain improvements under the documented complete objective hierarchy.

## Search telemetry

### Shadow

- 4,800 attempts observed;
- 932 sampled attempts;
- 33,233 expanded nodes;
- 11,120 branch rounds;
- seven duplicate states removed;
- 95 weak-fill states pruned;
- maximum depth four and beam width four;
- 3,707 completed finalists;
- 709 local beam preferences;
- exact baseline output returned for all 4,800 attempts.

### Beam probe

- 1,200 probe attempts observed across two active sets and 20 seeds;
- 215 sampled attempts;
- 7,644 expanded nodes;
- 2,556 branch rounds;
- 35 weak-fill states pruned;
- maximum depth four and beam width four;
- 854 completed finalists;
- 172 beam attempts preferred locally and returned to downstream evaluation;
- five final selected grids descended from recorded beam branches.

This demonstrates that the gain came from retained alternatives rather than only from additional independent restarts.

## Rejected and superseded attempts

### Late branch point with zero expansion

The first configuration branched around placement 24–26. The alternative builder had usually stalled by then, so the search expanded zero nodes while a weak unit test still passed. The test was tightened to require actual nodes and depth, and the branch point moved to placement 14.

This established that a nominal beam is not evidence of partial-state search unless telemetry proves that alternatives were expanded.

### Attempt-level beam selection

```text
implementation head: 5344bc43efdb6541545430d51728d6b403e7359d
workflow run:        29852044618
artifact ID:         8504003541
artifact digest:     sha256:52967260e1cb04624f0fdf04d8f65a1bab005b4f4839be146ac27fc7814f49ee
```

On five seeds it improved average panels from 5.0 to 4.4, but one seed regressed from three panels to seven, two seeds lost answers, runtime increased by about 51%, and final ancestry was lost through downstream wrappers.

This established that pre-allocation state ranking cannot safely replace a complete baseline result.

### Split baseline/beam frontier

```text
implementation head: 2956370e1c0cf8ff63ac0322bf93294700fb6af2
workflow run:        29853421982
artifact ID:         8504439454
artifact digest:     sha256:fc4f2b7fcd5db014a145340c14dedb243c1f169e3620aee401a58b5a400e3be4
```

This divided attempt IDs 0–119 between separate baseline and beam complete pipelines. It removed panel regressions and found two five-seed wins, but one win came from retaining a different baseline frontier rather than from a beam branch. Runtime ratio was about 1.61.

This established that a changed restart partition can masquerade as a search gain. The final experiment therefore runs the complete exact baseline and adds an isolated beam probe.

### Five-seed full-baseline probe

```text
implementation head: 56201b4b716d2137f06f7d74705636a13a7bd6d9
workflow run:        29854194615
artifact ID:         8504739630
artifact digest:     sha256:80a0bd9a87ff5fd7400c69f04a403c7fbd913494de68586fc6196691eaa11645
```

The full baseline plus 60-attempt probe produced one ancestry-proven 5→3 panel win with no panel or answer regressions on five seeds. Runtime ratio was about 1.57. This configuration was frozen and expanded to development-20.

## Tests and reproduction

```bash
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/bounded-partial-search-test.cjs

SCANWORD_PARTIAL_SEARCH_CONCURRENCY=2 \
SCANWORD_PARTIAL_SEARCH_MODES=off,shadow,beam \
SCANWORD_PARTIAL_SEARCH_RATE=0.20 \
SCANWORD_PARTIAL_SEARCH_START=14 \
SCANWORD_PARTIAL_SEARCH_DEPTH=4 \
SCANWORD_PARTIAL_SEARCH_BEAM=4 \
SCANWORD_PARTIAL_SEARCH_BRANCHING=3 \
SCANWORD_PARTIAL_SEARCH_NODES=48 \
SCANWORD_PARTIAL_SEARCH_BEAM_ATTEMPTS=60 \
SCANWORD_PARTIAL_SEARCH_BEAM_OFFSET=120 \
  node tools/bounded-partial-search-checkpoint.cjs \
  research-output/bounded-partial-search 20

node tools/bounded-partial-search-acceptance-v1.cjs \
  research-output/bounded-partial-search
```

## Accepted boundary and remaining work

Phase 6 establishes:

- a real bounded deterministic partial-state search;
- exact state ownership and deterministic ancestry;
- exact shadow parity;
- complete baseline fallback for every beam-replaced attempt;
- complete-pipeline comparison instead of local promotion;
- six panel wins and zero canonical objective regressions on development-20;
- evidence that retained alternatives produced five selected final grids.

It does not establish:

- zero-panel generation;
- acceptable production runtime;
- a browser-default search policy;
- promotion or stability performance;
- replacement of the historical wrapper chain.

The feature remains off by default. A later phase may reduce cost by selecting discrepancy points more intelligently, sharing work between baseline and beam candidates, or retaining a bounded complete-pipeline frontier without duplicating wrapper execution.
