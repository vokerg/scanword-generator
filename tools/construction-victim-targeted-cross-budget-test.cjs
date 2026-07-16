"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;

const baseline = {
  placed: [{
    id: 1,
    answer: "ОПОРА",
    hasExactClue: true,
    weakFill: false,
    direction: "right",
    clueRow: 0,
    clueCol: 0,
    cells: [],
  }],
};
const weakCandidate = {
  placed: [
    ...baseline.placed,
    {
      id: 2,
      answer: "ИЛ",
      hasExactClue: true,
      weakFill: false,
      direction: "down",
      clueRow: 0,
      clueCol: 1,
      cells: [],
    },
  ],
  targetedVictimMeta: { relaxedRollbackCross: true },
};

window.SCANWORD_TARGETED_SHORT_FILL = [{
  answer: "ИЛ",
  clue: "Донный осадок",
  hasExactClue: true,
  weakFill: true,
  lexicalQuality: 20,
  lexicalSource: "targeted-short-fill",
}];
window.ScanwordSolver = {
  generateTargetedVictimVariants: () => ({ states: [], telemetry: {} }),
  generateRelaxedRollbackCrossVariants(result, pool, options, telemetry) {
    assert.equal(options.relaxedCrossWeakBudget, 2);
    assert.equal(pool.find((entry) => entry.answer === "ИЛ")?.weakFill, false, "search pool should be permissive");
    telemetry.statesAccepted = 1;
    return [{
      ...weakCandidate,
      placed: weakCandidate.placed.map((word) => ({ ...word })),
    }];
  },
};

require(path.resolve(__dirname, "..", "construction-victim-targeted-cross-budget.js"));
const result = window.ScanwordSolver.generateTargetedVictimVariants(baseline, [], {
  relaxedCrossFinalists: 2,
  relaxedCrossWeakBudget: 2,
});

assert.equal(result.states.length, 1, "one weak filler must be allowed by the checkpoint-B budget");
assert.equal(result.states[0].placed.find((word) => word.answer === "ИЛ")?.weakFill, true, "real lexical metadata must be restored");
assert.equal(result.states[0].targetedVictimMeta.weakFillBefore, 0);
assert.equal(result.states[0].targetedVictimMeta.weakFillAfter, 1);
assert.equal(result.states[0].targetedVictimMeta.weakFillLimit, 2);
assert.equal(result.telemetry.relaxedRollbackCross.statesAcceptedBeforeBudget, 1);
assert.equal(result.telemetry.relaxedRollbackCross.statesAccepted, 1);
assert.equal(result.telemetry.relaxedRollbackCross.weakBudgetFiltered, 0);
console.log(JSON.stringify({
  boundedWeakFillBudget: true,
  weakFillBefore: 0,
  weakFillAfter: 1,
  weakFillLimit: 2,
}));
