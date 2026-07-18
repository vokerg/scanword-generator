"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

global.window = global;
window.RUSSIAN_LEXICAL_META = {
  анна: { category: "given-name", source: "names", genericTemplate: true, generatedTemplate: true },
  волга: { category: "river", source: "geonames", genericTemplate: false, generatedTemplate: true },
  мост: { category: "common-noun", source: "ruwordnet", genericTemplate: false, generatedTemplate: false },
};
window.ScanwordEditorialLexicalPolicyV3 = { summarize: () => ({ editorialPenalty: 0, formulaicShortCount: 0 }) };
window.ScanwordSolver = { generateBest: () => ({}) };
require(path.resolve(__dirname, "..", "construction-vocabulary-editorial-tiebreak-v1.js"));

const metrics = window.ScanwordSolver.summarizeSelectedGridCluesV1([
  { answer: "АННА", clue: "Женское имя" },
  { answer: "ВОЛГА", clue: "Река в России" },
  { answer: "МОСТ", clue: "Сооружение" },
  { answer: "МОСТ", clue: "Сооружение" },
]);
assert.deepEqual(metrics, {
  genericClueCount: 1,
  generatedClueCount: 2,
  factualTemplateCount: 1,
  properNameCount: 1,
  distinctCategories: 3,
  distinctSources: 3,
  repeatedClueCount: 1,
  repeatedClueKinds: 1,
});

const base = {
  validationValid: true,
  components: 1,
  panels: 4,
  answers: 48,
  crossings: 52,
  rawLetterPercent: 51,
  editorialPenalty: 300,
  formulaicShortCount: 0,
  repeatedClueCount: 2,
  genericClueCount: 4,
  properNameCount: 8,
  distinctCategories: 5,
  distinctSources: 4,
  score: 100,
  activeLimit: 2500,
};
const improved = { ...base, repeatedClueCount: 1, score: 90, activeLimit: 3500 };
assert.ok(window.ScanwordSolver.compareVocabularyEditorialCandidatesV1(
  { summary: improved }, { summary: base },
) < 0);
const denser = { ...base, panels: 3, repeatedClueCount: 9 };
assert.ok(window.ScanwordSolver.compareVocabularyEditorialCandidatesV1(
  { summary: denser }, { summary: improved },
) < 0);

console.log(JSON.stringify({ passed: true, metrics }));
