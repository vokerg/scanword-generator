"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

global.window = global;
window.RUSSIAN_LEXICAL_META = {
  анна: { category: "given-name", source: "names", lexicalQuality: 90, genericTemplate: true, generatedTemplate: true },
  алина: { category: "given-name", source: "names", lexicalQuality: 80, genericTemplate: true, generatedTemplate: true },
  ирина: { category: "given-name", source: "names", lexicalQuality: 70, genericTemplate: true, generatedTemplate: true },
  обь: { category: "river", source: "geonames", lexicalQuality: 90, genericTemplate: true, generatedTemplate: true },
  уфа: {
    category: "river",
    source: "geonames",
    lexicalQuality: 80,
    genericTemplate: true,
    generatedTemplate: true,
    clueFacts: { region: "Башкортостан", population: 0, elevationM: 0 },
  },
};
window.ScanwordSolver = { generateBest: () => ({ placed: [], constructionV2: {} }) };
require(path.resolve(__dirname, "..", "construction-selected-grid-clue-metrics-v1.js"));
require(path.resolve(__dirname, "..", "construction-clue-disambiguation-v1.js"));

const unsafeShortHint = window.ScanwordSolver.selectedGridClueRevealPolicyV1("УФА", {
  text: "Река на У",
  revealedLetters: 1,
});
assert.equal(unsafeShortHint.overRevealing, true);
assert.equal(unsafeShortHint.allowedLetters, 0);

const placed = [
  { id: 1, answer: "АННА", clue: "Женское имя", direction: "right", clueRow: 0, clueCol: 0, startRow: 0, startCol: 1, cells: [{ row: 0, col: 1 }] },
  { id: 2, answer: "АЛИНА", clue: "Женское имя", direction: "down", clueRow: 0, clueCol: 2, startRow: 1, startCol: 2, cells: [{ row: 1, col: 2 }] },
  { id: 3, answer: "ИРИНА", clue: "Женское имя", direction: "right", clueRow: 2, clueCol: 0, startRow: 2, startCol: 1, cells: [{ row: 2, col: 1 }] },
  { id: 4, answer: "ОБЬ", clue: "Река", direction: "down", clueRow: 2, clueCol: 2, startRow: 3, startCol: 2, cells: [{ row: 3, col: 2 }] },
  { id: 5, answer: "УФА", clue: "Река", direction: "right", clueRow: 4, clueCol: 0, startRow: 4, startCol: 1, cells: [{ row: 4, col: 1 }] },
];
const grid = Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => ({ type: "panel", clues: [] })));
for (const word of placed) {
  grid[word.clueRow][word.clueCol] = {
    type: "clue",
    clues: [{ slotId: word.id, direction: word.direction, text: word.clue, answer: word.answer }],
  };
}
const pool = placed.map((word) => ({ answer: word.answer, clue: word.clue }));
const poolBefore = JSON.stringify(pool);
const result = {
  placed,
  grid,
  pool,
  constructionV2: { vocabularyPortfolio: { selected: {} } },
};

window.ScanwordSolver.annotateSelectedGridCluesV1(result);
const answerSignature = result.constructionV2.selectedGridClues.answerSignature;
const geometrySignature = result.constructionV2.selectedGridClues.geometrySignature;
window.ScanwordSolver.disambiguateSelectedGridCluesV1(result);

const report = result.constructionV2.clueDisambiguation;
assert.equal(report.groupsConsidered, 2);
assert.equal(report.changedGroups, 2);
assert.equal(report.changedClues, 3);
assert.equal(report.after.repeatedGenericClueCount, 0);
assert.equal(report.after.repeatedGenericClueKinds, 0);
assert.equal(report.after.answerSignature, answerSignature);
assert.equal(report.after.geometrySignature, geometrySignature);
assert.equal(report.after.overRevealingGeneratedClueCount, 0);
assert.equal(JSON.stringify(result.pool), poolBefore, "selected-grid cleanup must not mutate the pool");

const clueTexts = result.placed.map((word) => word.clue);
assert.equal(new Set(clueTexts.slice(0, 3).map((clue) => clue.toLowerCase())).size, 3);
assert.equal(new Set(clueTexts.slice(3).map((clue) => clue.toLowerCase())).size, 2);
assert.ok(result.placed.find((word) => word.answer === "УФА").clue.includes("Башкортостан"));
for (const change of report.changes) {
  const answerLength = String(change.answer).length;
  if (answerLength <= 3) assert.equal(change.revealedLetters, 0);
  if (answerLength <= 7) assert.ok(change.revealedLetters <= 1);
  assert.ok(change.revealFraction <= 0.25);
  const word = result.placed.find((entry) => Number(entry.id) === Number(change.slotId));
  const cellClue = result.grid[word.clueRow][word.clueCol].clues.find((item) => Number(item.slotId) === Number(word.id));
  assert.equal(cellClue.text, word.clue);
}

console.log(JSON.stringify({ passed: true, report, clues: clueTexts }));
