# Phase 0 — Research preservation and repository integrity

Status: **IN PROGRESS**  
Date: **2026-07-19**  
Branch: `r-and-d/phase-0-research-archive`  
Baseline main commit audited: `f33233519e3e6902bf2eae9c97c4affb83ffab25`

## Question

Can every historically required experiment be reproduced from a fresh clone without relying on GitHub retaining unreachable commit objects?

## Findings

The initial answer was no.

The closed-fill documentation claimed that snapshot commit
`d1c12d8acca31edb3b38775db5166f4f5f59ce04` was anchored in `main`, but GitHub reports no common ancestor between that commit and the audited `main` head.

The first repository-wide audit then found additional 40-character Git commit references embedded in vocabulary-first artifact names. These were not random artifact identifiers: each resolves to a real Git commit. Five are GitHub-generated pull-request test merge commits. Because those merge commits are mutually divergent, preserving only the latest research branch head would not preserve their exact artifact provenance.

## Implemented preservation boundary

The canonical machine-readable inventory is:

```text
research/archive-manifest.json
```

Durable refs:

| Archive ref | Exact tip | Purpose |
| --- | --- | --- |
| `research/archive-closed-fill-2026-07-16` | `d1c12d8acca31edb3b38775db5166f4f5f59ce04` | Closed-fill lineage, including production 0.9 and checkpoint A |
| `research/archive-vocabulary-first-line-2026-07-17` | `192bd78fbb94c1f2e67816ade5ae94e0aacd8d1c` | Vocabulary-first research line and documented underlying commits |
| `research/archive-vocabulary-naive-full-pool-2026-07-17` | `f28ffbbd5b16163bbb14be42b2c091af45602bbb` | Exact naive full-pool test merge used by the artifact |
| `research/archive-vocabulary-balanced-5000-2026-07-17` | `15dd6b349f96fe6d3a572ee54ad3922b02dede76` | Exact balanced-5,000 test merge used by the artifact |
| `research/archive-vocabulary-pool-sweep-2026-07-17` | `7e3a9163e998d2e7cad1c0756488104739d42c9c` | Exact active-pool sweep test merge used by the artifact |
| `research/archive-vocabulary-confirmation-2026-07-17` | `4304e64f11a0184be5b00c6c42d09d47659fbf0f` | Exact vocabulary confirmation test merge used by the artifact |
| `research/archive-vocabulary-confirmation-39586-2026-07-17` | `ec0337e792466e08a1d1b44121db5d88792adba0` | Exact 39,586-entry confirmation test merge |

The vocabulary-first line ref also preserves these documented ancestors:

```text
87a2d2bb5dfc4933d295aa6bd738cc359ca0712f
53957dc8518d5fa1632e6c749ec6b56d2a234acb
5d383ae65df2a58b3ed264af07b145c4bb414c92
192bd78fbb94c1f2e67816ade5ae94e0aacd8d1c
```

Historical branch names remain chronology labels unless `research/archive-manifest.json` explicitly marks them as required refs.

## Implementation summary

- Replaced the false `main`-ancestry check in `research/closed-fill/reproduce.sh` with an explicit archive-ref fetch and exact SHA check.
- Added `research/closed-fill/fresh-clone-smoke.sh` to create a genuinely shallow clone and run the smoke reproduction.
- Added `tools/research-reference-audit.cjs` to inventory 40-character commit SHAs and historical branch names across README, AGENTS, milestones, research records and workflows.
- Made the audit fetch every required ref, verify each exact tip and required ancestor, and fail when any documented commit is unavailable.
- Added the repository-wide archive manifest.
- Updated the closed-fill manifest to schema version 2 with its project-specific preservation model.
- Updated GitHub Actions to run the shallow-clone proof and repository-wide archive audit on pull requests and manual runs.
- Corrected the closed-fill preservation documentation.

## Acceptance criteria

- Every required archive branch resolves to its exact immutable SHA.
- Every documented 40-character commit is fetchable from `main` or a required archive ref.
- The production baseline and checkpoint-A commits are ancestors of the closed-fill archive tip.
- The documented vocabulary research-line commits are ancestors of the vocabulary-first archive tip.
- A fresh depth-1 clone can fetch all archive refs, run deterministic closed-fill primitives and execute the seed-40 probe.
- Production solver behavior and browser defaults are unchanged.

## Evidence

The first closed-fill-only gate succeeded in GitHub Actions run `29699963724` and produced artifact `8446148249`, digest:

```text
sha256:9606b723bcfc0cb6fff431069c31a70bd800f29e7a23b09f5d3375492436f0f1
```

That run exposed the additional vocabulary Git references. The expanded repository-wide gate must complete successfully before this phase returns to `ACCEPTED RESEARCH`.

## Reproduction

```bash
bash research/closed-fill/fresh-clone-smoke.sh
node tools/research-reference-audit.cjs
bash research/closed-fill/reproduce.sh smoke
```

## Decision boundary

Do not merge until the expanded archive-integrity workflow is green on the exact PR head. No solver, corpus, browser-default or generation behavior is changed by this phase.
