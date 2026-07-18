"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

global.window = global;
window.RUSSIAN_LEXICAL_META = {
  анна: { category: "given-name", source: "names", genericTemplate: true, generatedTemplate: true },
  алина: { category: "given-name", source: "names", genericTemplate: true, generatedTemplate: true },
};
window.ScanwordEditorialLexicalPolicyV3 = { summarize: () => ({ editorialPenalty: 0, formulaicShortCount: 0 }) };
window.ScanwordSolver = { generateBest: () => ({}) };
require(path.resolve(__dirname, "..", "construction-vocabulary-editorial-tiebreak-v1.js"));
require(path.resolve(__dirname, "..", "construction-clue-disambiguation-v1.js"));

const result = {
  placed: [
    { id: 1, answer: "АННА", clue: "Женское имя" },
    { id: 2, answer: "АЛИНА", clue: "Женское имя" },
  ],
  grid: [[{ clues: [
    { slotId: 1, text: "Женское имя" },
    { slotId: 2, text: "Женское имя" },
  ] }]],
  pool: [
    { answer: "АННА", clue: "Женское имя" },
    { answer: "АЛИНА", clue: "Женское имя" },
  ],
  constructionV2: { vocabularyPortfolio: { selected: {} } },
};

window.ScanwordSolver.disambiguateSelectedGridCluesV1(result);
assert.equal(result.constructionV2.clueDisambiguation.changedGroups, 1);
assert.equal(result.constructionV2.clueDisambiguation.changedClues, 2);
assert.equal(result.constructionV2.vocabularyPortfolio.selected.repeatedClueCount, 0);
assert.notEqual(result.placed[0].clue, result.placed[1].clue);
assert.equal(result.grid[0][0].clues[0].text, result.placed[0].clue);
assert.equal(result.grid[0][0].clues[1].text, result.placed[1].clue);

console.log(JSON.stringify({ passed: true, clues: result.placed.map((word) => word.clue) }));
