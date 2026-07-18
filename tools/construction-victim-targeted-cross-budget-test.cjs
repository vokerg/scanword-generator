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
const weakWord = (id, answer, clueCol) => ({
  id,
  answer,
  hasExactClue: true,
  weakFill: false,
  direction: "down",
  clueRow: 0,
  clueCol,
  cells: [],
});
const oneWeakCandidate = {
  placed: [...baseline.placed, weakWord(2, "ИЛ", 1)],
  targetedVictimMeta: {
    relaxedRollbackCross: true,
    panelsBefore: 10,
    panelsAfter: 9,
  },
};
const debtCandidate = {
  placed: [
    ...baseline.placed,
    weakWord(2, "ИЛ", 1),
    weakWord(3, "АС", 2),
    weakWord(4, "ГО", 3),
  ],
  targetedVictimMeta: {
    relaxedRollbackCross: true,
    panelsBefore: 10,
    panelsAfter: 8,
  },
};

window.SCANWORD_TARGETED_SHORT_FILL = [
  ["ИЛ", "Донный осадок"],
  ["АС", "Мастер своего дела"],
  ["ГО", "Настольная игра"],
].map(([answer, clue]) => ({
  answer,
  clue,
  hasExactClue: true,
  weakFill: true,
  lexicalQuality: 20,
  lexicalSource: "targeted-short-fill",
}));
let generatedCandidate = oneWeakCandidate;
window.ScanwordSolver = {
  generateTargetedVictimVariants: () => ({ states: [], telemetry: {} }),
  generateRelaxedRollbackCrossVariants(result, pool, options, telemetry) {
    assert.equal(options.relaxedCrossWeakBudget, 2);
    assert.equal(options.relaxedCrossWeakDebt, 1);
    assert.equal(options.relaxedCrossMinimumPanelGainForDebt, 2);
    assert.equal(pool.find((entry) => entry.answer === "ИЛ")?.weakFill, false, "search pool should be permissive");
    telemetry.statesAccepted = 1;
    return [{
      ...generatedCandidate,
      placed: generatedCandidate.placed.map((word) => ({ ...word })),
      targetedVictimMeta: { ...generatedCandidate.targetedVictimMeta },
    }];
  },
};

require(path.resolve(__dirname, "..", "construction-victim-targeted-cross-budget.js"));
const bounded = window.ScanwordSolver.generateTargetedVictimVariants(baseline, [], {
  relaxedCrossFinalists: 2,
  relaxedCrossWeakBudget: 2,
});

assert.equal(bounded.states.length, 1, "one weak filler must be allowed by the checkpoint-B budget");
assert.equal(bounded.states[0].placed.find((word) => word.answer === "ИЛ")?.weakFill, true, "real lexical metadata must be restored");
assert.equal(bounded.states[0].targetedVictimMeta.weakFillBefore, 0);
assert.equal(bounded.states[0].targetedVictimMeta.weakFillAfter, 1);
assert.equal(bounded.states[0].targetedVictimMeta.weakFillLimit, 2);
assert.equal(bounded.states[0].targetedVictimMeta.weakFillDebt, 0);
assert.equal(bounded.telemetry.relaxedRollbackCross.statesAccepted, 1);
assert.equal(bounded.telemetry.relaxedRollbackCross.weakDebtAccepted, 0);

generatedCandidate = debtCandidate;
const debt = window.ScanwordSolver.generateTargetedVictimVariants(baseline, [], {
  relaxedCrossFinalists: 2,
  relaxedCrossWeakBudget: 2,
  relaxedCrossWeakDebt: 1,
  relaxedCrossMinimumPanelGainForDebt: 2,
});
assert.equal(debt.states.length, 1, "one unit of lexical debt must be admitted for a two-panel structural gain");
assert.equal(debt.states[0].targetedVictimMeta.weakFillAfter, 3);
assert.equal(debt.states[0].targetedVictimMeta.weakFillLimit, 2);
assert.equal(debt.states[0].targetedVictimMeta.weakFillDebt, 1);
assert.equal(debt.telemetry.relaxedRollbackCross.weakDebtAccepted, 1);
assert.equal(debt.telemetry.relaxedRollbackCross.weakBudgetFiltered, 0);
console.log(JSON.stringify({
  boundedWeakFillBudget: true,
  conditionalLexicalDebt: true,
  weakFillLimit: 2,
  admittedDebt: 1,
  minimumPanelGain: 2,
}));
