"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const selectorFile = path.join(root, "construction-exact-allocator-top-three-v1.js");
const selectorSource = fs.readFileSync(selectorFile);
const selectorGitBlobSha = crypto.createHash("sha1")
  .update(`blob ${selectorSource.length}\0`)
  .update(selectorSource)
  .digest("hex");

assert.equal(
  selectorGitBlobSha,
  "e1b970fc1b1c87ad8655141162d10bc4aaf22f0d",
  "default promotion must not modify the accepted selector implementation",
);

const solver = global.window?.ScanwordSolver;
const core = global.window?.ScanwordCore;
const bootstrap = global.window?.SCANWORD_NODE_BENCHMARK_BOOTSTRAP;
assert(solver, "ScanwordSolver must be loaded by the Node benchmark bootstrap");
assert(core, "ScanwordCore must be loaded by the Node benchmark bootstrap");
assert(bootstrap, "Node benchmark bootstrap metadata must be available");
assert.equal(bootstrap.exactAllocatorSelectorDefault, "linear-top-three");
assert.equal(process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR, "linear-top-three");
assert.equal(typeof solver.assignClueTextCellsV2, "function");
assert.equal(typeof solver.exactAllocatorSelectorModeV1, "function");
assert.equal(typeof solver.currentExactAllocatorSelectorV1, "function");
assert.equal(typeof solver.resetExactAllocatorSelectorV1, "function");

function panelCell() {
  return { type: "panel", char: null, slotIds: [], directions: [], clues: [] };
}

function clueCell(clues) {
  return {
    type: "clue",
    char: null,
    slotIds: [],
    directions: [],
    clues: clues.map((clue) => ({ ...clue })),
  };
}

function makeState() {
  const rows = 7;
  const cols = 7;
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, panelCell));
  grid[2][2] = clueCell([
    { slotId: 1, direction: "right", text: "Короткая подсказка", answer: "ТЕСТ" },
    { slotId: 2, direction: "down", text: "Другая точная подсказка", answer: "СЛОВО" },
  ]);
  grid[4][4] = clueCell([
    { slotId: 3, direction: "right", text: "Длинная подсказка для четырёх клеток текста", answer: "ПРИМЕР" },
  ]);
  return {
    rows,
    cols,
    grid,
    placed: [],
    usedAnswers: new Set(),
    clueFootprints: [],
  };
}

function compact(state, layout) {
  return {
    layout,
    grid: state.grid,
    clueFootprints: state.clueFootprints,
  };
}

const previousSelector = process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR;
const previousDetail = process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR_DETAIL;
process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR_DETAIL = "summary";

try {
  assert.equal(solver.exactAllocatorSelectorModeV1(), "linear-top-three");
  solver.resetExactAllocatorSelectorV1();
  const defaultState = makeState();
  const defaultLayout = solver.assignClueTextCellsV2(
    defaultState,
    core.makeRandom("phase-12-selector-default-promotion"),
    12,
  );
  const defaultTelemetry = solver.currentExactAllocatorSelectorV1();
  assert.equal(defaultTelemetry.calls, 1);
  assert.equal(defaultTelemetry.fallbacks, 0);
  assert.equal(defaultTelemetry.errors, 0);

  process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR = "off";
  solver.resetExactAllocatorSelectorV1();
  assert.equal(solver.exactAllocatorSelectorModeV1(), "off");
  const rollbackState = makeState();
  const rollbackLayout = solver.assignClueTextCellsV2(
    rollbackState,
    core.makeRandom("phase-12-selector-default-promotion"),
    12,
  );
  assert.equal(solver.currentExactAllocatorSelectorV1().calls, 0);
  assert.deepEqual(
    compact(defaultState, defaultLayout),
    compact(rollbackState, rollbackLayout),
    "production default must be byte-equivalent to explicit full-sort rollback",
  );

  process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR = "linear-top-three";
  solver.resetExactAllocatorSelectorV1();
  const explicitState = makeState();
  const explicitLayout = solver.assignClueTextCellsV2(
    explicitState,
    core.makeRandom("phase-12-selector-default-promotion"),
    12,
  );
  assert.deepEqual(compact(defaultState, defaultLayout), compact(explicitState, explicitLayout));
  assert.equal(solver.currentExactAllocatorSelectorV1().calls, 1);
} finally {
  process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR = previousSelector;
  if (previousDetail == null) delete process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR_DETAIL;
  else process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR_DETAIL = previousDetail;
}

console.log(JSON.stringify({
  ok: true,
  selectorGitBlobSha,
  nodeDefault: bootstrap.exactAllocatorSelectorDefault,
  rollback: "off",
}));
