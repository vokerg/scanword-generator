# Canonical continuation handoff

Last updated: 2026-08-11

Read this file first in a new chat or coding session.

Phase 12 algorithm experimentation is complete. The initial productization sequence, CI lifecycle cleanup, release-package consolidation, frozen-v8 corpus hardening and baseline real-browser interaction acceptance are complete. Do not reopen those tracks merely to continue phase numbering or increase CI check count.

Current production checkpoint before this handoff update:

```text
main: 9865062af5a232b7c9bf498308f2a987aa558793
```

That squash merge (#53) extended the packaged-site Chrome smoke to exercise real interaction wiring. The exact-main post-merge `Static release package` run also completed successfully through real Chrome.

## Current production baseline

Production pipeline:

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

Canonical browser/runtime flags:

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

Production ownership:

```text
active generateBest owner: construction-pipeline-v1
execution owner:            direct-production-stage-runtime-v2
rollback owner:             legacy-wrapper-chain
```

Pinned productization seed:

```text
seed:         release-smoke-v1
answers:      45
panels:       5
components:   1
gridDigest:   85bc32d1dd4be3b511ee73a91d0b66ada9c26cb7e32f140fc1a7fbce868d34ef
placedDigest: 0d2971716aaadeced6a2b93459bc45b93b5271f9f921fa59e7009b7de7208d11
```

This seed is a regression checkpoint, not a tuning target.

## Static distribution baseline

Initial reproducible distribution was published from:

```text
source commit: 97847f42412e81af88194c7cfe04261f2a2f7c0a
tag:           static-97847f42412e
publish run:   31457512985
```

Published payload:

```text
payload files:  86
payload bytes:  19,327,085
bundle digest:  636c695161dce8b9cef793564a4fe0aaa0c09c486172ec03b91c0b7df770d820
archive bytes:  1,893,063
archive SHA256: d17b15189aa4ce596af5ebb36cc8692f35d9ea8299cf35a01caa2f122b489927
```

Assets:

```text
scanword-generator-site.tar.gz
scanword-generator-site.tar.gz.sha256
release-manifest.json
```

The workflow guarantee is commit-addressed reproducibility with a SHA-derived tag and fail-on-duplicate behavior. The GitHub release object itself was reported as `immutable: false`; do not describe platform-level release immutability unless repository settings change.

GitHub Pages is not configured. There is no canonical live Pages URL. If live hosting becomes a product requirement, deploy the already-verified static bundle rather than creating a second packaging path.

## Productization and hardening history

Initial productization:

```text
#32 release/production robustness        708f5b33cfd79b5d2655607ba0bd1cc9d828b51b
#33 UI generation/failure/export state   38c0e4df30cdf93207925b4de3b099ef5eeb5ed8
#34 print-safe A5                        d3fd0f77ca6f40bb8d4c9d065ad90af79425c3d1
#35 reproducible static bundle           632ffaaee46f0da60112998363ff0f3802cb79b9
#36 commit-addressed release publishing  97847f42412e81af88194c7cfe04261f2a2f7c0a
```

CI/browser/release hardening:

```text
#37 handoff + stale Phase11 coupling            cfae37eac624c4a5dd384f0b725ff31bfb9b8920
#38 Phase10 corpus checkpoints manual-only      f91650ab42034240ccae2f55111d2595036816f9
#39 Phase12 default-off index decoupling        6e29c996c800b4d4a9f42f61a63588bcc7690867
#40 default-off research checkpoints manual     69ec9df94fd4369a90d936ca4c31dc9b3a20fd61
#41 CI lifecycle contract                       b6dede503c16840a057213a9366dd73788c27d4b
#42 first real-browser release smoke             1a84dec71d35b5dae82ddf1f04995c84fcab2843
#43 handoff refresh                              e24ae815aa196397a0b780903c42471d43babc1c
#44 legacy quality gate lifecycle                4b5167d56841d4e3f2d1408ce2e43c6577bd8c8b
#45 obsolete write-capable lexicon bot retired  efa86d6700382bee25465932244f5d89659980a5
#46 vocabulary milestone comparisons manual     3881d0418e4014a105319ba5d4ef060e7ae64979
#47 retained vocabulary research comparisons    c6f61cb71ee7a8eb6a374a2353fea16af2928797
#48 dead lexical ref triggers retired            e6167beb8f35ba1c5a4ad9588e0e6a78b5d3cbda
#49 dead lexical branch pushes retired           73dbe5ea1f52b5fa28a0f25c61e74389755e9ed5
#50 static + browser release acceptance merged  fd223c7701a438ec141d0e2dd7eaf6c9c1e840e6
#51 frozen v8 corpus contract / upstream split  56b124daf5122e08e472a5d5f53ebd3cd8104a10
#52 production-promotion corpus replays manual  08e4335f820974d809bb34b4fe3ac0fbfa03d6e4
#53 real-browser interaction wiring              9865062af5a232b7c9bf498308f2a987aa558793
```

## Current CI lifecycle contract

`tools/ci-lifecycle-contract-v1.cjs` protects the intended ownership model.

Important boundaries:

- `Production release smoke` owns `index.html`, canonical browser defaults, browser/Node load-order parity, production ownership/rollback and pinned output.
- `Static release package` owns one exact package tree for reproducibility, manifest/dependency verification, HTTP smoke and real-browser acceptance.
- The standalone browser workflow was retired in #50; do not reintroduce a second package build/browser workflow without a concrete requirement.
- Closed/default-off research workflows do not own index-only PRs.
- Historical development/promotion/stability corpus replays are manual-only where the experiment/promotion has already been accepted or rejected.
- Production-promotion unit/ownership/stage/selector contracts remain automatic on relevant module changes; frozen multi-seed evidence is manual-only.
- `Arrowword quality gate` is path-scoped to the legacy modules it actually tests. Its deterministic contracts remain automatic; historical corpus diagnostics are manual-only.
- Retained vocabulary/editorial research keeps lightweight/unit contracts automatic, while multi-seed comparisons are manual-only.
- Seven archived lexical report/sweep workflows are manual-only. Deleted research branch names must not silently reactivate them.
- The obsolete write-capable lexicon workflow is retired.
- Workflow `contents: write` is allowed only for `publish-static-release.yml`, and only its guarded publish job should hold that permission.
- `V8 baseline lock` remains intentionally heavy and automatic only when frozen baseline/config/seed-hash tooling changes. Do not weaken it merely for CI speed.

Do not restore automatic historical corpus fan-out merely to increase check count.

## Frozen v8 corpus boundary

PR #51 discovered a real reproducibility limitation in the old live rebuild harness.

The frozen committed v8 corpus remains:

```text
version:                    8
entries:                    40,966
entities:                   1,469
invalid entries:            0
duplicate answers:          0
exact clue coverage:        100%
generic-template checkpoint 13.84%
```

Automatic corpus CI now checks the committed v8 baseline and builder syntax without downloading mutable upstream datasets.

The previous automatic live rebuild used current GeoNames dump URLs. During #51, current upstream data failed the frozen canonical source assumption for:

```text
sourceId: 1668341
frozen canonical answer: ТАЙБЕЙ
```

The committed manifest does not contain immutable checksums/snapshot identifiers for those source dumps. Therefore rebuilding against today's mutable upstreams is **not** proof of exact historical reproducibility and must not silently retune frozen v8.

Current policy:

- `Vocabulary baseline 1.1 corpus contract` automatically verifies committed v8 and builder invariants.
- `live-upstream-rebuild` is `workflow_dispatch` only.
- A live-upstream failure is diagnostic source-drift evidence, not permission to alter the accepted corpus.
- Do not tune or rewrite frozen v8 to satisfy today's GeoNames data without a new explicit corpus/product requirement and new evaluation boundary.

## Current real-browser release acceptance

`Static release package` now builds one exact site and applies all package-level acceptance to that same tree:

```text
byte-identical rebuild proof
-> exact static build
-> release-manifest/dependency closure verification
-> local HTTP asset/404 smoke
-> installed Chrome/Chromium discovery
-> real-browser generation + A5/UI/export interaction smoke
-> deployable artifact + machine-readable evidence
```

PR #53 exact-head evidence:

```text
run:          31525725116
browser:      Google Chrome 150.0.7871.128
payload:      86 files / 19,327,085 bytes
bundle digest 636c695161dce8b9cef793564a4fe0aaa0c09c486172ec03b91c0b7df770d820
status:       selected attempt 106 · searched 120 · valid · 1 component · active 96.8%
answer rows:  47
```

Real-browser interactions verified:

```text
Reveal answers changes SVG              yes
Reveal off restores prior SVG           yes
export seed remains generated-state-bound yes
A5 148 x 210 export metadata            yes
SVG download handler                    yes
JSON download handler                   yes
Print A5 handler                        yes
```

The exact-main post-merge package run for `9865062af5a232b7c9bf498308f2a987aa558793` also completed successfully through the Chrome interaction step and artifact uploads.

Browser DOM digests are run/browser evidence, not cross-version invariants.

## Normal product/release checks

Fast deterministic contracts:

```bash
node tools/ui-release-state-test-v1.cjs
node tools/a5-print-contract-test-v1.cjs
node tools/production-release-smoke-v1.cjs
node tools/static-release-reproducibility-test-v1.cjs
node tools/build-static-release-v1.cjs release/scanword-generator-site
node tools/verify-static-release-v1.cjs release/scanword-generator-site
node tools/static-release-http-smoke-v1.cjs release/scanword-generator-site
node tools/ci-lifecycle-contract-v1.cjs
```

Core generator checks:

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

Retained Phase 11 module checks when those modules change:

```bash
node tools/preallocation-structural-frontier-test-v1.cjs
node tools/preallocation-repair-potential-test-v1.cjs
node tools/preallocation-ranked-frontier-test-v1.cjs
node tools/preallocation-filter-test-v1.cjs
```

The real-browser interaction smoke runs through the `Static release package` workflow because it needs an installed browser and the exact packaged tree.

## What to do next

There is no pre-approved Phase 13 algorithm experiment and there are currently no open GitHub issues.

CI lifecycle cleanup is now mature enough that further optimization should require a measured trigger/cost/coverage problem. Do not keep narrowing workflows merely because they are old.

Default next work should be driven by a concrete product/release need:

1. **Live-host activation only if required.** GitHub Pages is still unconfigured. If a canonical live URL becomes necessary, resolve repository/account Pages enablement or choose another static host, deploy the exact verified bundle, and add post-deploy HTTP checks.
2. **Concrete browser/interaction defect.** Extend real-browser acceptance only when a reproducible download, print, interaction, accessibility or browser-specific defect is identified. Do not create a broad compatibility matrix without evidence of need.
3. **Concrete product/UI defect.** Add a failing regression test first, then change UI/runtime behavior.
4. **Measured generator defect or new product requirement.** Only reopen layout/allocator/corpus research with a reproducible user-facing defect, measurable acceptance criterion and fresh tuning/holdout boundary.

Do not invent Phase 13 solely to continue experiment numbering.

## Phase 11 closure remains unchanged

Phase 11 width-96 pre-allocation structural filter remains retained, reproducible and default-off.

Canonical stability regression:

```text
v8-stability-058: 4 panels -> 7 panels
```

Do not tune against that seed or locked Phase 11 promotion/stability seeds.

Frozen Phase 11 implementation/evidence ref:

```text
5f8fb8dcb446d1dcf13e1ef5fc1cee0c151906e4
refs/heads/research/archive-phase-11-preallocation-structural-filter-evidence-2026-07-25
```

## Phase 12 closure remains unchanged

Accepted exact linear top-three selector:

```text
5db8d25de2422ce1f62d21d4ffa2da7bb3cafb3e
refs/heads/research/archive-phase-12-linear-top-three-selector-2026-07-30
```

Production-promotion head:

```text
77616780d11377f1fe44bcd74d17ba8f0adb5cae
refs/heads/research/archive-phase-12-exact-selector-default-promotion-2026-07-31
```

Accepted selector evidence:

| seed set | exact/audit parity | allocator ratio | total ratio | errors |
| --- | ---: | ---: | ---: | ---: |
| development-20 | 20/20 | 0.9590 | 0.9940 | 0 |
| promotion-50 | 50/50 | 0.9500 | 0.9900 | 0 |
| stability-100 | 100/100 | 0.9562 | 0.9891 | 0 |

Exact rollback remains:

```text
SCANWORD_EXACT_ALLOCATOR_SELECTOR=off
```

Accepted default-off occupancy evidence:

```text
a5826b4e250ce39da71edfa0aa715c12146c7992
refs/heads/research/archive-phase-12-exact-occupancy-index-implementation-2026-07-31

2036baa507a829abd6966a74911d0aee06054984
refs/heads/research/archive-phase-12-exact-occupancy-index-stability-2026-08-04
```

| seed set | exact/audit parity | allocator ratio | total ratio | errors |
| --- | ---: | ---: | ---: | ---: |
| development-20 | 20/20 | 0.8845 | 0.9937 | 0 |
| promotion-50 | 50/50 | 0.8814 | 0.9856 | 0 |
| stability-100 | 100/100 | 0.9012 | 0.9830 | 0 |

Occupancy remains default-off:

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

Archive refs are evidence, not active development branches.

## Non-negotiable rules

- `main` is the only long-lived development branch.
- Branch from exact current `main` for every logical change.
- Squash-merge each completed logical block into `main`.
- Archive refs are immutable evidence, not active development lines.
- Do not weaken complete validation.
- Do not replace the canonical lexicographic objective with a weighted score.
- Do not tune on promotion or stability seeds.
- Preserve negative results and harness defects.
- Preserve exact allocator RNG/output contracts unless a future requirement explicitly changes them.
- The pinned productization release seed is a regression checkpoint, not a tuning target.
- Static release artifacts must be derivable from the exact source commit and pass dependency-closure/checksum/HTTP/browser verification.
- Mutable upstream corpus diagnostics must not silently alter frozen v8.
