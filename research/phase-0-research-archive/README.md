# Phase 0 — Research preservation and repository integrity

Status: **ACCEPTED RESEARCH**  
Date: **2026-07-19**  
Branch: `r-and-d/phase-0-research-archive`  
Baseline main commit audited: `f33233519e3e6902bf2eae9c97c4affb83ffab25`

## Question

Can every historically required experiment be reproduced from a fresh clone without relying on GitHub retaining unreachable commit objects?

## Finding

No. The closed-fill documentation claimed that snapshot commit
`d1c12d8acca31edb3b38775db5166f4f5f59ce04` was anchored in `main`, but GitHub reports no common ancestor between that commit and the audited `main` head.

The documented production checkpoint `a50c2c25642032cd4c3a9df13580bf5ea9e916a4` and checkpoint-A commit `17ba4687ffc94af80cd51c11738e8b4396a03b9f` are both ancestors of the closed-fill snapshot. One durable ref can therefore preserve the complete required closed-fill lineage.

## Implemented preservation boundary

Created durable archive branch:

```text
research/archive-closed-fill-2026-07-16
-> d1c12d8acca31edb3b38775db5166f4f5f59ce04
```

Required ancestry:

| Documented object | Relationship | Preservation |
| --- | --- | --- |
| `a50c2c25642032cd4c3a9df13580bf5ea9e916a4` | ancestor of snapshot | archive branch |
| `17ba4687ffc94af80cd51c11738e8b4396a03b9f` | ancestor of snapshot | archive branch |
| `d1c12d8acca31edb3b38775db5166f4f5f59ce04` | archive tip | archive branch with exact-SHA verification |
| `f33233519e3e6902bf2eae9c97c4affb83ffab25` | audited production `main` | `main` |

Historical branch names remain chronology labels unless a manifest explicitly marks them as required refs. Exact reproduction now depends only on refs listed under `preservation.requiredRefs` in `research/closed-fill/manifest.json`.

## Implementation summary

- Replaced the false `main`-ancestry check in `research/closed-fill/reproduce.sh` with an explicit archive-ref fetch and exact SHA check.
- Added `research/closed-fill/fresh-clone-smoke.sh` to create a genuinely shallow clone and run the smoke reproduction.
- Added `tools/research-reference-audit.cjs` to inventory 40-character commit SHAs and historical branch names across README, AGENTS, milestones, research records and workflows.
- Updated the closed-fill manifest to schema version 2 with required refs and ancestry requirements.
- Updated the GitHub Actions workflow to run the shallow-clone proof on pull requests and manual runs.
- Corrected the closed-fill preservation documentation.

## Acceptance criteria

- The archive branch resolves to the exact snapshot SHA.
- The production baseline and checkpoint-A commits are ancestors of the archive tip.
- A fresh depth-1 clone can fetch the archive ref, run deterministic primitives and execute the seed-40 probe.
- The repository reference audit reports no missing required refs or commits.
- Production solver behavior is unchanged.

## Evidence

GitHub Actions run `29699963724` completed successfully on PR #12.

Successful steps:

- JavaScript and shell syntax checks;
- fresh depth-1 clone;
- explicit archive-ref fetch;
- exact snapshot SHA verification;
- deterministic closed-fill primitive tests;
- real seed-40 probe;
- repository historical-reference audit;
- artifact publication.

Artifact:

```text
id:     8446148249
name:   closed-fill-smoke-d1c12d8acca31edb3b38775db5166f4f5f59ce04
digest: sha256:9606b723bcfc0cb6fff431069c31a70bd800f29e7a23b09f5d3375492436f0f1
```

## Reproduction

```bash
bash research/closed-fill/fresh-clone-smoke.sh
node tools/research-reference-audit.cjs
bash research/closed-fill/reproduce.sh smoke
```

## Decision

Phase 0 is accepted as research and is ready for review and squash merge. No solver or browser-default code is changed by this phase. Phase 1 must start from updated `main` only after this PR is merged.
