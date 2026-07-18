"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;

const weakVictim = { answer: "ПА", weakFill: true, lexicalQuality: 42 };
const strongVictim = { answer: "ДОМ", weakFill: false, lexicalQuality: 90 };
window.ScanwordSolver = {
  generateTargetedVictimVariants(result, pool) {
    const on = pool.find((entry) => entry.answer === "ОН");
    assert.ok(on, "supplemental entry must be visible to targeted pattern search");
    assert.equal(on.weakFill, false, "search view bypasses only the early weak-entry filter");
    return {
      states: [{
        ...result,
        placed: [{ answer: "ОН", weakFill: false }],
        targetedVictimMeta: { victimAnswer: result.placed[0].answer },
      }],
      telemetry: { statesAccepted: 1 },
    };
  },
};

require(path.resolve(__dirname, "..", "targeted-short-fill.js"));
require(path.resolve(__dirname, "..", "construction-victim-targeted-demand.js"));

const pool = [weakVictim, strongVictim];
const allowed = window.ScanwordSolver.generateTargetedVictimVariants({ placed: [{ answer: "ПА" }] }, pool);
assert.equal(allowed.states.length, 1);
assert.equal(allowed.states[0].placed[0].weakFill, true);
assert.deepEqual(allowed.states[0].targetedVictimMeta.supplementalShortFill, ["ОН"]);
assert.equal(allowed.states[0].targetedVictimMeta.baselineWeakFill, 1);
assert.equal(allowed.states[0].targetedVictimMeta.candidateWeakFill, 1);
assert.equal(allowed.telemetry.weakFillBudgetRejected, 0);

const rejected = window.ScanwordSolver.generateTargetedVictimVariants({ placed: [{ answer: "ДОМ" }] }, pool);
assert.equal(rejected.states.length, 0);
assert.equal(rejected.telemetry.weakFillBudget, 0);
assert.equal(rejected.telemetry.weakFillBudgetRejected, 1);

const patterns = new Set(window.SCANWORD_TARGETED_SHORT_FILL.map((entry) => entry.answer));
for (const answer of ["ОН", "СО", "НЕ", "НО", "ЗА", "ЛИ", "КО", "ЭК", "ОП"]) assert.ok(patterns.has(answer));

console.log(JSON.stringify({
  supplementalEntries: patterns.size,
  weakReplacementAllowed: true,
  weakIncreaseRejected: true,
}));
