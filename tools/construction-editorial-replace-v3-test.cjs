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
      score: 123,
    };
  },
};

require(path.resolve(__dirname, "..", "editorial-lexical-policy-v3.js"));
require(path.resolve(__dirname, "..", "construction-editorial-replace-v3.js"));

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

const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, panel));
grid[1][0] = clue(1, "right", "ДО", "Первая ступень музыкальной гаммы");
grid[0][2] = clue(2, "down", "ОМ", "Единица электрического сопротивления");
grid[1][1] = letter("Д", [1], ["right"]);
grid[1][2] = letter("О", [1, 2], ["right", "down"]);
grid[2][2] = letter("М", [2], ["down"]);

const result = {
  rows: 3,
  cols: 3,
  grid,
  panelCells: 4,
  placed: [
    {
      id: 1,
      answer: "ДО",
      clue: "Первая ступень музыкальной гаммы",
      hasExactClue: true,
      direction: "right",
      clueRow: 1,
      clueCol: 0,
      cells: [{ row: 1, col: 1 }, { row: 1, col: 2 }],
    },
    {
      id: 2,
      answer: "ОМ",
      clue: "Единица электрического сопротивления",
      hasExactClue: true,
      direction: "down",
      clueRow: 0,
      clueCol: 2,
      cells: [{ row: 1, col: 2 }, { row: 2, col: 2 }],
    },
  ],
  pool: [
    { answer: "ДО", clue: "Первая ступень музыкальной гаммы", hasExactClue: true, weakFill: true, lexicalQuality: 42 },
    { answer: "ГО", clue: "Древняя настольная игра на доске", hasExactClue: true, weakFill: true, lexicalQuality: 42 },
    { answer: "ОМ", clue: "Единица электрического сопротивления", hasExactClue: true, weakFill: true, lexicalQuality: 42 },
  ],
  constructionV2: {},
};

const pattern = window.ScanwordSolver.editorialReplacementFixedPatternV3(result, result.placed[0]);
assert.equal(pattern, "?О");

const replaced = window.ScanwordSolver.applyEditorialReplacementsV3(result);
assert.equal(replaced.placed[0].answer, "ГО");
assert.equal(replaced.grid[1][1].char, "Г");
assert.equal(replaced.grid[1][2].char, "О", "crossing character must remain fixed");
assert.equal(replaced.grid[1][0].clues[0].answer, "ГО");
assert.equal(replaced.grid[1][0].clues[0].text, "Древняя настольная игра на доске");
assert.equal(replaced.panelCells, 4);
assert.equal(replaced.validation.valid, true);
assert.equal(replaced.constructionV2.editorialReplacement.accepted, 1);
assert.equal(replaced.constructionV2.editorialReplacement.before.formulaicShortCount, 1);
assert.equal(replaced.constructionV2.editorialReplacement.after.formulaicShortCount, 0);
assert.deepEqual(replaced.constructionV2.editorialReplacement.replacements, [{
  slotId: 1,
  from: "ДО",
  to: "ГО",
  pattern: "?О",
  fromTier: "formulaic-short",
  toTier: "specialist-short",
}]);

const policy = window.ScanwordEditorialLexicalPolicyV3;
assert.equal(policy.classify("АС").editorialWeak, false);
assert.equal(policy.classify("РЕ").editorialWeak, true);
assert.equal(policy.classify("ОМ").specialistShort, true);

console.log(JSON.stringify({
  patternPreservingReplacement: true,
  from: "ДО",
  to: "ГО",
  panelsUnchanged: true,
  validation: true,
}));
