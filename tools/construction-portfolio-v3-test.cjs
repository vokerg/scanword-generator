"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

global.window = global;
window.ScanwordCore = {};
window.ScanwordClosedFill = {};
window.ScanwordSolver = {
  generateBest() {
    return null;
  },
};

require(path.resolve(__dirname, "..", "construction-portfolio-v3.js"));

const candidate = (name, panels, weakFillCount, lexicalPenalty, letterCells, answers) => ({
  name,
  panelCells: panels,
  weakFillCount,
  lexicalPenalty,
  letterCells,
  placed: Array.from({ length: answers }, (_, index) => ({ answer: `${name}-${index}` })),
  clueTextCells: 50,
  intersections: 40,
  attempt: name.charCodeAt(0),
});

const denseWeak = candidate("A", 5, 8, 260, 112, 45);
const balanced = candidate("B", 6, 2, 90, 109, 44);
const dominated = candidate("C", 7, 4, 160, 105, 42);
const lexicalExtreme = candidate("D", 8, 0, 20, 104, 42);

const frontier = window.ScanwordSolver.portfolioParetoFrontier([
  denseWeak,
  balanced,
  dominated,
  lexicalExtreme,
]);
assert.deepEqual(frontier.map((entry) => entry.name).sort(), ["A", "B", "D"]);

const panelFirst = window.ScanwordSolver.selectPortfolioCandidateV3(
  [denseWeak, balanced, dominated, lexicalExtreme],
  { selectionMode: "panel-first", panelSlack: 1 },
);
assert.equal(panelFirst.candidate.name, "A");
assert.equal(panelFirst.telemetry.tradeoffApplied, false);

const pareto = window.ScanwordSolver.selectPortfolioCandidateV3(
  [denseWeak, balanced, dominated, lexicalExtreme],
  { selectionMode: "lexical-pareto", panelSlack: 1 },
);
assert.equal(pareto.candidate.name, "B");
assert.equal(pareto.telemetry.panelDelta, 1);
assert.equal(pareto.telemetry.weakFillDelta, -6);
assert.equal(pareto.telemetry.tradeoffApplied, true);

const noSlack = window.ScanwordSolver.selectPortfolioCandidateV3(
  [denseWeak, balanced],
  { selectionMode: "lexical-pareto", panelSlack: 0 },
);
assert.equal(noSlack.candidate.name, "A");

const pool = new Map([
  ["ИЛ", { answer: "ИЛ", weakFill: true, lexicalQuality: 42 }],
  ["РЕКА", { answer: "РЕКА", weakFill: false, lexicalQuality: 95 }],
]);
const lexical = window.ScanwordSolver.portfolioLexicalMetrics(
  [{ answer: "ИЛ" }, { answer: "РЕКА" }],
  pool,
);
assert.equal(lexical.weakFillCount, 1);
assert.equal(lexical.twoLetterCount, 1);
assert.deepEqual(lexical.weakAnswers, ["ИЛ"]);
assert.ok(lexical.lexicalPenalty > 0);

console.log(JSON.stringify({
  paretoFrontier: true,
  panelFirst: panelFirst.candidate.name,
  lexicalPareto: pareto.candidate.name,
  admittedPanelSlack: pareto.telemetry.panelDelta,
  weakFillImprovement: -pareto.telemetry.weakFillDelta,
}));
