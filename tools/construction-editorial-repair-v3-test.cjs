"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

global.window = global;
const calls = [];
window.ScanwordEditorialLexicalPolicyV3 = {
  summarize(placed) {
    return {
      formulaicShortCount: placed[0].answer === "РЕ" ? 1 : 0,
      editorialPenalty: placed[0].answer === "РЕ" ? 80 : 4,
    };
  },
};
window.ScanwordSolver = {
  generateBest() {
    calls.push("generate");
    return {
      grid: [[{ type: "letter", char: "Р", slotIds: [1], directions: ["right"], clues: [] }]],
      placed: [{ id: 1, answer: "РЕ" }],
      panelCells: 7,
      constructionV2: {},
    };
  },
  applyEditorialReplacementsV3(result) {
    calls.push("single");
    result.constructionV2.editorialReplacement = { accepted: 1 };
    return result;
  },
  applyEditorialPairRefitsV3(result) {
    calls.push("pair");
    result.constructionV2.editorialPairRefit = { accepted: 2 };
    return result;
  },
  applyEditorialBundleRefitsV3(result) {
    calls.push("bundle");
    result.placed[0].answer = "АС";
    result.constructionV2.editorialBundleRefit = { accepted: 1 };
    return result;
  },
  resultMetrics() {
    return {
      validation: { valid: true, errors: [] },
      intersections: 0,
      doubles: 0,
      components: 1,
      score: 10,
    };
  },
};

require(path.resolve(__dirname, "..", "construction-editorial-repair-v3.js"));

process.env.SCANWORD_EDITORIAL_REPAIR = "off";
const baseline = window.ScanwordSolver.generateBest("seed");
assert.deepEqual(calls, ["generate"]);
assert.equal(baseline.constructionV2.editorialRepair, undefined);

calls.length = 0;
process.env.SCANWORD_EDITORIAL_REPAIR = "on";
const repaired = window.ScanwordSolver.generateBest("seed");
assert.deepEqual(calls, ["generate", "single", "pair", "bundle"]);
assert.equal(repaired.placed[0].answer, "АС");
assert.equal(repaired.constructionV2.editorialRepair.mode, "same-geometry-editorial-repair-pipeline-v3");
assert.equal(repaired.constructionV2.editorialRepair.accepted, 4);
assert.equal(repaired.constructionV2.editorialRepair.formulaicGain, 1);
assert.equal(repaired.constructionV2.editorialRepair.editorialPenaltyGain, 76);
assert.equal(repaired.constructionV2.editorialRepair.panelsBefore, 7);
assert.equal(repaired.constructionV2.editorialRepair.panelsAfter, 7);
assert.equal(repaired.validation.valid, true);

console.log(JSON.stringify({
  unifiedEditorialPipeline: true,
  order: calls,
  accepted: repaired.constructionV2.editorialRepair.accepted,
  geometryUnchanged: true,
}));
