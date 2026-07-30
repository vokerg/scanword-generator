# Phase 12 — exact selector production default promotion

Status: active promotion

Source merge:

```text
2b0cc035acec736c56860cc07402e789baf8c6db
```

Accepted selector implementation:

```text
5db8d25de2422ce1f62d21d4ffa2da7bb3cafb3e
```

## Scope

Promote the already accepted exact linear top-three selector from an explicit opt-in to the browser and Node production default.

The selector implementation, comparator, RNG consumption, restart schedule, validation, candidate set and canonical output comparison must remain unchanged.

## Default contract

```text
absent SCANWORD_EXACT_ALLOCATOR_SELECTOR -> linear-top-three
SCANWORD_EXACT_ALLOCATOR_SELECTOR=linear-top-three -> linear-top-three
SCANWORD_EXACT_ALLOCATOR_SELECTOR=off -> canonical stable full-sort rollback
```

## Required evidence

1. deterministic default-resolution and explicit rollback test;
2. exact output parity between explicit rollback and absent/default mode;
3. independent shadow replay parity in default mode;
4. frozen development-20, promotion-50 and stability-100 checkpoints;
5. browser default, Node fallback and locked baseline configuration alignment;
6. zero selector fallbacks or errors.

## Promotion boundary

This branch may change only default resolution, configuration, tests, promotion tooling, workflows and evidence. It must not tune or rewrite the accepted selector algorithm.
