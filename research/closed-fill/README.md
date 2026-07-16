# Closed-Fill Research Checkpoint

> Status: **research snapshot, not production code**  
> Snapshot date: **2026-07-16**  
> Production baseline: `main` at `a50c2c25642032cd4c3a9df13580bf5ea9e916a4`  
> Tested research implementation: `d1c12d8acca31edb3b38775db5166f4f5f59ce04`

This directory records the closed-fill investigation that followed the 0.9 production checkpoint. The work asks a narrow question:

> How far can a deterministic Russian arrowword generator reduce residual panel cells while preserving a connected answer graph, reviewed clues, structural validity, and bounded lexical quality?

The answer at this checkpoint is useful but incomplete. The research pipeline reduces residual panels substantially and remains structurally valid, but it does not reach zero panels and it does not yet satisfy the proposed lexical-quality target.

## Why this is merged as research

The experimental branch contains more than two hundred incremental commits and many wrapper-style solver extensions. Merging that branch directly would:

- replace a compact production path with an unstable experimental pipeline;
- make the default browser generator slower and harder to reason about;
- preserve historical dead ends as active runtime code;
- blur the distinction between a proven production checkpoint and an open research result.

Instead, `main` contains this research package, while the exact tested implementation is preserved on the immutable branch:

```text
research/closed-fill-snapshot-2026-07-16
```

That branch points to:

```text
d1c12d8acca31edb3b38775db5166f4f5f59ce04
```

The package in `main` provides:

- a stable description of the research question;
- measured results and limitations;
- a chronological experiment log;
- an architecture review and next-step proposal;
- a machine-readable manifest;
- a reproducibility script;
- a manual GitHub Actions workflow that checks out the exact snapshot SHA.

No research module is loaded by the production browser application, and the existing 0.9 behavior remains unchanged.

## Headline results

### Production indexed baseline

The indexed-retrieval checkpoint on `main` produced, over 100 deterministic seeds:

- 100 / 100 structurally valid grids;
- 15.42 average residual panels;
- 10–20 residual panels;
- 44.63 average answers;
- 1.43 seconds average generation time;
- one answer component, no accidental runs, and no fallback clues.

### Final research snapshot

The final snapshot produced, over the enforced 100-seed checkpoint:

- 100 / 100 structurally valid grids;
- **6.78 average residual panels**;
- **3–11 residual panels**;
- 45.25 average answers;
- 49.72% average raw-letter coverage;
- 10.61 seconds average generation time;
- one answer component, reviewed clues only, and the preserved production gate passing on every seed.

This is a large coverage improvement, but it is not a zero-panel solver.

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

The replacement stayed connected and structurally valid. It also introduced one additional weak filler, which exposes the current lexical-quality bottleneck.

## What worked

The strongest improvements came from changing the order of decisions, not from adding more random restarts:

1. retain several complete candidates instead of one greedy path;
2. rank candidates primarily by residual panels and raw letter cells;
3. repack clue footprints exactly or with bounded search;
4. remove a strategically selected boundary answer and rebuild locally;
5. validate every accepted state with the unchanged full-grid validator;
6. preserve the original generator as a monotonic fallback.

The research confirms that answer placement and clue-space allocation are coupled constraints. Treating clue layout as a cosmetic final pass creates small panel islands that are often impossible to repair later.

## What did not work

Several technically valid ideas had little or no effect in the real pipeline:

- **Post-layout local CSP:** residual regions were already fragmented into impossible one- and two-cell shapes.
- **Straight insertion polish:** saturated grids rarely had a legal non-weak insertion domain.
- **Direct isolated-cross repair:** it found potential junctions but could not construct legal slot pairs.
- **Rollback followed by the old direct-cross search:** the two stages were geometrically incompatible; rollback removed letters required by the direct-cross precondition.
- **More restarts alone:** they improved candidate diversity but did not escape the same topology and lexical traps reliably.

## Current bottleneck

The remaining problem is no longer candidate retrieval. It is the combination of:

- early greedy topology decisions;
- scarce domains for highly constrained short patterns;
- clue-anchor feasibility;
- global answer-graph connectivity;
- lexical quality.

The final 100-seed telemetry reported `weakFillBudget` values from 5 to 16, with a mean of 10.62. No seed was at or below the proposed checkpoint-B cap of two weak fillers. Tail repair cannot solve that alone because the lexical debt is accumulated during initial portfolio construction.

## Recommended next stage

The next implementation should be a clean solver architecture rather than another wrapper around `generateBest`:

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

A candidate with one fewer panel but eight additional weak entries must not automatically delete a lexically clean alternative.

## Reproduction

From a checkout of this repository:

```bash
bash research/closed-fill/reproduce.sh smoke
bash research/closed-fill/reproduce.sh tail
bash research/closed-fill/reproduce.sh full
```

The script creates a temporary detached worktree at the exact snapshot commit. It does not run the research code from `main`.

The same checks are available through the manually triggered workflow:

```text
.github/workflows/research-closed-fill.yml
```

## Documents

- [`RESULTS.md`](RESULTS.md) — metrics, evidence, and quality limits.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — approaches, failure modes, and proposed solver design.
- [`EXPERIMENT_LOG.md`](EXPERIMENT_LOG.md) — chronological record of the investigation.
- [`manifest.json`](manifest.json) — immutable SHAs, workflow runs, and summary data.
- [`reproduce.sh`](reproduce.sh) — deterministic local runner.

## Research boundary

This checkpoint demonstrates a reproducible improvement from roughly fifteen residual panels to roughly seven. It does **not** demonstrate automatic publication-quality construction, universal zero-panel fill, or acceptable lexical quality on every grid. Those remain open engineering goals.