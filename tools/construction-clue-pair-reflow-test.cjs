"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;
process.env.SCANWORD_PAIR_REFLOW_THRESHOLD = "1";
process.env.SCANWORD_PAIR_REFLOW_ADD = "1";
process.env.SCANWORD_PAIR_REFLOW_ROUNDS = "1";

function coverage(grid) {
  const totalCells = grid.length * grid[0].length;
  const letterCells = grid.flat().filter((cell) => cell.type === "letter").length;
  const clueCells = grid.flat().filter((cell) => cell.type === "clue").length;
  const clueTextCells = grid.flat().filter((cell) => cell.type === "clueText" || cell.type === "clueTextContinuation").length;
  const panelCells = totalCells - letterCells - clueCells - clueTextCells;
  return {
    totalCells,
    letterCells,
    clueCells,
    clueTextCells,
    panelCells,
    activeCoverage: (letterCells + clueCells + clueTextCells) / totalCells,
    answerSpaceCoverage: letterCells / Math.max(1, totalCells - clueCells - clueTextCells),
    rawLetterCoverage: letterCells / totalCells,
  };
}

window.ScanwordClosedFill = { measureCoverage: coverage };
window.ScanwordSolver = {
  generateBest() { throw new Error("fixture calls exported primitive directly"); },
  resultMetrics(state) {
    const measured = coverage(state.grid);
    return {
      score: 0,
      intersections: 0,
      doubles: 0,
      components: 1,
      clueTextCells: measured.clueTextCells,
      panelCells: measured.panelCells,
      panelRegions: measured.panelCells ? 1 : 0,
      isolatedPanels: 0,
      largestPanelRegion: measured.panelCells,
      validation: { valid: true, accidentalRuns: [], conflicts: 0, orphanLetters: 0, clueDirectionConflicts: 0 },
    };
  },
  attachValidationReport(result) { return result; },
};

require(path.resolve(__dirname, "..", "construction-clue-pair-reflow.js"));

function cell(type, extra = {}) {
  return { type, char: null, slotIds: [], directions: [], clues: [], ...extra };
}

const clueA = { slotId: 1, direction: "right", text: "Первая достаточно длинная подсказка", answer: "ТЕСТ", externalText: true, textRow: 0, textCol: 1, textCells: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }] };
const clueB = { slotId: 2, direction: "right", text: "Вторая достаточно длинная подсказка", answer: "СЛОВО", externalText: true, textRow: 1, textCol: 4, textCells: [{ row: 1, col: 4 }, { row: 1, col: 3 }, { row: 1, col: 2 }] };
const result = {
  rows: 2,
  cols: 6,
  grid: [
    [cell("clue", { clues: [clueA] }), cell("clueText", { slotIds: [1], footprintId: 1, clues: [{ ...clueA, arrowRow: 0, arrowCol: 0 }] }), cell("clueTextContinuation", { slotIds: [1], footprintId: 1 }), cell("clueTextContinuation", { slotIds: [1], footprintId: 1 }), cell("panel"), cell("clue")],
    [cell("clue"), cell("panel"), cell("clueTextContinuation", { slotIds: [2], footprintId: 2 }), cell("clueTextContinuation", { slotIds: [2], footprintId: 2 }), cell("clueText", { slotIds: [2], footprintId: 2, clues: [{ ...clueB, arrowRow: 1, arrowCol: 5 }] }), cell("clue", { clues: [clueB] })],
  ],
  placed: [
    { id: 1, answer: "ТЕСТ", clue: clueA.text, cells: [] },
    { id: 2, answer: "СЛОВО", clue: clueB.text, cells: [] },
  ],
  clueFootprints: [
    { id: 1, slotId: 1, arrowRow: 0, arrowCol: 0, cells: clueA.textCells.map((item) => ({ ...item })) },
    { id: 2, slotId: 2, arrowRow: 1, arrowCol: 5, cells: clueB.textCells.map((item) => ({ ...item })) },
  ],
  panelCells: 2,
  clueTextCells: 6,
  externalClueTexts: 2,
  constructionV2: {},
  closedFill: {},
};

const improved = window.ScanwordSolver.pairReflowClueFootprints(result, "fixture");
assert.equal(improved.panelCells, 0);
assert.equal(improved.clueTextCells, 8);
assert.equal(improved.constructionV2.cluePairReflow.accepted, true);
assert.equal(improved.constructionV2.cluePairReflow.roundsAccepted, 1);
assert.equal(improved.constructionV2.cluePairReflow.movedFootprints, 2);
assert.equal(improved.constructionV2.cluePairReflow.addedCells, 2);

console.log(JSON.stringify({ twoFootprintReflow: true, panelsBefore: 2, panelsAfter: 0 }));
