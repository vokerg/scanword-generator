"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
global.window = global;
process.env.SCANWORD_CONSTRUCTION_MODE = "portfolio";
process.env.SCANWORD_TARGETED_VICTIM_PANELS = "1";

function cell(type, extra = {}) {
  return { type, char: null, slotIds: [], directions: [], clues: [], ...extra };
}

function coverage(grid) {
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

const pool = [
  { answer: "ЯК", clue: "Тибетский бык", hasExactClue: true, lexicalQuality: 60 },
  { answer: "КОТ", clue: "Домашнее животное", hasExactClue: true, lexicalQuality: 70 },
];
const victim = {
  id: 1,
  answer: "ЯК",
  clue: "Тибетский бык",
  hasExactClue: true,
  direction: "right",
  clueRow: 0,
  clueCol: 0,
  startRow: 0,
  startCol: 1,
  cells: [{ row: 0, col: 1 }, { row: 0, col: 2 }],
};
const base = {
  rows: 2,
  cols: 4,
  pool,
  grid: [
    [
      cell("clue", { clues: [{ slotId: 1, direction: "right", text: "Тибетский бык", answer: "ЯК" }] }),
      cell("letter", { char: "Я", slotIds: [1], directions: ["right"] }),
      cell("letter", { char: "К", slotIds: [1], directions: ["right"] }),
      cell("panel"),
    ],
    [cell("panel"), cell("panel"), cell("panel"), cell("panel")],
  ],
  placed: [victim],
  clueFootprints: [],
  panelCells: 5,
  letterCells: 2,
  clueTextCells: 0,
  externalClueTexts: 0,
  intersections: 0,
  doubles: 0,
  fillRatio: 3 / 8,
  answerCoverage: 2 / 7,
  rawLetterCoverage: 2 / 8,
  components: 1,
  validation: { valid: true },
  attempt: 0,
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
};

window.ScanwordCore = { makeRandom: () => () => 0.5 };
window.ScanwordClosedFill = {
  measureCoverage: coverage,
  buildPatternIndex: () => ({}),
  extractResidualRegions: () => [{
    id: 1,
    cells: [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 }],
    boundaryCells: [],
    boundaryWords: [1],
    size: 4,
    difficulty: 1,
  }],
  enumerateRegionSlots(state, region, index, used, options, telemetry) {
    telemetry.lookups += 1;
    telemetry.checks += 1;
    return [{
      signature: "right:1,0:1,1:3",
      clueRow: 1,
      clueCol: 0,
      clueKey: "1:0",
      direction: "right",
      startRow: 1,
      startCol: 1,
      length: 3,
      cells: [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 }],
      regionLetterKeys: ["1:1", "1:2", "1:3"],
      existingIntersections: 1,
      baseDomain: [pool[1]],
    }];
  },
};
window.ScanwordSolver = {
  generateBest: () => base,
  rollbackInlineWord() {
    return {
      ...base,
      grid: [
        [cell("panel"), cell("panel"), cell("panel"), cell("panel")],
        [cell("panel"), cell("panel"), cell("panel"), cell("panel")],
      ],
      placed: [],
      clueFootprints: [],
    };
  },
  resultMetrics(state) {
    const measured = coverage(state.grid);
    return {
      score: 0,
      intersections: 0,
      doubles: 0,
      components: 1,
      panelRegions: measured.panelCells ? 1 : 0,
      isolatedPanels: 0,
      largestPanelRegion: measured.panelCells,
      validation: { valid: true, accidentalRuns: [], conflicts: 0, orphanLetters: 0, clueDirectionConflicts: 0 },
    };
  },
  assignClueTextCellsV2(state) {
    state.clueFootprints = [];
    return { externalClueTexts: 0, clueTextCells: 0, footprints: [] };
  },
};

require(path.resolve(__dirname, "..", "construction-victim-targeted.js"));
const result = window.ScanwordSolver.generateBest("fixture", pool.length, 2, 4, 1, 0);
assert.equal(result.validation.valid, true);
assert.equal(result.panelCells, 4);
assert.equal(result.constructionV2.targetedVictim.attempted, true);
assert.equal(result.constructionV2.targetedVictim.accepted, true);
assert.equal(result.constructionV2.targetedVictim.selected.victimAnswer, "ЯК");
assert.ok(result.constructionV2.targetedVictim.search.victimsRolledBack > 0);
assert.ok(result.constructionV2.targetedVictim.search.bundlesTried > 0);
console.log(JSON.stringify({
  targetedVictimSearch: true,
  panelsBefore: 5,
  panelsAfter: result.panelCells,
  telemetry: result.constructionV2.targetedVictim.search,
}));
