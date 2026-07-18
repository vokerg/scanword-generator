#!/usr/bin/env bash
set -euo pipefail

SCOPE="${1:-smoke}"
SNAPSHOT_SHA="d1c12d8acca31edb3b38775db5166f4f5f59ce04"
ROOT="$(git rev-parse --show-toplevel)"
WORKTREE="${TMPDIR:-/tmp}/scanword-closed-fill-$$"
OUTPUT_DIR="${SCANWORD_RESEARCH_OUTPUT:-${ROOT}/research-output/closed-fill}"

case "${SCOPE}" in
  smoke|tail|full) ;;
  *)
    echo "Usage: $0 [smoke|tail|full]" >&2
    exit 2
    ;;
esac

cleanup() {
  git -C "${ROOT}" worktree remove --force "${WORKTREE}" >/dev/null 2>&1 || true
  rm -rf "${WORKTREE}"
}
trap cleanup EXIT

mkdir -p "${OUTPUT_DIR}"

echo "Fetching main history containing the anchored research snapshot..."
if git -C "${ROOT}" rev-parse --is-shallow-repository | grep -qx true; then
  git -C "${ROOT}" fetch --quiet --unshallow origin main
else
  git -C "${ROOT}" fetch --quiet origin main
fi

if ! git -C "${ROOT}" cat-file -e "${SNAPSHOT_SHA}^{commit}" 2>/dev/null; then
  echo "Snapshot commit ${SNAPSHOT_SHA} is not available from main history." >&2
  exit 1
fi

if ! git -C "${ROOT}" merge-base --is-ancestor "${SNAPSHOT_SHA}" origin/main; then
  echo "Snapshot commit ${SNAPSHOT_SHA} is not anchored in origin/main." >&2
  exit 1
fi

git -C "${ROOT}" worktree add --quiet --detach "${WORKTREE}" "${SNAPSHOT_SHA}"
cd "${WORKTREE}"

ACTUAL_SHA="$(git rev-parse HEAD)"
if [[ "${ACTUAL_SHA}" != "${SNAPSHOT_SHA}" ]]; then
  echo "Detached worktree is at ${ACTUAL_SHA}, expected ${SNAPSHOT_SHA}" >&2
  exit 1
fi

run_fast_tests() {
  node tools/closed-fill-test.cjs
  node tools/construction-victim-targeted-cross-rollback-test.cjs
  node tools/construction-victim-targeted-cross-relaxed-test.cjs
  node tools/construction-victim-targeted-cross-budget-test.cjs
}

run_seed_40() {
  SCANWORD_TAIL_SEEDS=40 \
    node tools/construction-tail-probe.cjs \
    | tee "${OUTPUT_DIR}/seed-40.jsonl"
}

run_tail() {
  node tools/construction-tail-probe.cjs \
    | tee "${OUTPUT_DIR}/tail-15.jsonl"
}

run_checkpoint() {
  SCANWORD_CHECKPOINT_ENFORCE=1 \
  SCANWORD_CHECKPOINT_CONCURRENCY=2 \
  SCANWORD_ZERO_PANEL_PASS=1 \
  SCANWORD_PORTFOLIO_ATTEMPTS=240 \
  SCANWORD_REPACK_NODES=600000 \
  SCANWORD_REPACK_BRANCH=24 \
  SCANWORD_TARGETED_VICTIM_REGIONS=3 \
  SCANWORD_TARGETED_VICTIM_WORDS=4 \
  SCANWORD_TARGETED_VICTIM_DEPTH=2 \
  SCANWORD_TARGETED_EXACT_VARIANTS=4 \
  SCANWORD_TARGETED_EXACT_REPACK_NODES=120000 \
    node tools/construction-checkpoint.cjs 100 \
    | tee "${OUTPUT_DIR}/checkpoint-100.jsonl"
}

run_fast_tests

case "${SCOPE}" in
  smoke)
    run_seed_40
    ;;
  tail)
    run_tail
    ;;
  full)
    run_tail
    run_checkpoint
    ;;
esac

echo
printf 'Closed-fill research reproduction complete.\nSnapshot: %s\nOutput:   %s\n' "${SNAPSHOT_SHA}" "${OUTPUT_DIR}"
