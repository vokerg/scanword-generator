"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

global.window = global;
const calls = [];

function fixture() {
  return {
    rows: 2,
    cols: 3,
    grid: [
      [{ type: "clue", clues: [], slotIds: [], directions: [] }, { type: "letter", char: "А", clues: [], slotIds: [1], directions: ["right"] }, { type: "letter", char: "Б", clues: [], slotIds: [1], directions: ["right"] }],
      [{ type: "panel", clues: [], slotIds: [], directions: [] }, { type: "panel", clues: [], slotIds: [], directions: [] }, { type: "panel", clues: [], slotIds: [], directions: [] }],
    ],
    placed: [{ id: 1, answer: "АБ", clue: "Тест", hasExactClue: true, cells: [{ row: 0, col: 1 }, { row: 0, col: 2 }] }],
    pool: [{ answer: "АБ", clue: "Тест" }],
    clueFootprints: [],
    panelCells: 3,
    letterCells: 2,
    intersections: 0,
    externalClueTexts: 0,
    clueTextCells: 0,
    fillRatio: 0.4,
    answerCoverage: 0.4,
    rawLetterCoverage: 0.4,
    components: 1,
    validation: { valid: true },
    mode: "portfolio-panel-first-v2",
    attempt: 0,
    coverageCheckpoint: {
      minimumAnswers: 1,
      minimumActive: 0,
      minimumAnswerCoverage: 0,
      minimumClueTextCells: 0,
      minimumExternalClues: 0,
      maximumPanels: 10,
      requiredComponents: 1,
    },
  };
}

global.ScanwordCore = { makeRandom: () => () => 0.5 };
global.ScanwordClosedFill = {
  measureCoverage(grid) {
    const flat = grid.flat();
    const panelCells = flat.filter((cell) => cell.type === "panel").length;
    const letterCells = flat.filter((cell) => cell.type === "letter").length;
    return {
      panelCells,
      letterCells,
      totalCells: flat.length,
      activeCoverage: letterCells / flat.length,
      answerSpaceCoverage: letterCells / Math.max(1, flat.length - 1),
      rawLetterCoverage: letterCells / flat.length,
    };
  },
};
global.ScanwordSolver = {
  generateBest() { calls.push("legacy-source"); return fixture(); },
  generatePortfolio() { calls.push("construction-portfolio"); return fixture(); },
  polishPortfolioResult(result) { calls.push("portfolio-polish"); return result; },
  repackClueFootprints(result) { calls.push("clue-repack"); return result; },
  adaptiveRepackClueFootprints(result) { calls.push("adaptive-clue-repack"); return result; },
  absorbResidualPanels(result) { calls.push("clue-tail-absorption"); return result; },
  reflowClueFootprints(result) { calls.push("clue-reflow"); return result; },
  pairReflowClueFootprints(result) { calls.push("clue-pair-reflow"); return result; },
  generateTargetedVictimVariants() { calls.push("targeted-search"); return { states: [], telemetry: {} }; },
  cloneVictimState(state) { return state; },
  assignClueTextCellsV2() { return { externalClueTexts: 0, clueTextCells: 0 }; },
  applyEditorialRepairV3(result) { calls.push("editorial-repair"); return result; },
  resultMetrics(result) {
    return {
      validation: result.validation,
      components: result.components,
      score: 0,
      intersections: result.intersections,
      doubles: 0,
      panelRegions: 1,
      isolatedPanels: 0,
      largestPanelRegion: result.panelCells,
    };
  },
};

process.env.SCANWORD_CONSTRUCTION_MODE = "portfolio";
process.env.SCANWORD_EDITORIAL_REPAIR = "on";
require(path.join(root, "construction-stage-source-anchor-v2.js"));
require(path.join(root, "construction-stage-runtime-v2.js"));

const result = global.ScanwordSolver.generateExplicitSingleCandidateV2("fixture", 1, 2, 3, 1, 27);
assert.equal(result.validation.valid, true);
assert.deepEqual(
  result.constructionV2.explicitStageRuntime.stages.map((stage) => stage.name),
  [
    "construction-portfolio",
    "portfolio-polish",
    "clue-repack",
    "adaptive-clue-repack",
    "clue-tail-absorption",
    "clue-reflow",
    "clue-pair-reflow",
    "targeted-victim-repair",
    "baseline-guard",
    "editorial-repair",
  ],
);
assert.deepEqual(calls, [
  "construction-portfolio",
  "portfolio-polish",
  "clue-repack",
  "adaptive-clue-repack",
  "clue-tail-absorption",
  "clue-reflow",
  "clue-pair-reflow",
  "legacy-source",
  "editorial-repair",
]);
assert.equal(global.ScanwordSolver.__constructionStageSourceAnchorV2Installed, true);
assert.equal(global.ScanwordSolver.__constructionStageRuntimeV2Installed, true);
console.log(JSON.stringify({ passed: true, calls, stages: result.constructionV2.explicitStageRuntime.stages.length }));
