"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;

let panelCells = 4;
let capturedOptions = null;

function generatedResult() {
  return {
    rows: 2,
    cols: 2,
    grid: [
      [{ type: "panel", char: null, slotIds: [], directions: [], clues: [] }, { type: "panel", char: null, slotIds: [], directions: [], clues: [] }],
      [{ type: "panel", char: null, slotIds: [], directions: [], clues: [] }, { type: "panel", char: null, slotIds: [], directions: [], clues: [] }],
    ],
    placed: [],
    pool: [],
    attempt: 0,
    panelCells,
    letterCells: 0,
    clueTextCells: 0,
    externalClueTexts: 0,
    intersections: 0,
    constructionV2: {},
    coverageCheckpoint: {
      minimumAnswers: 0,
      minimumActive: 0,
      minimumAnswerCoverage: 0,
      minimumClueTextCells: 0,
      minimumExternalClues: 0,
      maximumPanels: 20,
      requiredComponents: 1,
    },
  };
}

window.SCANWORD_TARGETED_SHORT_FILL = [];
window.ScanwordClosedFill = {
  measureCoverage: () => ({
    activeCoverage: 0,
    answerSpaceCoverage: 0,
    rawLetterCoverage: 0,
    letterCells: 0,
    panelCells,
    totalCells: 4,
  }),
};
window.ScanwordCore = {
  makeRandom: () => () => 0.5,
};
window.ScanwordSolver = {
  __constructionTargetedDemandInstalled: true,
  generateBest: () => generatedResult(),
  generateTargetedVictimVariants: (_result, _pool, options) => {
    capturedOptions = { ...options };
    return { states: [], telemetry: { statesAccepted: 0 } };
  },
  assignClueTextCellsV2: () => ({ externalClueTexts: 0, clueTextCells: 0 }),
  attachValidationReport: (result) => result,
  resultMetrics: () => ({ validation: { valid: true }, components: 1 }),
};

process.env.SCANWORD_CONSTRUCTION_MODE = "portfolio";
delete process.env.SCANWORD_ZERO_PANEL_PASS;
delete process.env.SCANWORD_TARGETED_EXACT_PANELS;

require(path.resolve(__dirname, "..", "construction-victim-targeted-exact.js"));

const defaultResult = window.ScanwordSolver.generateBest("zero-panel-fixture", 0, 2, 2, 0, 0);
assert.equal(defaultResult.constructionV2.targetedExactVictim.attempted, false);
assert.equal(defaultResult.constructionV2.targetedExactVictim.thresholdPanels, 8);
assert.equal(capturedOptions, null, "default checkpoint mode must not search below nine panels");

process.env.SCANWORD_ZERO_PANEL_PASS = "on";
const zeroPanelResult = window.ScanwordSolver.generateBest("zero-panel-fixture", 0, 2, 2, 0, 0);
const telemetry = zeroPanelResult.constructionV2.targetedExactVictim;
assert.equal(telemetry.attempted, true);
assert.equal(telemetry.profile, "zero-panel-small-tail");
assert.equal(telemetry.thresholdPanels, 0);
assert.equal(telemetry.zeroPanelPass, true);
assert.ok(capturedOptions, "zero-panel mode must invoke structural search");
assert.equal(capturedOptions.maxRegions, 1);
assert.equal(capturedOptions.maxVictimsPerRegion, 2);
assert.equal(capturedOptions.depth, 1);
assert.equal(capturedOptions.beamWidth, 3);
assert.equal(capturedOptions.branching, 8);
assert.equal(capturedOptions.maxVariants, 2);
assert.equal(capturedOptions.maxSlotCandidates, 120);
assert.equal(capturedOptions.maxDomainSize, 64);
assert.equal(capturedOptions.maxSlots, 20);
assert.equal(capturedOptions.valuesPerSlot, 2);
assert.equal(capturedOptions.maxMoves, 18);
assert.equal(capturedOptions.clueRestarts, 60);
assert.equal(capturedOptions.repackNodes, 30000);
assert.equal(capturedOptions.repackCandidates, 12);
assert.equal(capturedOptions.repackBranch, 8);

panelCells = 0;
capturedOptions = null;
const completeResult = window.ScanwordSolver.generateBest("zero-panel-complete", 0, 2, 2, 0, 0);
assert.equal(completeResult.constructionV2.targetedExactVictim.attempted, false);
assert.equal(capturedOptions, null, "an already complete grid must not be searched");

console.log(JSON.stringify({
  defaultThresholdPreserved: true,
  zeroPanelPassAttempted: true,
  smallTailProfile: telemetry.profile,
  budgets: telemetry.budgets,
  completeGridSkipped: true,
}));
