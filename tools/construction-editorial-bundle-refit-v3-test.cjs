"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

global.window = global;
window.ScanwordSolver = {
  generateBest() {
    return null;
  },
  validateGrid(grid, placed) {
    for (const word of placed) {
      for (let index = 0; index < word.cells.length; index += 1) {
        const cell = word.cells[index];
        if (grid[cell.row][cell.col].char !== word.answer[index]) {
          return { valid: false, errors: [`slot ${word.id} mismatch`] };
        }
      }
    }
    return { valid: true, errors: [] };
  },
  resultMetrics(result) {
    return {
      validation: this.validateGrid(result.grid, result.placed),
      intersections: result.grid.flat().filter((cell) => cell.type === "letter" && cell.slotIds.length === 2).length,
      doubles: 0,
      components: 1,
      score: 456,
    };
  },
};

require(path.resolve(__dirname, "..", "editorial-lexical-policy-v3.js"));
require(path.resolve(__dirname, "..", "construction-editorial-bundle-refit-v3.js"));

function panel() {
  return { type: "panel", char: null, slotIds: [], directions: [], clues: [] };
}
function letter(char, slotIds, directions) {
  return { type: "letter", char, slotIds, directions, clues: [] };
}
function clue(slotId, direction, answer, text) {
  return {
    type: "clue",
    char: null,
    slotIds: [],
    directions: [],
    clues: [{ slotId, direction, answer, text }],
  };
}

const grid = Array.from({ length: 4 }, () => Array.from({ length: 4 }, panel));
grid[1][0] = clue(1, "right", "ЛЯ", "Шестая нота гаммы");
grid[0][1] = clue(2, "down", "ЛЕК", "Синтетический первый партнёр");
grid[0][2] = clue(3, "down", "ЯМА", "Углубление в земле");
grid[1][1] = letter("Л", [1, 2], ["right", "down"]);
grid[1][2] = letter("Я", [1, 3], ["right", "down"]);
grid[2][1] = letter("Е", [2], ["down"]);
grid[3][1] = letter("К", [2], ["down"]);
grid[2][2] = letter("М", [3], ["down"]);
grid[3][2] = letter("А", [3], ["down"]);

const result = {
  rows: 4,
  cols: 4,
  grid,
  panelCells: 7,
  placed: [
    {
      id: 1,
      answer: "ЛЯ",
      clue: "Шестая нота гаммы",
      hasExactClue: true,
      weakFill: true,
      lexicalQuality: 42,
      direction: "right",
      clueRow: 1,
      clueCol: 0,
      cells: [{ row: 1, col: 1 }, { row: 1, col: 2 }],
    },
    {
      id: 2,
      answer: "ЛЕК",
      clue: "Синтетический первый партнёр",
      hasExactClue: true,
      lexicalQuality: 80,
      direction: "down",
      clueRow: 0,
      clueCol: 1,
      cells: [{ row: 1, col: 1 }, { row: 2, col: 1 }, { row: 3, col: 1 }],
    },
    {
      id: 3,
      answer: "ЯМА",
      clue: "Углубление в земле",
      hasExactClue: true,
      lexicalQuality: 90,
      direction: "down",
      clueRow: 0,
      clueCol: 2,
      cells: [{ row: 1, col: 2 }, { row: 2, col: 2 }, { row: 3, col: 2 }],
    },
  ],
  pool: [
    { answer: "ЛЯ", clue: "Шестая нота гаммы", hasExactClue: true, weakFill: true, lexicalQuality: 42 },
    { answer: "ЛЕК", clue: "Синтетический первый партнёр", hasExactClue: true, lexicalQuality: 80 },
    { answer: "ЯМА", clue: "Углубление в земле", hasExactClue: true, lexicalQuality: 90 },
    { answer: "АД", clue: "Место мучений в мифологии", hasExactClue: true, weakFill: true, lexicalQuality: 42 },
    { answer: "АКТ", clue: "Официальный документ", hasExactClue: true, lexicalQuality: 95 },
    { answer: "ДОМ", clue: "Жилое здание", hasExactClue: true, lexicalQuality: 95 },
  ],
  constructionV2: {},
};

const problem = window.ScanwordSolver.editorialBundleProblemV3(
  result,
  result.placed[0],
  [result.placed[1], result.placed[2]],
  new Set(result.placed.map((word) => word.answer)),
);
assert.deepEqual(problem.patterns, ["??", "???", "???"]);
assert.deepEqual(problem.domains.map((domain) => domain.length), [1, 4, 4]);

const solved = window.ScanwordSolver.solveEditorialBundleV3(problem);
assert.ok(solved.solutions.some((solution) =>
  solution.entries.map((entry) => entry.answer).join("|") === "АД|АКТ|ДОМ"));

const refitted = window.ScanwordSolver.applyEditorialBundleRefitsV3(result);
assert.equal(refitted.placed[0].answer, "АД");
assert.equal(refitted.placed[1].answer, "АКТ");
assert.equal(refitted.placed[2].answer, "ДОМ");
assert.equal(refitted.grid[1][1].char, "А");
assert.equal(refitted.grid[1][2].char, "Д");
assert.equal(refitted.grid[2][1].char, "К");
assert.equal(refitted.grid[3][1].char, "Т");
assert.equal(refitted.grid[2][2].char, "О");
assert.equal(refitted.grid[3][2].char, "М");
assert.equal(refitted.panelCells, 7);
assert.equal(refitted.validation.valid, true);
assert.equal(refitted.constructionV2.editorialBundleRefit.accepted, 1);
assert.equal(refitted.constructionV2.editorialBundleRefit.before.formulaicShortCount, 1);
assert.equal(refitted.constructionV2.editorialBundleRefit.after.formulaicShortCount, 0);
assert.equal(refitted.constructionV2.editorialBundleRefit.replacements[0].formulaicGain, 1);

console.log(JSON.stringify({
  sameGeometryBundleCsp: true,
  target: "ЛЯ -> АД",
  partners: ["ЛЕК -> АКТ", "ЯМА -> ДОМ"],
  panelsUnchanged: true,
  validation: true,
}));
