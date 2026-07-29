"use strict";

const assert = require("node:assert/strict");

const solver = global.window?.ScanwordSolver;
const core = global.window?.ScanwordCore;
assert(solver, "ScanwordSolver must be loaded by the Node benchmark bootstrap");
assert(core, "ScanwordCore must be loaded by the Node benchmark bootstrap");
assert.equal(typeof solver.assignClueTextCellsV2, "function");
assert.equal(typeof solver.currentExactAllocatorProfileV1, "function");
assert.equal(typeof solver.resetExactAllocatorProfileV1, "function");

function panelCell() {
  return {
    type: "panel",
    char: null,
    slotIds: [],
    directions: [],
    clues: [],
  };
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

process.env.SCANWORD_EXACT_ALLOCATOR_PROFILE = "shadow";
process.env.SCANWORD_EXACT_ALLOCATOR_PROFILE_DETAIL = "full";
solver.resetExactAllocatorProfileV1();

const state = makeState();
const layout = solver.assignClueTextCellsV2(
  state,
  core.makeRandom("phase-12-exact-allocator-profile-test"),
  12,
);
const observation = state.grid.__scanwordExactAllocatorProfileV1;
assert(observation, "shadow mode must attach a non-enumerable observation to the allocated grid");
assert.equal(Object.prototype.propertyIsEnumerable.call(state.grid, "__scanwordExactAllocatorProfileV1"), false);
assert.equal(observation.error, null, observation.error || "unexpected replay error");
assert.equal(observation.exactParity, true, "shadow replay must reproduce the exact allocator layout and grid");
assert.equal(observation.randomDrawParity, true, "shadow replay must consume every recorded random draw exactly once");
assert.equal(observation.randomDraws, observation.replayRandomDraws);
assert.equal(observation.restartSummaries.length, 12);
assert.equal(observation.clueItems, 3);
assert(observation.footprintCandidates > 0);
assert(observation.candidateAvailabilityChecks > 0);
assert(layout.externalClueTexts > 0);
assert(layout.clueTextCells > 0);

const aggregate = solver.currentExactAllocatorProfileV1();
assert.equal(aggregate.calls, 1);
assert.equal(aggregate.parityFailures, 0);
assert.equal(aggregate.randomDrawMismatches, 0);
assert.equal(aggregate.errors, 0);
assert.equal(aggregate.last.exactParity, true);

solver.resetExactAllocatorProfileV1();
process.env.SCANWORD_EXACT_ALLOCATOR_PROFILE = "off";
const offState = makeState();
solver.assignClueTextCellsV2(
  offState,
  core.makeRandom("phase-12-exact-allocator-profile-off-test"),
  4,
);
assert.equal(solver.currentExactAllocatorProfileV1().calls, 0, "off mode must not record allocator observations");
assert.equal(offState.grid.__scanwordExactAllocatorProfileV1, undefined);

console.log(JSON.stringify({
  ok: true,
  externalClueTexts: layout.externalClueTexts,
  clueTextCells: layout.clueTextCells,
  footprintCandidates: observation.footprintCandidates,
  candidateAvailabilityChecks: observation.candidateAvailabilityChecks,
  randomDraws: observation.randomDraws,
  setupElapsedMs: observation.setupElapsedMs,
  restartElapsedMs: observation.restartElapsedMs,
}));
