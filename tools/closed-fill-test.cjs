"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;
window.ScanwordCore = { DIRECTIONS: { right: { dr: 0, dc: 1 }, down: { dr: 1, dc: 0 } } };
window.ScanwordSolver = {
  generateBest() { throw new Error("fixture does not call generateBest"); },
  resultMetrics() { throw new Error("fixture does not call resultMetrics"); },
};
require(path.resolve(__dirname, "..", "closed-fill.js"));

function cell(type, extra = {}) {
  return { type, char: null, slotIds: [], directions: [], clues: [], ...extra };
}

const grid = [
  [cell("clue"), cell("letter", { char: "М", slotIds: [1], directions: ["down"] }), cell("panel")],
  [cell("panel"), cell("panel"), cell("panel")],
  [cell("letter", { char: "А", slotIds: [2], directions: ["right"] }), cell("panel"), cell("clue")],
];
const regions = window.ScanwordClosedFill.extractResidualRegions(grid);
assert.equal(regions.length, 1);
assert.deepEqual(regions[0].cells, [
  { row: 0, col: 2 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 1, col: 2 },
  { row: 2, col: 1 },
]);
assert.deepEqual(regions[0].boundaryWords, [1, 2]);
assert.deepEqual(window.ScanwordClosedFill.extractResidualRegions(grid), regions);

const coverage = window.ScanwordClosedFill.measureCoverage(grid);
assert.equal(coverage.totalCells, 9);
assert.equal(coverage.letterCells, 2);
assert.equal(coverage.panelCells, 5);
assert.equal(coverage.rawLetterCoverage, 2 / 9);

const pool = [
  { answer: "МАК", clue: "Растение", hasExactClue: true },
  { answer: "МИР", clue: "Отсутствие войны", hasExactClue: true },
  { answer: "КОТ", clue: "Домашнее животное", hasExactClue: true },
  { answer: "КИТ", clue: "Морской гигант", hasExactClue: true },
  { answer: "МАК", clue: "Дубликат", hasExactClue: true },
  { answer: "МЕЛ", clue: "Пишут на доске", hasExactClue: false },
];
const index = window.ScanwordClosedFill.buildPatternIndex(pool);
assert.deepEqual(window.ScanwordClosedFill.queryPattern(index, ["М", null, "Р"]).map((entry) => entry.answer), ["МИР"]);
assert.deepEqual(window.ScanwordClosedFill.queryPattern(index, [null, "И", null]).map((entry) => entry.answer), ["КИТ", "МИР"]);

const slots = [
  {
    signature: "right-a",
    direction: "right",
    cells: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
    baseDomain: [
      { answer: "МАК", clue: "Растение", hasExactClue: true },
      { answer: "МИР", clue: "Отсутствие войны", hasExactClue: true },
    ],
  },
  {
    signature: "down-b",
    direction: "down",
    cells: [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 1 }],
    baseDomain: [
      { answer: "АРА", clue: "Крупный попугай", hasExactClue: true },
      { answer: "ИВА", clue: "Дерево", hasExactClue: true },
    ],
  },
];
const solved = window.ScanwordClosedFill.solveLocalCsp(slots);
assert.ok(solved.assignments);
assert.equal(solved.assignments.get(0).answer, "МАК");
assert.equal(solved.assignments.get(1).answer, "АРА");
assert.ok(solved.stats.cspNodes > 0);

console.log(JSON.stringify({
  deterministicRegions: true,
  rawCoverage: true,
  indexedPatternLookup: true,
  mrvForwardChecking: true,
  cspNodes: solved.stats.cspNodes,
}));