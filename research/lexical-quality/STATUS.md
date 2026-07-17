# Status of the lexical-repair checkpoint

The experiments in this directory are retained in full as research history and as the secondary editorial-cleanup pipeline.

The primary/default direction moved to [`../vocabulary-first/README.md`](../vocabulary-first/README.md) after the experiments established that:

- local repair can remove formulaic short answers without geometry loss;
- placement penalties and pre-downstream Pareto selection do not solve dense fill;
- residual panels and structural two-letter slots remain unchanged by same-geometry repair;
- unresolved searches are dominated by empty lexical domains rather than exhausted CSP node budgets.

The default CI gate is now the identical-seed pre-construction vocabulary A/B. The repair checkpoint remains available as an archived/manual gate and will be applied after dense construction.
