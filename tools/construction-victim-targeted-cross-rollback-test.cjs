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
    totalCells: cells.length,
    panelCells: cells.filter((item) => item.type === "panel").length,
    letterCells: cells.filter((item) => item.type === "letter").length,
  };
}

const victim = {
  id: 1,
  answer: "РОБОТ",
  hasExactClue: true,
  direction: "right",
  clueRow: 1,
  clueCol: 0,
  cells: [{ row: 1, col: 1 }],
};
const anchor = {
  id: 2,
  answer: "ОСА",
  hasExactClue: true,
  direction: "down",
  clueRow: 0,
  clueCol: 1,
  cells: [{ row: 1, col: 1 }],
};
const structural = {
  rows: 3,
  cols: 4,
  grid: [
    [cell("panel"), cell("panel"), cell("panel"), cell("panel")],
    [cell("panel"), cell("letter", { char: "О", slotIds: [1, 2], directions: ["right", "down"] }), cell("panel"), cell("panel")],
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
rolled.grid[1][1].slotIds = [2];
rolled.grid[1][1].directions = ["down"];

const directState = {
  ...rolled,
  grid: rolled.grid.map((row) => row.map((item) => ({
    ...item,
    slotIds: [...item.slotIds],
    directions: [...item.directions],
    clues: [],
  }))),
  placed: [
    anchor,
    { id: 3, answer: "КОТ", hasExactClue: true, direction: "right", clueRow: 1, clueCol: 0, cells: [{ row: 1, col: 1 }] },
    { id: 4, answer: "ДОМ", hasExactClue: true, direction: "down", clueRow: 0, clueCol: 2, cells: [{ row: 1, col: 2 }] },
  ],
};
directState.grid[1][2] = cell("letter", { char: "О", slotIds: [4], directions: ["down"] });

const previousState = {
  ...structural,
  placed: [{ id: 9, answer: "ПРЕЖНИЙ", hasExactClue: true, direction: "right", clueRow: 2, clueCol: 0, cells: [] }],
};

window.ScanwordClosedFill = {
  extractResidualRegions: () => [{ id: 1, size: 1, cells: [{ row: 1, col: 2 }], boundaryWords: [1, 2] }],
  measureCoverage: coverage,
};
window.ScanwordSolver = {
  generateTargetedVictimVariants: () => ({ states: [previousState], telemetry: { statesAccepted: 1 } }),
  generateDirectCrossVariants(state, pool, options, telemetry) {
    telemetry.regionsConsidered = 1;
    telemetry.junctionRegions = 1;
    telemetry.horizontalSlots = state.placed.length === 1 ? 1 : 0;
    telemetry.verticalSlots = state.placed.length === 1 ? 1 : 0;
    telemetry.slotPairsBuilt = state.placed.length === 1 ? 1 : 0;
    telemetry.statesAccepted = state.placed.length === 1 ? 1 : 0;
    return state.placed.length === 1 ? [directState] : [];
  },
  stripClueLayoutForTargetedVictim: () => structural,
  rollbackInlineWord(state, victimId) {
    return victimId === 1 ? rolled : null;
  },
  resultMetrics(state) {
    return {
      validation: { valid: true },
      components: state === rolled ? 2 : 1,
    };
  },
};

require(path.resolve(__dirname, "..", "construction-victim-targeted-cross-rollback.js"));
const result = window.ScanwordSolver.generateTargetedVictimVariants(structural, [], {
  crossRollbackRegions: 1,
  crossRollbackVictims: 2,
  crossRollbackFinalists: 1,
});
const repaired = result.states.find((state) => state.targetedVictimMeta?.rollbackAssistedCross);
assert.ok(repaired, "rollback must open the blocked direct cross");
assert.equal(repaired.targetedVictimMeta.victimAnswer, "РОБОТ");
assert.equal(repaired.targetedVictimMeta.panelsAfter < repaired.targetedVictimMeta.panelsBefore, true);
assert.equal(repaired.placed.length >= structural.placed.length, true);
assert.equal(result.states.length, 2, "previous and rollback-assisted finalists must survive");
assert.equal(result.telemetry.rollbackAssistedCross.disconnectedRollbacks, 1);
assert.equal(result.telemetry.rollbackAssistedCross.statesAccepted, 1);
assert.equal(result.telemetry.rollbackAssistedCross.finalistsReserved, 1);
console.log(JSON.stringify({
  rollbackAssistedCross: true,
  victim: repaired.targetedVictimMeta.victimAnswer,
  panelsBefore: repaired.targetedVictimMeta.panelsBefore,
  panelsAfter: repaired.targetedVictimMeta.panelsAfter,
  telemetry: result.telemetry.rollbackAssistedCross,
}));