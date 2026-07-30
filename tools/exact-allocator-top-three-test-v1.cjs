"use strict";

const assert = require("node:assert/strict");

const solver = global.window?.ScanwordSolver;
const core = global.window?.ScanwordCore;
assert(solver, "ScanwordSolver must be loaded by the Node benchmark bootstrap");
assert(core, "ScanwordCore must be loaded by the Node benchmark bootstrap");
assert.equal(typeof solver.assignClueTextCellsV2, "function");
assert.equal(typeof solver.selectExactAllocatorStablePrefixV1, "function");
assert.equal(typeof solver.compareExactAllocatorRankedCandidatesV1, "function");
assert.equal(typeof solver.currentExactAllocatorSelectorV1, "function");
assert.equal(typeof solver.resetExactAllocatorSelectorV1, "function");

const selectStablePrefix = solver.selectExactAllocatorStablePrefixV1;

function ids(values) {
  return values.map((entry) => entry.id);
}

function genericCompare(first, second) {
  return second.rank - first.rank || first.signature.localeCompare(second.signature);
}

const stableTies = Array.from({ length: 8 }, (_, id) => ({ id, rank: 7, signature: "same" }));
assert.deepEqual(ids(selectStablePrefix(stableTies, 3, genericCompare)), [0, 1, 2]);
assert.deepEqual(ids(stableTies), [0, 1, 2, 3, 4, 5, 6, 7], "selector must not mutate the input array");

for (let length = 0; length <= 96; length += 1) {
  for (let round = 0; round < 16; round += 1) {
    const random = core.makeRandom(`phase-12-top-three-primitive:${length}:${round}`);
    const values = Array.from({ length }, (_, id) => ({
      id,
      rank: Math.floor(random() * 9),
      signature: String.fromCharCode(97 + Math.floor(random() * 5)),
    }));
    const expected = [...values].sort(genericCompare).slice(0, 3);
    assert.deepEqual(ids(selectStablePrefix(values, 3, genericCompare)), ids(expected));
  }
}

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

function normalizedGrid(state) {
  return state.grid.map((row) => row.map((cell) => ({
    type: cell.type,
    char: cell.char ?? null,
    slotIds: [...(cell.slotIds || [])],
    directions: [...(cell.directions || [])],
    footprintId: cell.footprintId ?? null,
    clues: (cell.clues || []).map((clue) => ({
      slotId: clue.slotId,
      direction: clue.direction,
      text: clue.text,
      answer: clue.answer,
      textRow: clue.textRow ?? null,
      textCol: clue.textCol ?? null,
      externalText: Boolean(clue.externalText),
      arrowRow: clue.arrowRow ?? null,
      arrowCol: clue.arrowCol ?? null,
      textCells: (clue.textCells || []).map((target) => [target.row, target.col]),
    })),
  })));
}

function normalizedLayout(layout) {
  return {
    externalClueTexts: layout.externalClueTexts,
    clueTextCells: layout.clueTextCells,
    footprints: layout.footprints.map((footprint) => ({
      id: footprint.id,
      slotId: footprint.slotId,
      arrowRow: footprint.arrowRow,
      arrowCol: footprint.arrowCol,
      cells: footprint.cells.map((cell) => [cell.row, cell.col]),
    })),
  };
}

function runAllocator(mode, seed, restarts) {
  process.env.SCANWORD_EXACT_ALLOCATOR_PROFILE = "off";
  process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR = mode;
  solver.resetExactAllocatorSelectorV1();
  const sourceRandom = core.makeRandom(seed);
  let randomDraws = 0;
  const state = makeState();
  const layout = solver.assignClueTextCellsV2(state, () => {
    randomDraws += 1;
    return sourceRandom();
  }, restarts);
  return {
    layout: normalizedLayout(layout),
    grid: normalizedGrid(state),
    randomDraws,
    telemetry: { ...solver.currentExactAllocatorSelectorV1() },
  };
}

let rankedCandidates = 0;
let comparatorCalls = 0;
for (const restarts of [1, 2, 7, 12]) {
  for (let seedIndex = 0; seedIndex < 12; seedIndex += 1) {
    const seed = `phase-12-top-three-layout:${restarts}:${seedIndex}`;
    const canonical = runAllocator("off", seed, restarts);
    const candidate = runAllocator("linear-top-three", seed, restarts);
    assert.deepEqual(candidate.layout, canonical.layout, `${seed}: layout mismatch`);
    assert.deepEqual(candidate.grid, canonical.grid, `${seed}: grid mismatch`);
    assert.equal(candidate.randomDraws, canonical.randomDraws, `${seed}: RNG draw mismatch`);
    assert.equal(candidate.telemetry.calls, 1);
    assert.equal(candidate.telemetry.fallbacks, 0);
    assert.equal(candidate.telemetry.errors, 0);
    assert(candidate.telemetry.rankedCandidates > 0);
    assert(candidate.telemetry.comparatorCalls > 0);
    rankedCandidates += candidate.telemetry.rankedCandidates;
    comparatorCalls += candidate.telemetry.comparatorCalls;
  }
}

process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR = "off";
solver.resetExactAllocatorSelectorV1();
solver.assignClueTextCellsV2(makeState(), core.makeRandom("phase-12-top-three-off"), 2);
assert.equal(solver.currentExactAllocatorSelectorV1().calls, 0, "off mode must not record selector calls");

console.log(JSON.stringify({
  ok: true,
  exactLayoutCases: 48,
  rankedCandidates,
  comparatorCalls,
}));
