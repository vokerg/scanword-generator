# Closed-Fill Research Checkpoint

> Status: **research snapshot, not an independent production claim**  
> Snapshot date: **2026-07-16**  
> Production baseline: `a50c2c25642032cd4c3a9df13580bf5ea9e916a4`  
> Tested research implementation: `d1c12d8acca31edb3b38775db5166f4f5f59ce04`

This directory records the closed-fill investigation that followed the 0.9 production checkpoint. It asks:

> How far can a deterministic Russian arrowword generator reduce residual panel cells while preserving a connected answer graph, admitted clues, structural validity and bounded lexical quality?

The answer at this checkpoint was useful but incomplete. The research pipeline reduced residual panels substantially and remained structurally valid, but it did not reach zero panels and did not satisfy the proposed lexical-quality target.

## Preservation model

The historical implementation contains more than two hundred incremental commits and many wrapper-style solver extensions. Its conclusions, metrics, manifests and chronology are stored in `main`.

The exact tested implementation is the historical commit:

```text
d1c12d8acca31edb3b38775db5166f4f5f59ce04
```

That commit is **not** an ancestor of current `main`: the research documentation was squash-merged, so the historical implementation and the accepted production line have independent Git histories. Exact reproduction is preserved by the durable archive ref:

```text
refs/heads/research/archive-closed-fill-2026-07-16
```

The archive ref must resolve to the exact snapshot SHA. Reproduction scripts and CI fetch that ref explicitly and fail if it moves. The archive also contains the documented production checkpoint `a50c2c25642032cd4c3a9df13580bf5ea9e916a4` and checkpoint-A commit `17ba4687ffc94af80cd51c11738e8b4396a03b9f` in its ancestry.

The package provides:

- a stable research question and boundary;
- measured results and limitations;
- a chronological experiment log;
- an architecture review and next-step proposal;
- a machine-readable manifest;
- a local reproduction script;
- a fresh shallow-clone smoke test;
- a repository-wide historical-reference audit;
- a GitHub Actions workflow that verifies the archive ref and exact snapshot SHA.

The snapshot is historical. Vocabulary-first 1.0 later promoted a larger corpus and selected parts of the repair pipeline to production.

## Headline results

### Indexed baseline

The indexed-retrieval baseline produced, over 100 deterministic seeds:

- 100 / 100 structurally valid grids;
- 15.42 average residual panels;
- 10–20 residual panels;
- 44.63 average answers;
- 1.43 seconds average generation time;
- one answer component, no accidental runs and no fallback clues.

### Final closed-fill snapshot

The final snapshot produced, over the enforced 100-seed checkpoint:

- 100 / 100 structurally valid grids;
- **6.78 average residual panels**;
- **3–11 residual panels**;
- 45.25 average answers;
- 49.72% average raw-letter coverage;
- 10.61 seconds average generation time;
- one answer component and the preserved structural gate passing on every seed.

This was a large coverage improvement, but not a zero-panel solver.

### High-panel tail

A fixed set of 15 difficult seeds ended with:

- 9.27 average residual panels;
- 112 residual regions;
- 89 isolated one-cell regions;
- maximum residual-region size of 4.

The rollback-aware crossing experiment improved one real seed:

```text
construction-checkpoint-40
panels: 9 -> 8
answers: 44 -> 45
replacement: БЫТ -> ИЛ + ПЕТЛЯ
```

The replacement stayed connected and structurally valid. It introduced one additional weak filler, exposing the lexical-quality bottleneck that later motivated the vocabulary-first program.

## What worked

The strongest improvements came from changing the order of decisions rather than adding random restarts:

1. retain several complete candidates instead of one greedy path;
2. rank candidates primarily by residual panels and raw letter cells;
3. repack clue footprints exactly or with bounded search;
4. remove a selected boundary answer and rebuild locally;
5. validate every accepted state with the unchanged full-grid validator;
6. preserve the original generator as a fallback.

The investigation confirmed that answer placement and clue-space allocation are coupled constraints. Treating clue layout as a cosmetic final pass creates small panel islands that are often impossible to repair later.

## What did not work

- **Post-layout local CSP:** residual regions were already fragmented into impossible one- and two-cell shapes.
- **Straight insertion polish:** saturated grids rarely had a legal non-weak insertion domain.
- **Direct isolated-cross repair:** potential junctions did not yield legal slot pairs.
- **Rollback followed by the old direct-cross search:** rollback removed letters required by the second stage.
- **More restarts alone:** diversity improved, but the same topology and lexical traps remained.

## Bottleneck at the snapshot

The remaining problem combined:

- early greedy topology decisions;
- scarce domains for constrained short patterns;
- clue-anchor feasibility;
- global answer-graph connectivity;
- lexical quality.

The final 100-seed telemetry reported `weakFillBudget` values from 5 to 16, mean 10.62. No seed was at or below the proposed cap of two. Tail repair could not solve lexical debt accumulated during initial construction.

## Recommended architecture

The investigation recommended an explicit pipeline rather than another wrapper around `generateBest`:

```text
structural candidate generation
-> Pareto frontier
-> bounded victim/bundle replacement
-> clue-anchor feasibility
-> exact clue-footprint allocation
-> lexical repair
-> full validation
```

The frontier should retain non-dominated states over at least:

```text
(residual panels, weak-fill count, raw letter cells, answer count, clue area)
```

A candidate with one fewer panel but substantial lexical debt should not automatically delete a cleaner alternative.

## Reproduction

From a checkout of this repository:

```bash
bash research/closed-fill/reproduce.sh smoke
bash research/closed-fill/reproduce.sh tail
bash research/closed-fill/reproduce.sh full
```

The script fetches `research/archive-closed-fill-2026-07-16`, verifies that it resolves to the exact historical snapshot SHA, and creates a detached temporary worktree at that commit. It does not assume the snapshot is part of `main` history.

To prove the process from a newly created shallow clone:

```bash
bash research/closed-fill/fresh-clone-smoke.sh
```

To inventory documented commit and branch references and verify required archive coverage:

```bash
node tools/research-reference-audit.cjs
```

The same checks are available through:

```text
.github/workflows/research-closed-fill.yml
```

## Documents

- [`RESULTS.md`](RESULTS.md) — metrics, evidence and quality limits.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — approaches, failure modes and proposed solver design.
- [`EXPERIMENT_LOG.md`](EXPERIMENT_LOG.md) — chronological record.
- [`manifest.json`](manifest.json) — required archive refs, immutable SHAs, workflow runs and summary data.
- [`reproduce.sh`](reproduce.sh) — deterministic local runner.
- [`fresh-clone-smoke.sh`](fresh-clone-smoke.sh) — shallow-clone preservation proof.

## Research boundary

This checkpoint demonstrated a reproducible improvement from roughly fifteen residual panels to roughly seven. It did **not** demonstrate universal zero-panel fill or acceptable lexical quality on every grid. Those remain open engineering goals beyond the historical snapshot.
