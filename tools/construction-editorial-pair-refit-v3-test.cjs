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
      score: 321,
    };
  },
};

require(path.resolve(__dirname, "..", "editorial-lexical-policy-v3.js"));
require(path.resolve(__dirname, "..", "construction-editorial-pair-refit-v3.js"));

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

const grid = Array.from({ length: 4 }, () => Array.from({ length: 3 }, panel));
grid[1][0] = clue(1, "right", "РЕ", "Вторая нота гаммы");
grid[0][2] = clue(2, "down", "ЕЖА", "Синтетический тестовый ответ");
grid[1][1] = letter("Р", [1], ["right"]);
grid[1][2] = letter("Е", [1, 2], ["right", "down"]);
grid[2][2] = letter("Ж", [2], ["down"]);
grid[3][2] = letter("А", [2], ["down"]);

const result = {
  rows: 4,
  cols: 3,
  grid,
  panelCells: 6,
  placed: [
    {
      id: 1,
      answer: "РЕ",
      clue: "Вторая нота гаммы",
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
      answer: "ЕЖА",
      clue: "Синтетический тестовый ответ",
      hasExactClue: true,
      lexicalQuality: 80,
      direction: "down",
      clueRow: 0,
      clueCol: 2,
      cells: [{ row: 1, col: 2 }, { row: 2, col: 2 }, { row: 3, col: 2 }],
    },
  ],
  pool: [
    { answer: "РЕ", clue: "Вторая нота гаммы", hasExactClue: true, weakFill: true, lexicalQuality: 42 },
    { answer: "ЕЖА", clue: "Синтетический тестовый ответ", hasExactClue: true, lexicalQuality: 80 },
    { answer: "АД", clue: "Место мучений в мифологии", hasExactClue: true, weakFill: true, lexicalQuality: 42 },
    { answer: "ДОМ", clue: "Жилое здание", hasExactClue: true, lexicalQuality: 95 },
  ],
  constructionV2: {},
};

const targetPattern = window.ScanwordSolver.editorialMutablePatternV3(
  result,
  result.placed[0],
  new Set([1, 2]),
);
const partnerPattern = window.ScanwordSolver.editorialMutablePatternV3(
  result,
  result.placed[1],
  new Set([1, 2]),
);
assert.equal(targetPattern, "??");
assert.equal(partnerPattern, "???");

const generated = window.ScanwordSolver.editorialPairCandidatesV3(
  result,
  result.placed[0],
  result.placed[1],
  new Set(["РЕ", "ЕЖА"]),
);
assert.ok(generated.pairs.some((pair) => pair.targetEntry.answer === "АД" && pair.partnerEntry.answer === "ДОМ"));

const refitted = window.ScanwordSolver.applyEditorialPairRefitsV3(result);
assert.equal(refitted.placed[0].answer, "АД");
assert.equal(refitted.placed[1].answer, "ДОМ");
assert.equal(refitted.grid[1][1].char, "А");
assert.equal(refitted.grid[1][2].char, "Д");
assert.equal(refitted.grid[2][2].char, "О");
assert.equal(refitted.grid[3][2].char, "М");
assert.equal(refitted.grid[1][0].clues[0].answer, "АД");
assert.equal(refitted.grid[0][2].clues[0].answer, "ДОМ");
assert.equal(refitted.panelCells, 6);
assert.equal(refitted.validation.valid, true);
assert.equal(refitted.constructionV2.editorialPairRefit.accepted, 1);
assert.equal(refitted.constructionV2.editorialPairRefit.before.formulaicShortCount, 1);
assert.equal(refitted.constructionV2.editorialPairRefit.after.formulaicShortCount, 0);
assert.equal(refitted.constructionV2.editorialPairRefit.replacements[0].formulaicGain, 1);

console.log(JSON.stringify({
  sameGeometryPairRefit: true,
  target: "РЕ -> АД",
  partner: "ЕЖА -> ДОМ",
  panelsUnchanged: true,
  validation: true,
}));
