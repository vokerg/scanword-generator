#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
REMOTE_URL="${SCANWORD_REPOSITORY_URL:-$(git -C "${ROOT}" remote get-url origin)}"
TOOLING_REF="${SCANWORD_TOOLING_REF:-}"
OUTPUT_DIR="${SCANWORD_RESEARCH_OUTPUT:-${ROOT}/research-output/closed-fill}"
CLONE_DIR="${TMPDIR:-/tmp}/scanword-closed-fill-fresh-$$"

if [[ -z "${TOOLING_REF}" ]]; then
  TOOLING_REF="$(git -C "${ROOT}" symbolic-ref --quiet --short HEAD || true)"
fi
if [[ -z "${TOOLING_REF}" ]]; then
  TOOLING_REF="main"
fi

cleanup() {
  rm -rf "${CLONE_DIR}"
}
trap cleanup EXIT

mkdir -p "${OUTPUT_DIR}"

echo "Creating a fresh shallow clone of ${TOOLING_REF}..."
git clone \
  --quiet \
  --depth 1 \
  --branch "${TOOLING_REF}" \
  "${REMOTE_URL}" \
  "${CLONE_DIR}"

if ! git -C "${CLONE_DIR}" rev-parse --is-shallow-repository | grep -qx true; then
  echo "Expected a shallow clone, but Git reports a complete clone." >&2
  exit 1
fi

SCANWORD_RESEARCH_OUTPUT="${OUTPUT_DIR}" \
  bash "${CLONE_DIR}/research/closed-fill/reproduce.sh" smoke

node "${CLONE_DIR}/tools/research-reference-audit.cjs" \
  | tee "${OUTPUT_DIR}/reference-audit.json"

printf '\nFresh-clone preservation smoke passed.\nTooling ref: %s\nOutput:      %s\n' \
  "${TOOLING_REF}" \
  "${OUTPUT_DIR}"
