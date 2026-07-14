"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;

function cell(type, extra = {}) {
  return { type, char: null, slotIds: [], directions: [], clues: [], ...extra };
}

function coverage(grid) {
  const cells = grid.flat();
  return {
    panelCells: cells.filter((item) => item.type === "panel").length,
    letterCells: cells.filter((item) => item.type === "letter").length,
  };
}

const victim = {
  id: 1,
  answer: "КОТ",
  hasExactClue: true,
  clueRow: 0,
  clueCol: 3,
  cells: [{ row: 1, col: 3 }],
  direction: "down",
};
const anchor = {
  id: 2,
  answer: "АР",
  hasExactClue: true,
  clueRow: 1,
  clueCol: 0,
  cells: [{ row: 1, col: 1 }],
  direction: "right",
};
const structural = {
  rows: 3,
  cols: 4,
  grid: [
    [cell("panel"), cell("panel"), cell("panel"), cell("panel")],
    [cell("panel"), cell("letter", { char: "А", slotIds: [2], directions: ["right"] }), cell("panel"), cell("letter", { char: "К", slotIds: [1], directions: ["down"] })],
    [cell("panel"), cell("panel"), cell("panel"), cell("panel")],
  ],
  placed: [victim, anchor],
  clueFootprints: [],
};
const rolled = {
  ...structural,
  grid: structural.grid.map((row) => row.map((item) => ({
    ...item,
    slotIds: [...item.slotIds],
    directions: [...item.directions],
    clues: [],
  }))),
  placed: [anchor],
  clueFootprints: [],
};
rolled.grid[1][3] = cell("panel");

const slotA = {
  clueRow: 0,
  clueCol: 1,
  clueKey: "0:1",
  direction: "down",
  startRow: 1,
  startCol: 1,
  length: 2,
  cells: [{ row: 1, col: 1 }, { row: 2, col: 1 }],
  regionLetterKeys: ["2:1"],
  regionLetterKeySet: new Set(["2:1"]),
  forbiddenLetterKeys: [],
  existingIntersections: 1,
  signature: "down:0,1:1,1:2",
  baseDomain: [{ answer: "АД", clue: "Место мучений", hasExactClue: true, weakFill: false, lexicalQuality: 80 }],
};
const slotB = {
  clueRow: 2,
  clueCol: 0,
  clueKey: "2:0",
  direction: "right",
  startRow: 2,
  startCol: 1,
  length: 3,
  cells: [{ row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }],
  regionLetterKeys: ["2:1", "2:2", "2:3"],
  regionLetterKeySet: new Set(["2:1", "2:2", "2:3"]),
  forbiddenLetterKeys: [],
  existingIntersections: 0,
  signature: "right:2,0:2,1:3",
  baseDomain: [{ answer: "ДОМ", clue: "Жилище", hasExactClue: true, weakFill: false, lexicalQuality: 90 }],
};

window.ScanwordClosedFill = {
  extractResidualRegions: () => [{ id: 1, size: 1, cells: [{ row: 2, col: 2 }], boundaryWords: [1] }],
  buildPatternIndex: () => ({}),
  enumerateRegionSlots: () => [slotA, slotB],
  measureCoverage: coverage,
};
window.ScanwordSolver = {
  generateTargetedVictimVariants: () => ({ states: [], telemetry: { statesAccepted: 0 } }),
  stripClueLayoutForTargetedVictim: () => structural,
  rollbackInlineWord: () => rolled,
  resultMetrics: () => ({ validation: { valid: true }, components: 1 }),
};
window.SCANWORD_TARGETED_SHORT_FILL = [];

require(path.resolve(__dirname, "..", "construction-victim-targeted-pair.js"));
const result = window.ScanwordSolver.generateTargetedVictimVariants(structural, [
  slotA.baseDomain[0],
  slotB.baseDomain[0],
], {
  maxRegions: 1,
  maxVictimsPerRegion: 1,
  atomicMaxSlots: 4,
  atomicValuesPerSlot: 2,
  atomicMaxVariants: 2,
  maxVariants: 2,
});

assert.equal(result.states.length, 1);
assert.equal(result.states[0].targetedVictimMeta.atomicPair, true);
assert.deepEqual(result.states[0].targetedVictimMeta.pairAnswers, ["АД", "ДОМ"]);
assert.equal(result.states[0].grid[2][2].type, "letter");
assert.equal(result.telemetry.atomicPair.statesAccepted, 1);
console.log(JSON.stringify({
  atomicPair: true,
  panelsAfter: coverage(result.states[0].grid).panelCells,
  telemetry: result.telemetry.atomicPair,
}));
