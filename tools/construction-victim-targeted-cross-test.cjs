"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;

function cell(type, extra = {}) {
  return { type, char: null, slotIds: [], directions: [], clues: [], ...extra };
}

function coverage(grid) {
  const cells = grid.flat();
  return {
    totalCells: cells.length,
    panelCells: cells.filter((item) => item.type === "panel").length,
    letterCells: cells.filter((item) => item.type === "letter").length,
  };
}

const anchors = [
  { id: 1, answer: "А", hasExactClue: true, direction: "down", clueRow: 0, clueCol: 2, cells: [{ row: 2, col: 2 }] },
  { id: 2, answer: "Б", hasExactClue: true, direction: "down", clueRow: 0, clueCol: 4, cells: [{ row: 2, col: 4 }] },
  { id: 3, answer: "В", hasExactClue: true, direction: "right", clueRow: 1, clueCol: 0, cells: [{ row: 1, col: 3 }] },
  { id: 4, answer: "Г", hasExactClue: true, direction: "right", clueRow: 3, clueCol: 0, cells: [{ row: 3, col: 3 }] },
];
const structural = {
  rows: 5,
  cols: 6,
  panelCells: 18,
  grid: [
    [cell("panel"), cell("panel"), cell("panel"), cell("panel"), cell("panel"), cell("panel")],
    [cell("panel"), cell("panel"), cell("panel"), cell("letter", { char: "К", slotIds: [3], directions: ["right"] }), cell("panel"), cell("panel")],
    [cell("panel"), cell("panel"), cell("letter", { char: "Р", slotIds: [1], directions: ["down"] }), cell("panel"), cell("letter", { char: "М", slotIds: [2], directions: ["down"] }), cell("panel")],
    [cell("panel"), cell("panel"), cell("panel"), cell("letter", { char: "Т", slotIds: [4], directions: ["right"] }), cell("panel"), cell("panel")],
    [cell("panel"), cell("panel"), cell("panel"), cell("panel"), cell("panel"), cell("panel")],
  ],
  placed: anchors,
  clueFootprints: [],
};
const previousStates = [{
  ...structural,
  grid: structural.grid,
  placed: [{ id: 20, answer: "ПРЕЖНИЙ", direction: "right", clueRow: 4, clueCol: 0, cells: [] }],
}];
const entries = [
  { answer: "ГРОМ", clue: "Звук грозы", hasExactClue: true, weakFill: false, lexicalQuality: 95 },
  { answer: "КОТ", clue: "Домашнее животное", hasExactClue: true, weakFill: false, lexicalQuality: 90 },
  { answer: "КИТ", clue: "Морское млекопитающее", hasExactClue: true, weakFill: false, lexicalQuality: 90 },
];

window.ScanwordClosedFill = {
  extractResidualRegions: () => [{ id: 1, size: 1, cells: [{ row: 2, col: 3 }], boundaryWords: [1, 2, 3, 4] }],
  buildPatternIndex(pool) {
    const byLength = new Map();
    for (const entry of pool) {
      if (!byLength.has(entry.answer.length)) byLength.set(entry.answer.length, []);
      byLength.get(entry.answer.length).push(entry);
    }
    return { byLength };
  },
  queryPattern(index, pattern, usedAnswers, telemetry) {
    telemetry.lookups += 1;
    return (index.byLength.get(pattern.length) || []).filter((entry) => {
      telemetry.checks += 1;
      if (usedAnswers.has(entry.answer)) return false;
      return pattern.every((char, position) => !char || char === entry.answer[position]);
    });
  },
  measureCoverage: coverage,
};
window.ScanwordSolver = {
  generateTargetedVictimVariants: () => ({ states: previousStates, telemetry: { statesAccepted: previousStates.length } }),
  stripClueLayoutForTargetedVictim: () => structural,
  resultMetrics(state) {
    const direct = state.placed.filter((word) => word.answer === "ГРОМ" || word.answer === "КОТ");
    return {
      validation: { valid: direct.length === 2 },
      components: direct.length === 2 ? 1 : 4,
    };
  },
};
window.SCANWORD_TARGETED_SHORT_FILL = [];

require(path.resolve(__dirname, "..", "construction-victim-targeted-cross.js"));
const result = window.ScanwordSolver.generateTargetedVictimVariants(structural, entries, {
  directCrossRegions: 2,
  directCrossDomain: 4,
  directCrossCandidateSlots: 6,
  directCrossMaxLength: 6,
  directCrossMaxNewPanels: 2,
  directCrossMaxVariants: 4,
  directCrossFinalists: 2,
});
const direct = result.states.find((state) => state.targetedVictimMeta?.directCross);
assert.ok(direct, "a safe neighboring panel must extend the empty three-letter pattern to a valid four-letter answer");
assert.deepEqual(direct.targetedVictimMeta.pairAnswers, ["ГРОМ", "КОТ"]);
assert.equal(direct.targetedVictimMeta.horizontalPattern, "?Р?М");
assert.equal(direct.targetedVictimMeta.verticalPattern, "К?Т");
assert.equal(direct.grid[2][1].type, "letter");
assert.equal(direct.grid[2][1].char, "Г");
assert.equal(direct.grid[2][3].type, "letter");
assert.equal(direct.grid[2][3].char, "О");
assert.deepEqual(new Set(direct.grid[2][3].directions), new Set(["right", "down"]));
assert.equal(result.states.length, 2, "the previous finalist and reserved direct-cross finalist must both survive");
assert.equal(result.telemetry.directCross.junctionRegions, 1);
assert.ok(result.telemetry.directCross.horizontalSlots >= 1);
assert.ok(result.telemetry.directCross.verticalSlots >= 1);
assert.ok(result.telemetry.directCross.slotPairsBuilt >= 1);
assert.ok(result.telemetry.directCross.characterPairsMatched >= 1);
assert.equal(result.telemetry.directCross.statesAccepted, 1);
assert.equal(result.telemetry.directCross.finalistsReserved, 1);
assert.ok(result.telemetry.directCross.emptyPatterns.includes("Р?М"), "the unextended three-letter pattern should remain diagnosed as empty");

console.log(JSON.stringify({
  directCross: true,
  extendedPattern: direct.targetedVictimMeta.horizontalPattern,
  target: direct.targetedVictimMeta.targetCell,
  pairAnswers: direct.targetedVictimMeta.pairAnswers,
  structuralPanelGain: direct.targetedVictimMeta.structuralPanelGain,
  panelsAfter: coverage(direct.grid).panelCells,
  telemetry: result.telemetry.directCross,
}));
