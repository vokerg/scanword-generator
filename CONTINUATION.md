# Canonical continuation handoff

Last updated: 2026-08-11

This file is the first handoff to read in a new chat or coding session. Phase 12 algorithm experimentation is complete, and the initial productization sequence through reproducible packaging/distribution is now complete. Do not treat the old Phase 12 plan or productization items 1-4 as pending work.

Current `main` before this handoff update:

```text
97847f42412e81af88194c7cfe04261f2a2f7c0a
```

That squash merge added the commit-addressed static GitHub prerelease publisher and intentionally carried the `[release-static]` marker. The exact-main publish workflow completed successfully and created the first verified static distribution.

## Current production baseline

Production retains the complete-frontier layout baseline and uses the accepted exact linear top-three allocator selector by default:

```text
40,966-entry attributed corpus v8
-> deterministic 2,500/3,500 working sets
-> indexed construction
-> exact clue allocation with linear top-three selection
-> width-four repair-potential complete-pipeline frontier
-> full clue, repair and editorial chain per finalist
-> complete validation
-> canonical panel-first comparison
```

Canonical flags:

```text
SCANWORD_EXPLICIT_PIPELINE=on
SCANWORD_PIPELINE_STAGE_RUNTIME=explicit
SCANWORD_WRAPPER_INSTALLATION_LOCK=explicit-pipeline-v1
SCANWORD_COMPLETE_PIPELINE_FRONTIER=on
SCANWORD_COMPLETE_PIPELINE_FRONTIER_WIDTH=4
SCANWORD_PREALLOCATION_STRUCTURAL_FRONTIER=off
SCANWORD_FULL_CORPUS_RETRIEVAL=off
SCANWORD_CLUE_FEASIBILITY=off
SCANWORD_PARTIAL_SEARCH=off
SCANWORD_EXACT_ALLOCATOR_SELECTOR=linear-top-three
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
SCANWORD_EXACT_ALLOCATOR_PROFILE=off
```

Production ownership remains:

```text
active generateBest owner: construction-pipeline-v1
execution owner:            direct-production-stage-runtime-v2
rollback owner:             legacy-wrapper-chain
```

Pinned productization release seed:

```text
seed:         release-smoke-v1
answers:      45
panels:       5
components:   1
gridDigest:   85bc32d1dd4be3b511ee73a91d0b66ada9c26cb7e32f140fc1a7fbce868d34ef
placedDigest: 0d2971716aaadeced6a2b93459bc45b93b5271f9f921fa59e7009b7de7208d11
```

The pinned seed is a regression checkpoint, not a tuning target.

## Productization completed

The initial post-Phase-12 productization sequence is integrated into `main`.

### 1. Release/production robustness

PR #32 added `Production release smoke` around the accepted browser runtime:

```text
merge: 708f5b33cfd79b5d2655607ba0bd1cc9d828b51b
```

It locks browser/Node runtime script-order parity, canonical browser flags, production ownership/rollback, UI failure/export contracts, exact A5 renderer geometry and the deterministic `release-smoke-v1` output digests.

### 2. User-facing generation/failure state

PR #33 fixed browser result ownership:

```text
merge: 38c0e4df30cdf93207925b4de3b099ef5eeb5ed8
```

The current result/settings are invalidated before regeneration; SVG/JSON exports are disabled while work is pending or after failure; JSON seed metadata remains bound to the settings that generated the grid; failure remains recoverable. A dependency-free UI lifecycle test covers success, retry, failure and recovery.

### 3. Export/print/A5 quality

PR #34 added the state-bound `Print A5` path:

```text
merge: d3fd0f77ca6f40bb8d4c9d065ad90af79425c3d1
```

Print CSS now locks:

```text
@page A5 portrait
148 x 210 mm
zero page margin
non-print UI hidden
print colors preserved
```

The A5 print contract runs under the release smoke gate.

### 4. Reproducible packaging/distribution

PR #35 added the deterministic static release package:

```text
merge: 632ffaaee46f0da60112998363ff0f3802cb79b9
```

The package builder derives the exact production runtime dependency closure from `index.html`, CSS-local dependencies and `bulk-lexicon/loader.js`. It excludes legacy `app.js`, tools, research, docs and CI content. It emits `release-manifest.json` with source commit, per-file byte sizes/SHA-256 values and aggregate bundle digest. CI requires two independent builds to be byte-identical and re-fetches the packaged runtime over HTTP.

PR #36 added deterministic archive construction and commit-addressed GitHub prerelease publishing:

```text
merge: 97847f42412e81af88194c7cfe04261f2a2f7c0a
publish run: 31457512985
tag: static-97847f42412e
```

Exact-main publication evidence:

```text
payload files:  86
payload bytes:  19,327,085
bundle digest:  636c695161dce8b9cef793564a4fe0aaa0c09c486172ec03b91c0b7df770d820
archive bytes:  1,893,063
archive SHA256: d17b15189aa4ce596af5ebb36cc8692f35d9ea8299cf35a01caa2f122b489927
```

The published prerelease targets exactly `97847f42412e81af88194c7cfe04261f2a2f7c0a` and contains:

```text
scanword-generator-site.tar.gz
scanword-generator-site.tar.gz.sha256
release-manifest.json
```

The workflow uses a SHA-derived tag and refuses to overwrite an existing release/tag. This is a commit-addressed reproducibility guarantee from our workflow; do not describe it as GitHub platform-level release immutability unless that repository setting is separately enabled. The GitHub API reported the first release object's `immutable` field as `false`.

## Live hosting boundary

GitHub Pages is not currently configured for this repository. The verified static package is deployable, but there is no canonical live Pages URL yet.

Do not add a workflow that claims successful Pages deployment without first resolving repository-level Pages enablement. Official Pages auto-enablement for an unconfigured repository requires credentials with administration/pages-write capability beyond the ordinary workflow `GITHUB_TOKEN`.

If live hosting becomes a product requirement, consume the already-verified static bundle rather than inventing a second packaging path.

## What to do next

There is still no pre-approved Phase 13 algorithm experiment. Productization items 1-4 from the previous handoff are complete.

Default next work should be driven by an actual product/release need. The highest-value candidates are:

1. **CI lifecycle cleanup:** narrow historical research/promotion workflows that still launch on unrelated product-facing files such as `index.html`, while retaining production regression gates. Do not weaken `Production release smoke`, `Static release package` or accepted lightweight parity checks.
2. **Live-host activation if required:** enable/configure the chosen static host at repository/account level, then deploy the exact verified bundle and add post-deploy HTTP checks. GitHub Releases already provide the reproducible distribution fallback.
3. **Real-browser acceptance:** add targeted browser-level checks only for concrete gaps not covered by the current fake-DOM/state, print-contract and packaged HTTP tests.
4. **Measured product defects:** only open new layout/allocator research when a reproducible user-facing defect or explicit requirement provides a measurable acceptance criterion and a fresh tuning/holdout boundary.

Do not invent Phase 13 solely to continue experiment numbering.

## Normal product release checks

Fast productization contracts:

```bash
node tools/ui-release-state-test-v1.cjs
node tools/a5-print-contract-test-v1.cjs
node tools/production-release-smoke-v1.cjs
node tools/static-release-reproducibility-test-v1.cjs
node tools/build-static-release-v1.cjs release/scanword-generator-site
node tools/verify-static-release-v1.cjs release/scanword-generator-site
node tools/static-release-http-smoke-v1.cjs release/scanword-generator-site
node tools/build-static-release-archive-v1.cjs \
  release/scanword-generator-site release/scanword-generator-site.tar.gz
```

Core generator checks remain:

```bash
node tools/bulk-lexicon-audit.cjs
node tools/dictionary-count-v3.cjs
node tools/complete-pipeline-frontier-test-v1.cjs
node tools/construction-stage-runtime-test-v2.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/wrapper-retirement-test-v1.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-top-three-test-v1.cjs
NODE_OPTIONS=--require=./tools/node-benchmark-bootstrap-v1.cjs \
  node tools/exact-allocator-occupancy-index-test-v1.cjs
```

Retained Phase 11 checks remain required when touching its modules:

```bash
node tools/preallocation-structural-frontier-test-v1.cjs
node tools/preallocation-repair-potential-test-v1.cjs
node tools/preallocation-ranked-frontier-test-v1.cjs
node tools/preallocation-filter-test-v1.cjs
```

## Phase 11 closure remains unchanged

Phase 11's width-96 pre-allocation structural filter remains retained, reproducible and default-off. Its stability holdout had one canonical regression:

```text
v8-stability-058: 4 panels -> 7 panels
```

Do not tune against that seed or any locked Phase 11 promotion/stability seed.

Frozen Phase 11 implementation:

```text
5f8fb8dcb446d1dcf13e1ef5fc1cee0c151906e4
refs/heads/research/archive-phase-11-preallocation-structural-filter-evidence-2026-07-25
```

## Phase 12 closure remains unchanged

Accepted exact linear top-three selector implementation:

```text
5db8d25de2422ce1f62d21d4ffa2da7bb3cafb3e
refs/heads/research/archive-phase-12-linear-top-three-selector-2026-07-30
```

Production-promotion head:

```text
77616780d11377f1fe44bcd74d17ba8f0adb5cae
refs/heads/research/archive-phase-12-exact-selector-default-promotion-2026-07-31
```

Selector accepted evidence:

| seed set | exact/audit parity | allocator ratio | total ratio | errors |
| --- | ---: | ---: | ---: | ---: |
| development-20 | 20/20 | 0.9590 | 0.9940 | 0 |
| promotion-50 | 50/50 | 0.9500 | 0.9900 | 0 |
| stability-100 | 100/100 | 0.9562 | 0.9891 | 0 |

Exact rollback remains:

```text
SCANWORD_EXACT_ALLOCATOR_SELECTOR=off
```

Accepted default-off occupancy index implementation and stability evidence:

```text
a5826b4e250ce39da71edfa0aa715c12146c7992
refs/heads/research/archive-phase-12-exact-occupancy-index-implementation-2026-07-31

2036baa507a829abd6966a74911d0aee06054984
refs/heads/research/archive-phase-12-exact-occupancy-index-stability-2026-08-04
```

Occupancy accepted evidence:

| seed set | exact/audit parity | allocator ratio | total ratio | errors |
| --- | ---: | ---: | ---: | ---: |
| development-20 | 20/20 | 0.8845 | 0.9937 | 0 |
| promotion-50 | 50/50 | 0.8814 | 0.9856 | 0 |
| stability-100 | 100/100 | 0.9012 | 0.9830 | 0 |

The occupancy index remains default-off:

```text
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
```

Stability-100 concluded Phase 12 algorithm experimentation.

Detailed Phase 12 evidence:

```text
research/exact-allocator-acceleration/README.md
research/exact-allocator-acceleration/linear-top-three-selector.md
research/exact-allocator-acceleration/default-promotion.md
research/exact-allocator-acceleration/occupancy-index.md
docs/milestones/phase-12-exact-allocator-research-closure.md
```

## Archive state

Accepted Phase 0-12 evidence is preserved under immutable `research/archive-*` refs and tracked by `research/archive-manifest.json`.

Phase 12 refs include:

```text
research/archive-phase-12-exact-allocator-profile-instrumentation-2026-07-29
research/archive-phase-12-development-profile-evidence-2026-07-30
research/archive-phase-12-linear-top-three-selector-2026-07-30
research/archive-phase-12-exact-selector-default-promotion-2026-07-31
research/archive-phase-12-exact-occupancy-index-implementation-2026-07-31
research/archive-phase-12-exact-occupancy-index-stability-2026-08-04
```

## Non-negotiable rules

- `main` is the only long-lived development branch.
- Archive refs are immutable evidence, not active development lines.
- Do not weaken complete validation.
- Do not replace the canonical lexicographic objective with a weighted score.
- Do not tune on promotion or stability seeds.
- Preserve negative results and harness defects.
- Preserve exact allocator RNG/output contracts unless a future phase explicitly changes the product requirement.
- The pinned productization release seed is a regression checkpoint, not a tuning target.
- Static release artifacts must be derivable from the exact source commit and pass dependency-closure/checksum/HTTP verification.
- Every merge to `main` must be a squash representing one logical productization, research or documentation block.
