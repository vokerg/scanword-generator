# Phase 12 — exact selector production default promotion

Status: **accepted and integrated**

Source merge:

```text
2b0cc035acec736c56860cc07402e789baf8c6db
```

Accepted selector implementation:

```text
5db8d25de2422ce1f62d21d4ffa2da7bb3cafb3e
```

Frozen promotion head:

```text
77616780d11377f1fe44bcd74d17ba8f0adb5cae
refs/heads/research/archive-phase-12-exact-selector-default-promotion-2026-07-31
```

Integrated by PR `#29` as:

```text
125177d5fecdcb1e7a6930bd8f257427093ae7e2
```

## Scope

Promote the already accepted exact linear top-three selector from explicit opt-in to the browser and Node production default without changing the selector algorithm, comparator, RNG consumption, restart schedule, validation, candidate set or canonical output comparison.

## Production contract

```text
absent SCANWORD_EXACT_ALLOCATOR_SELECTOR -> linear-top-three
SCANWORD_EXACT_ALLOCATOR_SELECTOR=linear-top-three -> linear-top-three
SCANWORD_EXACT_ALLOCATOR_SELECTOR=off -> canonical stable full-sort rollback
```

## Accepted evidence

| split | rollback parity | audit parity | allocator ratio | total ratio | fallbacks/errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| development-20 | 20/20 | 20/20 | 0.9603 | 0.9928 | 0/0 |
| promotion-50 | 50/50 | 50/50 | 0.9303 | 0.9827 | 0/0 |
| stability-100 | 100/100 | 100/100 | 0.9600 | 0.9915 | 0/0 |

Stability artifact:

```text
workflow run:    30528183847
artifact:        8755668502
artifact sha256: 781a401fd4a690b5b4f18fa5867b6a67886d4cb49ef20966936914b521127361
exact calls:     53,622
```

The corpus harness used isolated explicit full-sort rollback, absent/default production and shadow-audited default processes. All final output digests, independent allocator layouts and RNG draws matched exactly.

## Decision

Promotion is complete. `linear-top-three` is the production default in browser and Node. Explicit `off` remains the exact full-sort rollback.

No selector tuning occurred during promotion. The accepted implementation remains the frozen Phase 12 selector implementation.
