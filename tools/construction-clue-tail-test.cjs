"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;

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
      isolatedPanels: measured.panelCells === 1 ? 1 : 0,
      largestPanelRegion: measured.panelCells,
      validation: { valid: true, accidentalRuns: [], conflicts: 0, orphanLetters: 0, clueDirectionConflicts: 0 },
    };
  },
  attachValidationReport(result) { return result; },
};

require(path.resolve(__dirname, "..", "construction-clue-tail.js"));

function cell(type, extra = {}) {
  return { type, char: null, slotIds: [], directions: [], clues: [], ...extra };
}

const clue = { slotId: 1, direction: "right", text: "Достаточно длинная подсказка", answer: "ТЕСТ", externalText: true, textRow: 0, textCol: 1, textCells: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }] };
const result = {
  rows: 1,
  cols: 5,
  grid: [[
    cell("clue", { clues: [clue] }),
    cell("clueText", { slotIds: [1], footprintId: 1, clues: [{ ...clue, arrowRow: 0, arrowCol: 0 }] }),
    cell("clueTextContinuation", { slotIds: [1], footprintId: 1 }),
    cell("clueTextContinuation", { slotIds: [1], footprintId: 1 }),
    cell("panel"),
  ]],
  placed: [{ id: 1, answer: "ТЕСТ", clue: clue.text, cells: [] }],
  clueFootprints: [{ id: 1, slotId: 1, arrowRow: 0, arrowCol: 0, cells: clue.textCells.map((item) => ({ ...item })) }],
  panelCells: 1,
  clueTextCells: 3,
  externalClueTexts: 1,
  constructionV2: {},
  closedFill: {},
};

const improved = window.ScanwordSolver.absorbResidualPanels(result, "fixture");
assert.equal(improved.panelCells, 0);
assert.equal(improved.clueTextCells, 4);
assert.equal(improved.clueFootprints[0].cells.length, 4);
assert.equal(improved.grid[0][4].type, "clueTextContinuation");
assert.equal(improved.constructionV2.clueTailAbsorption.accepted, true);
assert.equal(improved.constructionV2.clueTailAbsorption.addedCells, 1);

console.log(JSON.stringify({ rectangularTailAbsorption: true, panelsBefore: 1, panelsAfter: 0 }));
