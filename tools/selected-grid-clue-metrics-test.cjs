"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

global.window = global;
window.RUSSIAN_LEXICAL_META = {
  анна: { category: "given-name", source: "names", genericTemplate: true, generatedTemplate: true },
  волга: { category: "river", source: "geonames", genericTemplate: false, generatedTemplate: true },
  мост: { category: "common-noun", source: "ruwordnet", genericTemplate: false, generatedTemplate: false },
};
window.ScanwordSolver = {
  generateBest: () => ({ placed: [], constructionV2: {} }),
};
require(path.resolve(__dirname, "..", "construction-selected-grid-clue-metrics-v1.js"));

const result = {
  placed: [
    {
      id: 1,
      answer: "АННА",
      clue: "Женское имя",
      direction: "right",
      clueRow: 0,
      clueCol: 0,
      startRow: 0,
      startCol: 1,
      cells: [{ row: 0, col: 1 }],
    },
    {
      id: 2,
      answer: "ВОЛГА",
      clue: "Река в России",
      direction: "down",
      clueRow: 1,
      clueCol: 0,
      startRow: 2,
      startCol: 0,
      cells: [{ row: 2, col: 0 }],
    },
    {
      id: 3,
      answer: "МОСТ",
      clue: "Сооружение",
      direction: "right",
      clueRow: 2,
      clueCol: 1,
      startRow: 2,
      startCol: 2,
      cells: [{ row: 2, col: 2 }],
    },
    {
      id: 4,
      answer: "МОСТ",
      clue: "Сооружение",
      direction: "down",
      clueRow: 3,
      clueCol: 1,
      startRow: 4,
      startCol: 1,
      cells: [{ row: 4, col: 1 }],
      clueEditorial: { generated: true, overRevealing: false },
    },
  ],
  constructionV2: { vocabularyPortfolio: { selected: {} } },
};

window.ScanwordSolver.annotateSelectedGridCluesV1(result);
const metrics = result.constructionV2.selectedGridClues;
assert.equal(metrics.genericClueCount, 1);
assert.equal(metrics.generatedClueCount, 2);
assert.equal(metrics.factualTemplateCount, 1);
assert.equal(metrics.properNameCount, 1);
assert.equal(metrics.distinctCategories, 3);
assert.equal(metrics.distinctSources, 3);
assert.equal(metrics.repeatedClueCount, 1);
assert.equal(metrics.repeatedClueKinds, 1);
assert.equal(metrics.repeatedGenericClueCount, 0);
assert.equal(metrics.rewrittenClueCount, 1);
assert.equal(metrics.overRevealingGeneratedClueCount, 0);
assert.ok(metrics.answerSignature.includes("АННА"));
assert.ok(metrics.geometrySignature.includes("АННА"));
assert.equal(result.constructionV2.vocabularyPortfolio.selected.repeatedClueCount, 1);

console.log(JSON.stringify({ passed: true, metrics }));
