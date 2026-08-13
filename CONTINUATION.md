# Canonical continuation handoff

Last updated: 2026-08-13

Read this file first in a new chat or coding session.

Phase 12 algorithm experimentation is complete. Productization, reproducible packaging, CI lifecycle cleanup, frozen-v8 hardening, real-browser acceptance and the current UI/state hardening pass are integrated into `main`.

Current production checkpoint before this handoff update:

```text
main: 343dccb31b6cc69fb23a95e8ab99e00d6ce1e7eb
```

## Production baseline

The generator baseline is unchanged:

```text
40,966-entry attributed corpus v8
-> deterministic 2,500/3,500 working sets
-> indexed construction
-> exact clue allocation with linear top-three selection
-> width-four complete-pipeline frontier
-> full clue/repair/editorial chain
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

Production ownership:

```text
active generateBest owner: construction-pipeline-v1
execution owner:            direct-production-stage-runtime-v2
rollback owner:             legacy-wrapper-chain
```

Pinned release checkpoint:

```text
seed:         release-smoke-v1
answers:      45
panels:       5
components:   1
gridDigest:   85bc32d1dd4be3b511ee73a91d0b66ada9c26cb7e32f140fc1a7fbce868d34ef
placedDigest: 0d2971716aaadeced6a2b93459bc45b93b5271f9f921fa59e7009b7de7208d11
```

Do not tune against this pinned seed.

## Static distribution baseline

Initial reproducible release:

```text
source commit: 97847f42412e81af88194c7cfe04261f2a2f7c0a
tag:           static-97847f42412e
bundle digest: 636c695161dce8b9cef793564a4fe0aaa0c09c486172ec03b91c0b7df770d820
archive SHA256: d17b15189aa4ce596af5ebb36cc8692f35d9ea8299cf35a01caa2f122b489927
```

GitHub Pages is not configured. There is no canonical live Pages URL. If live hosting becomes a requirement, deploy the already-verified static bundle instead of creating another packaging path.

## Current product/UI state

Recent merged hardening:

```text
#57 accessibility/language reconciliation        394dadb2db7d89d6b0412a68efca9aea6201aa7a
#58 structural validation fail-closed            9600642188c410fb596d67dc37d221e364b09298
#59 effective settings follow UI bounds          188172b22b8acfb353cd5a941d0ff15b986097d5
#60 pending settings ownership guard             b4f782babdc23cf62538dac318f93e1767ed2070
#61 exact-selector index trigger cleanup         eb4840a0b1153a651df7142ce361558545d4ab80
#62 rendered answer escaping                     f54c2f2dc8d06507eb34df10d4bff4d392580779
#63 generated SVG role/name                      2cd06c07cd21dbeebd41da46c51b583851e28f00
#64 result-bound JSON generationSettings         56eaaac4fe919117c24a1e2c9d011aca703de9bc
#66 result-table accessible metadata             9ee41c9a9eef8005856ecd50085299946d8e9b43
#67 robust generation failure-message fallback  343dccb31b6cc69fb23a95e8ab99e00d6ce1e7eb
```

PR #55 was superseded by #57. PR #65 was superseded by clean one-commit PR #66.

Required UI behavior now includes:

- prior result/settings are invalidated before a new attempt starts;
- exports/print are disabled while pending and after failure;
- structurally invalid output is rejected before publication/export;
- numeric settings derive bounds from the actual HTML controls and visible controls are normalized to effective values;
- pending editable settings are captured while the preview is busy and restored at completion;
- generation status is a polite atomic live region and the failure boundary is an alert;
- failure detail supports `Error.message`, thrown strings and the generic fallback `Unexpected generation error.` for opaque/blank values;
- generated Russian clue/answer cells declare `lang=ru`;
- clue/answer text is escaped at the HTML boundary while structured export values remain unchanged;
- the result table is named `Assigned answers` and all six headers use `scope=col`;
- preview/download SVG declares `lang=ru`, `xml:lang=ru`, `role=img` and `aria-label="Generated A5 arrowword grid"`;
- JSON export keeps `version: 0.9.0` and adds result-bound `generationSettings` containing `seed`, `cols`, `rows`, `poolSize`, `targetWords`, `clueDensity`;
- historical result objects keep their original settings through a private `WeakMap`; exported metadata is copied, not shared mutable state.

## CI and release ownership

Important current boundaries:

- `Production release smoke` owns canonical browser defaults, browser/Node load-order parity, UI lifecycle/A5, production ownership/rollback and pinned generator output.
- `Static release package` owns one exact package tree for reproducibility, dependency/manifest verification, HTTP smoke and real Chrome acceptance.
- Closed/default-off research workflows do not own index-only product PRs.
- Historical development/promotion/stability corpus replays are manual-only after an experiment/promotion is closed.
- Production deterministic unit/ownership/parity checks remain automatic on relevant implementation changes.
- `Phase 12 exact allocator top-three` no longer triggers on index-only PRs, but still proves browser default, parity and rollback when selector/module/tooling changes.
- Archived lexical report/sweep workflows are manual-only.
- Workflow `contents: write` is allowed only for the guarded static-release publisher.
- `V8 baseline lock` remains intentionally heavy and narrowly scoped to frozen-baseline changes.

Do not restore historical corpus fan-out merely to increase check count.

## Frozen v8 corpus boundary

The committed v8 corpus remains frozen at 40,966 entries with exact clue coverage. PR #51 proved that current mutable upstream data is not an exact historical reconstruction source; GeoNames source `1668341` no longer satisfies the frozen `ТАЙБЕЙ` assumption.

Policy:

- automatic CI verifies committed v8 and builder invariants;
- live-upstream rebuild is manual diagnostic work;
- upstream drift must not silently rewrite frozen v8;
- corpus changes require a new explicit product requirement and evaluation boundary.

## Normal product/release checks

Fast UI/release contracts include:

```bash
node tools/ui-release-state-test-v1.cjs
node tools/ui-effective-settings-test-v1.cjs
node tools/ui-export-settings-test-v1.cjs
node tools/ui-output-escaping-test-v1.cjs
node tools/ui-error-message-contract-v1.cjs
node tools/ui-language-contract-v1.cjs
node tools/ui-pending-settings-guard-test-v1.cjs
node tools/a5-print-contract-test-v1.cjs
node tools/production-release-smoke-v1.cjs
node tools/static-release-reproducibility-test-v1.cjs
node tools/verify-static-release-v1.cjs release/scanword-generator-site
node tools/static-release-http-smoke-v1.cjs release/scanword-generator-site
node tools/ci-lifecycle-contract-v1.cjs
```

Core generator checks remain unchanged, including complete-pipeline, direct-stage runtime, wrapper retirement and exact-selector/occupancy tests.

## What to do next

There is no pre-approved Phase 13 algorithm experiment.

Default next work must come from a concrete product/release signal:

1. live hosting only if a canonical URL becomes necessary;
2. a reproducible UI/browser/print/download/accessibility defect with a regression criterion;
3. public-result mutation hardening only if a concrete mutation hazard is demonstrated without breaking the public/test API;
4. disabled-state visual styling only if a usability/visual acceptance requirement justifies it;
5. generator/corpus work only for a measured user-facing requirement with a fresh tuning/holdout boundary.

Do not invent Phase 13 solely to continue experiment numbering.

## Frozen Phase 11/12 evidence

Phase 11 retained default-off structural filter:

```text
5f8fb8dcb446d1dcf13e1ef5fc1cee0c151906e4
refs/heads/research/archive-phase-11-preallocation-structural-filter-evidence-2026-07-25
```

Known Phase 11 stability regression remains:

```text
v8-stability-058: 4 panels -> 7 panels
```

Accepted Phase 12 linear top-three selector:

```text
5db8d25de2422ce1f62d21d4ffa2da7bb3cafb3e
refs/heads/research/archive-phase-12-linear-top-three-selector-2026-07-30
```

Production-promotion evidence:

```text
77616780d11377f1fe44bcd74d17ba8f0adb5cae
refs/heads/research/archive-phase-12-exact-selector-default-promotion-2026-07-31
```

Default-off occupancy evidence:

```text
a5826b4e250ce39da71edfa0aa715c12146c7992
refs/heads/research/archive-phase-12-exact-occupancy-index-implementation-2026-07-31
2036baa507a829abd6966a74911d0aee06054984
refs/heads/research/archive-phase-12-exact-occupancy-index-stability-2026-08-04
```

Exact rollback remains:

```text
SCANWORD_EXACT_ALLOCATOR_SELECTOR=off
SCANWORD_EXACT_ALLOCATOR_OCCUPANCY=off
```

Accepted Phase 0-12 evidence remains under immutable `research/archive-*` refs and `research/archive-manifest.json`.

## Non-negotiable rules

- `main` is the only long-lived development branch.
- Branch from exact current `main` for each logical change.
- Squash-merge each completed logical block into `main`.
- Archive refs are immutable evidence, not active development lines.
- Do not weaken complete validation.
- Do not replace the canonical lexicographic objective with a weighted score.
- Do not tune on promotion/stability seeds or the pinned productization seed.
- Preserve exact allocator RNG/output contracts unless a future requirement explicitly changes them.
- Static release artifacts must derive from the exact source commit and pass dependency/checksum/HTTP/browser verification.
- Mutable upstream corpus diagnostics must not silently alter frozen v8.
