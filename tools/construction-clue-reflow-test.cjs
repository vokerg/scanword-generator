"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;
process.env.SCANWORD_REFLOW_ADD = "1";

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

require(path.resolve(__dirname, "..", "construction-clue-reflow.js"));

function cell(type, extra = {}) {
  return { type, char: null, slotIds: [], directions: [], clues: [], ...extra };
}

const clue = { slotId: 1, direction: "right", text: "Достаточно длинная подсказка", answer: "ТЕСТ", externalText: true, textRow: 0, textCol: 1, textCells: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }] };
const blocked = () => cell("clue");
const result = {
  rows: 3,
  cols: 4,
  grid: [
    [cell("clue", { clues: [clue] }), cell("clueText", { slotIds: [1], footprintId: 1, clues: [{ ...clue, arrowRow: 0, arrowCol: 0 }] }), cell("clueTextContinuation", { slotIds: [1], footprintId: 1 }), cell("clueTextContinuation", { slotIds: [1], footprintId: 1 })],
    [cell("panel"), cell("panel"), blocked(), blocked()],
    [cell("panel"), cell("panel"), blocked(), blocked()],
  ],
  placed: [{ id: 1, answer: "ТЕСТ", clue: clue.text, cells: [] }],
  clueFootprints: [{ id: 1, slotId: 1, arrowRow: 0, arrowCol: 0, cells: clue.textCells.map((item) => ({ ...item })) }],
  panelCells: 4,
  clueTextCells: 3,
  externalClueTexts: 1,
  constructionV2: {},
  closedFill: {},
};

const improved = window.ScanwordSolver.reflowClueFootprints(result, "fixture");
assert.equal(improved.panelCells, 3);
assert.equal(improved.clueTextCells, 4);
assert.deepEqual(improved.clueFootprints[0].cells.map((item) => `${item.row}:${item.col}`).sort(), ["1:0", "1:1", "2:0", "2:1"]);
assert.equal(improved.grid[0][1].type, "panel");
assert.equal(improved.grid[1][0].type, "clueText");
assert.equal(improved.constructionV2.clueReflow.accepted, true);
assert.equal(improved.constructionV2.clueReflow.netAddedCells, 1);

console.log(JSON.stringify({ localClueReflow: true, panelsBefore: 4, panelsAfter: 3 }));
