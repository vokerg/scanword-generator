"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function clearModule(file) {
  delete require.cache[require.resolve(path.join(root, file))];
}

function constructionCandidate(attempt, panels, letters, weakCount, clueTextCells, crossings, answers) {
  return {
    attempt,
    panelCells: panels,
    letterCells: letters,
    placed: Array.from({ length: answers }, (_, index) => ({
      answer: index < weakCount ? `WEAK-${attempt}-${index}` : `STRONG-${attempt}-${index}`,
      hasExactClue: true,
    })),
    clueTextCells,
    externalClueTexts: 24,
    intersections: crossings,
    partialSearchVariant: "default",
  };
}

function testConstructionFrontier() {
  global.window = global;
  global.ScanwordClosedFill = {};
  global.ScanwordCore = {};
  global.ScanwordSolver = { generateBest() {} };
  clearModule("construction-portfolio.js");
  require(path.join(root, "construction-portfolio.js"));

  const entries = [];
  for (let index = 0; index < 60; index += 1) {
    entries.push({ answer: `STRONG-${index}`, weakFill: false });
    entries.push({ answer: `WEAK-${index}`, weakFill: true });
  }
  const poolByAnswer = new Map(entries.map((entry) => [entry.answer, entry]));
  const baseline = constructionCandidate(0, 3, 20, 0, 45, 50, 47);
  const clueTradeoff = constructionCandidate(1, 3, 19, 0, 42, 49, 46);
  const dominated = constructionCandidate(2, 4, 18, 1, 50, 40, 40);
  const selected = global.ScanwordSolver.selectCompletePipelineFrontierV1(
    [baseline, clueTradeoff, dominated],
    poolByAnswer,
    3,
  );

  assert.equal(selected.candidates[0], baseline);
  assert.equal(selected.candidates.includes(clueTradeoff), true);
  assert.equal(selected.candidates.includes(dominated), false);
  assert.equal(selected.telemetry.baselinePreserved, true);
  assert.equal(selected.telemetry.rejected.some((entry) => entry.reason === "dominated"), true);
}

function fixture(attempt, panels, answers) {
  const placed = Array.from({ length: answers }, (_, index) => ({
    id: index + 1,
    answer: `W${attempt}-${index}`,
    clue: "Fixture",
    hasExactClue: true,
    cells: [],
  }));
  return {
    rows: 2,
    cols: 3,
    grid: [
      Array.from({ length: 3 }, () => ({ type: "panel", clues: [], slotIds: [], directions: [] })),
      Array.from({ length: 3 }, () => ({ type: "letter", char: "А", clues: [], slotIds: [], directions: [] })),
    ],
    placed,
    pool: placed.map((entry) => ({ answer: entry.answer, clue: entry.clue })),
    clueFootprints: [],
    panelCells: panels,
    letterCells: 6 - panels,
    intersections: answers,
    externalClueTexts: 24,
    clueTextCells: 45,
    fillRatio: 0.9,
    answerCoverage: 0.7,
    rawLetterCoverage: (6 - panels) / 6,
    components: 1,
    validation: { valid: true },
    attempt,
    partialSearchVariant: "default",
    coverageCheckpoint: {
      minimumAnswers: 1,
      minimumActive: 0,
      minimumAnswerCoverage: 0,
      minimumClueTextCells: 0,
      minimumExternalClues: 0,
      maximumPanels: 10,
      requiredComponents: 1,
    },
    constructionV2: { mode: "portfolio-panel-first-v2" },
  };
}

function testCompletePipelineSelection() {
  const calls = [];
  const baseline = fixture(0, 3, 2);
  const alternative = fixture(1, 4, 3);
  Object.defineProperty(baseline, "__completePipelineFrontierV1", {
    value: {
      schemaVersion: 1,
      candidates: [baseline, alternative],
      telemetry: {
        members: [
          { provenance: { sourceIndex: 0, attempt: 0 } },
          { provenance: { sourceIndex: 1, attempt: 1 } },
        ],
      },
    },
  });

  global.window = global;
  global.ScanwordCore = { makeRandom: () => () => 0.5 };
  global.ScanwordClosedFill = {
    measureCoverage() {
      return {
        panelCells: 0,
        letterCells: 6,
        totalCells: 6,
        activeCoverage: 1,
        answerSpaceCoverage: 1,
        rawLetterCoverage: 1,
      };
    },
  };
  global.ScanwordEditorialLexicalPolicyV3 = {
    summarize: () => ({ formulaicShortCount: 0, editorialPenalty: 0 }),
  };
  global.ScanwordSolver = {
    generateBest() { return fixture(99, 9, 1); },
    generatePortfolio() { calls.push("portfolio"); return baseline; },
    polishPortfolioResult(result) {
      calls.push(`polish-${result.attempt}`);
      if (result.attempt === 1) {
        result.panelCells = 2;
        result.letterCells = 4;
        result.rawLetterCoverage = 4 / 6;
      }
      return result;
    },
    repackClueFootprints: (result) => result,
    adaptiveRepackClueFootprints: (result) => result,
    absorbResidualPanels: (result) => result,
    reflowClueFootprints: (result) => result,
    pairReflowClueFootprints: (result) => result,
    generateTargetedVictimVariants: () => ({ states: [], telemetry: {} }),
    cloneVictimState: (state) => state,
    assignClueTextCellsV2: () => ({ externalClueTexts: 24, clueTextCells: 45 }),
    applyEditorialRepairV3: (result) => result,
    generateLegacySingleCandidateV2() { calls.push("legacy"); return fixture(99, 9, 1); },
    resultMetrics(result) {
      return {
        validation: { valid: true },
        components: 1,
        score: result.placed.length,
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
  process.env.SCANWORD_COMPLETE_PIPELINE_FRONTIER = "on";
  clearModule("construction-stage-runtime-v2.js");
  require(path.join(root, "construction-stage-runtime-v2.js"));

  const result = global.ScanwordSolver.generateExplicitSingleCandidateV2("fixture", 1, 2, 3, 1, 27);
  assert.equal(result.attempt, 1);
  assert.equal(result.panelCells, 2);
  assert.equal(result.constructionV2.completePipelineFrontier.selectionChanged, true);
  assert.equal(result.constructionV2.completePipelineFrontier.exactBaselinePreserved, true);
  assert.equal(calls.filter((entry) => entry === "legacy").length, 1);
  assert.deepEqual(
    result.constructionV2.explicitStageRuntime.stages.map((stage) => stage.name),
    ["construction-portfolio", "complete-pipeline-frontier"],
  );
}

try {
  testConstructionFrontier();
  testCompletePipelineSelection();
  console.log(JSON.stringify({ passed: true }));
} finally {
  delete process.env.SCANWORD_COMPLETE_PIPELINE_FRONTIER;
  delete process.env.SCANWORD_CONSTRUCTION_MODE;
  delete process.env.SCANWORD_EDITORIAL_REPAIR;
}
