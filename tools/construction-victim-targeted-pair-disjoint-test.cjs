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
  id: 21,
  answer: "МОСТ",
  hasExactClue: true,
  clueRow: 0,
  clueCol: 4,
  cells: [{ row: 1, col: 4 }],
  direction: "down",
};
const anchors = [
  { id: 22, answer: "А", hasExactClue: true, clueRow: 1, clueCol: 0, cells: [{ row: 1, col: 1 }], direction: "right" },
  { id: 23, answer: "У", hasExactClue: true, clueRow: 1, clueCol: 2, cells: [{ row: 1, col: 3 }], direction: "right" },
  { id: 24, answer: "Я", hasExactClue: true, clueRow: 2, clueCol: 4, cells: [{ row: 2, col: 4 }], direction: "down" },
];
const structural = {
  rows: 3,
  cols: 5,
  grid: [
    [cell("panel"), cell("panel"), cell("panel"), cell("panel"), cell("panel")],
    [cell("panel"), cell("letter", { char: "А", slotIds: [22], directions: ["right"] }), cell("panel"), cell("letter", { char: "У", slotIds: [23], directions: ["right"] }), cell("letter", { char: "М", slotIds: [21], directions: ["down"] })],
    [cell("panel"), cell("panel"), cell("panel"), cell("panel"), cell("letter", { char: "Я", slotIds: [24], directions: ["down"] })],
  ],
  placed: [victim, ...anchors],
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
  placed: [...anchors],
  clueFootprints: [],
};
rolled.grid[1][4] = cell("panel");

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
  clueRow: 0,
  clueCol: 3,
  clueKey: "0:3",
  direction: "down",
  startRow: 1,
  startCol: 3,
  length: 2,
  cells: [{ row: 1, col: 3 }, { row: 2, col: 3 }],
  regionLetterKeys: ["2:3"],
  regionLetterKeySet: new Set(["2:3"]),
  forbiddenLetterKeys: [],
  existingIntersections: 1,
  signature: "down:0,3:1,3:2",
  baseDomain: [{ answer: "УМ", clue: "Способность мыслить", hasExactClue: true, weakFill: false, lexicalQuality: 90 }],
};

window.ScanwordClosedFill = {
  extractResidualRegions: () => [{
    id: 2,
    size: 2,
    cells: [{ row: 2, col: 1 }, { row: 2, col: 3 }],
    boundaryWords: [21],
  }],
  buildPatternIndex: () => ({}),
  enumerateRegionSlots: () => [slotA, slotB],
  measureCoverage: coverage,
};
window.ScanwordSolver = {
  generateTargetedVictimVariants: () => ({ states: [], telemetry: { statesAccepted: 0 } }),
  stripClueLayoutForTargetedVictim: () => structural,
  rollbackInlineWord: () => rolled,
  resultMetrics(state) {
    return {
      validation: { valid: true },
      components: state.placed.length >= 5 ? 1 : 3,
    };
  },
};
window.SCANWORD_TARGETED_SHORT_FILL = [];

require(path.resolve(__dirname, "..", "construction-victim-targeted-pair.js"));
const result = window.ScanwordSolver.generateTargetedVictimVariants(structural, [
  slotA.baseDomain[0],
  slotB.baseDomain[0],
], {
  maxRegions: 1,
  maxVictimsPerRegion: 1,
  focusRadius: 2,
  maxFocusCells: 20,
  maxSlotCandidates: 20,
  maxDomainSize: 20,
  atomicMaxSlots: 4,
  atomicValuesPerSlot: 2,
  atomicMaxVariants: 2,
  atomicFinalists: 2,
  maxVariants: 4,
});

const atomic = result.states.find((state) => state.targetedVictimMeta?.atomicPairRelation === "disjoint");
assert.ok(atomic, "a valid disjoint atomic repair must be preserved");
assert.deepEqual(atomic.targetedVictimMeta.pairAnswers, ["АД", "УМ"]);
assert.equal(atomic.grid[2][1].type, "letter");
assert.equal(atomic.grid[2][3].type, "letter");
assert.equal(result.telemetry.atomicPair.disconnectedRollbackRelaxed, 1);
assert.equal(result.telemetry.atomicPair.crossingSlotPairs, 0);
assert.equal(result.telemetry.atomicPair.disjointSlotPairs, 1);
assert.equal(result.telemetry.atomicPair.statesAccepted, 1);
assert.equal(window.ScanwordSolver.resultMetrics(atomic).components, 1);

console.log(JSON.stringify({
  disjointAtomicPair: true,
  temporaryComponents: 3,
  finalComponents: window.ScanwordSolver.resultMetrics(atomic).components,
  pairAnswers: atomic.targetedVictimMeta.pairAnswers,
  telemetry: result.telemetry.atomicPair,
}));
