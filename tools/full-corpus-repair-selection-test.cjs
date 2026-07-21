"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
global.window = global;

window.ScanwordEditorialDemandLexiconV3 = {};
window.ScanwordEditorialDemandLexiconSupplementV3 = {};
window.ScanwordEditorialDemandShortLexiconV3 = {};
window.ScanwordEditorialDemandTailLexiconV3 = {};
window.ScanwordFullCorpusPatternIndexV1 = {
  enabled() { return false; },
};
window.ScanwordEditorialLexicalPolicyV3 = {
  summarize(entries) {
    return {
      formulaicShortCount: entries.reduce((sum, entry) => sum + Number(entry.formulaic || 0), 0),
      editorialPenalty: entries.reduce((sum, entry) => sum + Number(entry.penalty || 0), 0),
      twoLetterCount: entries.filter((entry) => entry.answer.length === 2).length,
    };
  },
};
window.ScanwordSolver = {
  __vocabularyPortfolioV1Installed: true,
  generateBest() { throw new Error("not used"); },
};

require(path.join(root, "construction-editorial-repair-v3.js"));
const choose = window.ScanwordSolver.chooseFullCorpusRepairCandidateV1;
assert.equal(typeof choose, "function");

function result(answer, penalty, options = {}) {
  const cells = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }];
  return {
    rows: 1,
    cols: 3,
    panelCells: 0,
    intersections: 0,
    components: 1,
    validation: { valid: true },
    grid: [[
      { type: "letter", slotIds: [1], directions: ["right"], clues: [], char: answer[0] },
      { type: "letter", slotIds: [1], directions: ["right"], clues: [], char: answer[1] },
      { type: "letter", slotIds: [1], directions: ["right"], clues: [], char: answer[2] },
    ]],
    placed: [{
      id: 1,
      answer,
      penalty,
      formulaic: options.formulaic ? 1 : 0,
      hasExactClue: options.exactClue !== false,
      direction: "right",
      clueRow: -1,
      clueCol: 0,
      startRow: 0,
      startCol: 0,
      cells,
    }],
    clueFootprints: [],
  };
}

const baseline = result("БАЗ", 20);
const better = result("ЛУЧ", 10);
const equal = result("МИР", 20);
const worse = result("ДОМ", 30);
const invalid = result("ЛУЧ", 10);
invalid.validation.valid = false;
const changedStructure = result("ЛУЧ", 10);
changedStructure.grid[0][2].slotIds = [1, 2];

assert.deepEqual(
  choose(baseline, better),
  {
    accepted: true,
    reason: "strict-editorial-improvement",
    structuralEqual: true,
    baselineSummary: {
      valid: true,
      components: 1,
      exactCluesOnly: true,
      panels: 0,
      answers: 1,
      crossings: 0,
      formulaicShortCount: 0,
      editorialPenalty: 20,
      twoLetterCount: 0,
    },
    candidateSummary: {
      valid: true,
      components: 1,
      exactCluesOnly: true,
      panels: 0,
      answers: 1,
      crossings: 0,
      formulaicShortCount: 0,
      editorialPenalty: 10,
      twoLetterCount: 0,
    },
  },
);
assert.equal(choose(baseline, equal).accepted, false, "equal editorial output must preserve baseline identity");
assert.equal(choose(baseline, equal).reason, "no-strict-editorial-improvement");
assert.equal(choose(baseline, worse).accepted, false, "worse editorial output must be rejected");
assert.equal(choose(baseline, invalid).reason, "validation-boundary-failed");
assert.equal(choose(baseline, changedStructure).reason, "structural-mismatch");

console.log(JSON.stringify({ status: "ok" }));
