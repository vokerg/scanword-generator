"use strict";

const assert = require("node:assert/strict");

const solver = global.window?.ScanwordSolver;
const core = global.window?.ScanwordCore;
assert(solver, "ScanwordSolver must be loaded by the Node benchmark bootstrap");
assert(core, "ScanwordCore must be loaded by the Node benchmark bootstrap");
assert.equal(typeof solver.assignClueTextCellsV2, "function");
assert.equal(typeof solver.buildExactAllocatorOccupancyIndexV1, "function");
assert.equal(typeof solver.createExactAllocatorOccupancyStateV1, "function");
assert.equal(typeof solver.availableExactAllocatorCandidatesV1, "function");
assert.equal(typeof solver.invalidateExactAllocatorCandidateV1, "function");
assert.equal(typeof solver.currentExactAllocatorOccupancyV1, "function");
assert.equal(typeof solver.resetExactAllocatorOccupancyV1, "function");

const buildIndex = solver.buildExactAllocatorOccupancyIndexV1;
const createState = solver.createExactAllocatorOccupancyStateV1;
const availableIndexed = solver.availableExactAllocatorCandidatesV1;
const invalidateIndexed = solver.invalidateExactAllocatorCandidateV1;

function candidate(id, keys, score = 0) {
  return {
    id,
    keys: [...keys],
    cells: keys.map((key) => {
      const [row, col] = key.split(":").map(Number);
      return { row, col };
    }),
    score,
  };
}

function canonicalAvailable(item, occupied) {
  return item.candidates.filter((entry) => entry.keys.every((key) => !occupied.has(key)));
}

function candidateIds(values) {
  return values.map((entry) => entry.id);
}

const primitiveItems = [
  {
    candidates: [
      candidate("a0", ["0:0"]),
      candidate("a1", ["0:1", "0:2"]),
      candidate("a2", ["1:0"]),
      candidate("a3", ["2:2", "2:3"]),
    ],
  },
  {
    candidates: [
      candidate("b0", ["0:2"]),
      candidate("b1", ["1:1"]),
      candidate("b2", ["2:3"]),
      candidate("b3", ["3:3"]),
    ],
  },
  {
    candidates: [
      candidate("c0", ["0:0", "1:0"]),
      candidate("c1", ["1:1", "1:2"]),
      candidate("c2", ["3:3", "3:4"]),
    ],
  },
];
const primitiveSnapshot = JSON.stringify(primitiveItems);
const primitiveIndex = buildIndex(primitiveItems);
const primitiveState = createState(primitiveIndex);
const primitiveOccupied = new Set();

for (let itemIndex = 0; itemIndex < primitiveItems.length; itemIndex += 1) {
  assert.deepEqual(
    candidateIds(availableIndexed(primitiveItems[itemIndex], itemIndex, primitiveIndex, primitiveState)),
    candidateIds(canonicalAvailable(primitiveItems[itemIndex], primitiveOccupied)),
  );
}

for (const selected of [primitiveItems[0].candidates[1], primitiveItems[1].candidates[1], primitiveItems[2].candidates[2]]) {
  invalidateIndexed(selected, primitiveIndex, primitiveState);
  for (const key of selected.keys) primitiveOccupied.add(key);
  for (let itemIndex = 0; itemIndex < primitiveItems.length; itemIndex += 1) {
    assert.deepEqual(
      candidateIds(availableIndexed(primitiveItems[itemIndex], itemIndex, primitiveIndex, primitiveState)),
      candidateIds(canonicalAvailable(primitiveItems[itemIndex], primitiveOccupied)),
    );
  }
}
assert.equal(JSON.stringify(primitiveItems), primitiveSnapshot, "occupancy primitives must not mutate domains");
assert.throws(() => buildIndex([{ candidates: [{ keys: null }] }]), /missing keys/);
assert.throws(() => createState(primitiveIndex, 0), /positive uint32/);

let primitiveDomains = 0;
let primitiveAssignments = 0;
for (let round = 0; round < 64; round += 1) {
  const random = core.makeRandom(`phase-12-occupancy-primitive:${round}`);
  const items = Array.from({ length: 8 }, (_, itemIndex) => ({
    candidates: Array.from({ length: 24 }, (_, candidateIndex) => {
      const width = 1 + Math.floor(random() * 4);
      const keys = new Set();
      while (keys.size < width) keys.add(`k${Math.floor(random() * 32)}`);
      return candidate(`${round}:${itemIndex}:${candidateIndex}`, [...keys], random() * 100);
    }),
  }));
  const snapshot = JSON.stringify(items);
  const index = buildIndex(items);
  const occupancy = createState(index);
  const occupied = new Set();
  primitiveDomains += items.reduce((sum, item) => sum + item.candidates.length, 0);

  for (let step = 0; step < 16; step += 1) {
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      assert.deepEqual(
        candidateIds(availableIndexed(items[itemIndex], itemIndex, index, occupancy)),
        candidateIds(canonicalAvailable(items[itemIndex], occupied)),
        `round ${round}, step ${step}, item ${itemIndex}`,
      );
    }
    const itemIndex = Math.floor(random() * items.length);
    const available = canonicalAvailable(items[itemIndex], occupied);
    if (!available.length) continue;
    const selected = available[Math.floor(random() * available.length)];
    invalidateIndexed(selected, index, occupancy);
    for (const key of selected.keys) occupied.add(key);
    primitiveAssignments += 1;
  }
  assert.equal(JSON.stringify(items), snapshot, `round ${round}: index mutated domains`);
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

function runAllocator(occupancyMode, seed, restarts) {
  process.env.SCANWORD_EXACT_ALLOCATOR_PROFILE = "off";
  process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR = "linear-top-three";
  process.env.SCANWORD_EXACT_ALLOCATOR_SELECTOR_DETAIL = "summary";
  process.env.SCANWORD_EXACT_ALLOCATOR_OCCUPANCY = occupancyMode;
  process.env.SCANWORD_EXACT_ALLOCATOR_OCCUPANCY_DETAIL = "full";
  solver.resetExactAllocatorSelectorV1();
  solver.resetExactAllocatorOccupancyV1();
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
    selector: { ...solver.currentExactAllocatorSelectorV1() },
    occupancy: { ...solver.currentExactAllocatorOccupancyV1() },
  };
}

let candidateLookups = 0;
let invalidations = 0;
for (const restarts of [1, 2, 7, 12]) {
  for (let seedIndex = 0; seedIndex < 12; seedIndex += 1) {
    const seed = `phase-12-occupancy-layout:${restarts}:${seedIndex}`;
    const canonical = runAllocator("off", seed, restarts);
    const indexed = runAllocator("indexed", seed, restarts);
    assert.deepEqual(indexed.layout, canonical.layout, `${seed}: layout mismatch`);
    assert.deepEqual(indexed.grid, canonical.grid, `${seed}: grid mismatch`);
    assert.equal(indexed.randomDraws, canonical.randomDraws, `${seed}: RNG draw mismatch`);
    assert.equal(canonical.occupancy.calls, 0);
    assert.equal(indexed.occupancy.calls, 1);
    assert.equal(indexed.occupancy.fallbacks, 0);
    assert.equal(indexed.occupancy.errors, 0);
    assert.equal(indexed.occupancy.detail, "full");
    assert(indexed.occupancy.candidateReferences > 0);
    assert(indexed.occupancy.candidateLookups > 0);
    assert(indexed.occupancy.invalidations > 0);
    assert.equal(indexed.selector.calls, 0, "indexed mode must not execute the wrapped selector allocator");
    candidateLookups += indexed.occupancy.candidateLookups;
    invalidations += indexed.occupancy.invalidations;
  }
}

process.env.SCANWORD_EXACT_ALLOCATOR_OCCUPANCY = "off";
solver.resetExactAllocatorOccupancyV1();
solver.assignClueTextCellsV2(makeState(), core.makeRandom("phase-12-occupancy-off"), 2);
assert.equal(solver.currentExactAllocatorOccupancyV1().calls, 0, "off mode must not record occupancy calls");

console.log(JSON.stringify({
  ok: true,
  primitiveDomains,
  primitiveAssignments,
  exactLayoutCases: 48,
  candidateLookups,
  invalidations,
}));