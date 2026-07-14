"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;
process.env.SCANWORD_CONSTRUCTION_MODE = "portfolio";
process.env.SCANWORD_TARGETED_EXACT_PANELS = "1";

function cell(type, extra = {}) {
  return { type, char: null, slotIds: [], directions: [], clues: [], ...extra };
}

function measured(grid) {
  const cells = grid.flat();
  const totalCells = cells.length;
  const letterCells = cells.filter((item) => item.type === "letter").length;
  const clueCells = cells.filter((item) => item.type === "clue").length;
  const clueTextCells = cells.filter((item) => item.type === "clueText" || item.type === "clueTextContinuation").length;
  const panelCells = cells.filter((item) => item.type === "panel").length;
  return {
    totalCells,
    letterCells,
    clueCells,
    clueTextCells,
    panelCells,
    activeCoverage: (letterCells + clueCells + clueTextCells) / totalCells,
    answerSpaceCoverage: letterCells / Math.max(1, totalCells - clueCells - clueTextCells),
    rawLetterCoverage: letterCells / totalCells,
  };
}

const entry = { answer: "КОТ", clue: "Домашнее животное", hasExactClue: true, lexicalQuality: 70 };
const base = {
  rows: 2,
  cols: 4,
  pool: [entry],
  grid: [
    [cell("clue"), cell("letter", { char: "К", slotIds: [1], directions: ["right"] }), cell("letter", { char: "О", slotIds: [1], directions: ["right"] }), cell("panel")],
    [cell("panel"), cell("panel"), cell("panel"), cell("panel")],
  ],
  placed: [{ id: 1, answer: "КО", clue: "Фрагмент", hasExactClue: true, direction: "right", cells: [{ row: 0, col: 1 }, { row: 0, col: 2 }] }],
  clueFootprints: [],
  panelCells: 5,
  letterCells: 2,
  clueTextCells: 0,
  externalClueTexts: 0,
  intersections: 0,
  fillRatio: 3 / 8,
  answerCoverage: 2 / 7,
  rawLetterCoverage: 2 / 8,
  components: 1,
  validation: { valid: true },
  attempt: 0,
  mode: "portfolio-panel-first-v2",
  coverageCheckpoint: {
    passed: true,
    minimumAnswers: 1,
    minimumActive: 0,
    minimumAnswerCoverage: 0,
    minimumClueTextCells: 0,
    minimumExternalClues: 0,
    maximumPanels: 8,
    requiredComponents: 1,
  },
  constructionV2: {},
  closedFill: {},
};
const structural = {
  ...base,
  grid: [
    [cell("clue"), cell("letter", { char: "К", slotIds: [2], directions: ["right"] }), cell("letter", { char: "О", slotIds: [2], directions: ["right"] }), cell("letter", { char: "Т", slotIds: [2], directions: ["right"] })],
    [cell("panel"), cell("panel"), cell("panel"), cell("panel")],
  ],
  placed: [{ id: 2, ...entry, direction: "right", cells: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }] }],
  targetedVictimMeta: { victimAnswer: "КО", regionId: 1, depth: 1 },
};

window.ScanwordCore = { makeRandom: () => () => 0.5 };
window.ScanwordClosedFill = { measureCoverage: measured };
window.ScanwordSolver = {
  generateBest: () => base,
  generateTargetedVictimVariants: () => ({
    states: [structural],
    telemetry: { regionsConsidered: 1, victimsRolledBack: 1, statesAccepted: 1 },
  }),
  assignClueTextCellsV2(state) {
    state.clueFootprints = [];
    return { externalClueTexts: 0, clueTextCells: 0, footprints: [] };
  },
  resultMetrics(state) {
    const coverage = measured(state.grid);
    return {
      score: 0,
      intersections: 0,
      doubles: 0,
      components: 1,
      clueTextCells: coverage.clueTextCells,
      panelRegions: coverage.panelCells ? 1 : 0,
      isolatedPanels: 0,
      largestPanelRegion: coverage.panelCells,
      validation: { valid: true, accidentalRuns: [], conflicts: 0, orphanLetters: 0, clueDirectionConflicts: 0 },
    };
  },
  attachValidationReport(result) { return result; },
  polishPortfolioResult(result) { return result; },
  repackClueFootprints(result) { return result; },
  adaptiveRepackClueFootprints(result) { return result; },
  absorbResidualPanels(result) { return result; },
  reflowClueFootprints(result) { return result; },
  pairReflowClueFootprints(result) { return result; },
};

require(path.resolve(__dirname, "..", "construction-victim-targeted-exact.js"));
const result = window.ScanwordSolver.generateBest("fixture", 1, 2, 4, 1, 0);
assert.equal(result.validation.valid, true);
assert.equal(result.panelCells, 4);
assert.equal(result.constructionV2.targetedExactVictim.attempted, true);
assert.equal(result.constructionV2.targetedExactVictim.accepted, true);
assert.equal(result.constructionV2.targetedExactVictim.selected.victimAnswer, "КО");
assert.equal(result.constructionV2.targetedExactVictim.finalistsPassingCheckpoint, 1);
assert.equal(result.constructionV2.targetedExactVictim.exactImprovingFinalists, 1);
assert.equal(result.constructionV2.targetedExactVictim.stageRuns.repack, 1);
console.log(JSON.stringify({
  targetedExactPostprocess: true,
  panelsBefore: 5,
  panelsAfter: result.panelCells,
  stages: result.constructionV2.targetedExactVictim.stageRuns,
}));
